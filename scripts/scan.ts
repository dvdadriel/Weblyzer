import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getDb, closeDb } from '../lib/db.ts'
import { LANGKAH, situsTerjadwal, pemicuDari } from '../lib/jadwal.ts'
import { createSite, listSites, getSite } from '../lib/repos/sites.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { enqueue, requeueInterrupted } from '../lib/queue.ts'
import { drainQueue } from '../lib/runner.ts'
import { scanHandler } from '../lib/jobs/scan.ts'
import { listPages } from '../lib/repos/pages.ts'
import { lighthouseHandler } from '../lib/jobs/lighthouse.ts'
import { ringkasanHandler } from '../lib/jobs/ringkasan.ts'
import { penyediaTerpilih } from '../lib/ai/penyedia.ts'
import { skorTerakhir } from '../lib/repos/lighthouse.ts'

const HANDLERS = {
  scan: scanHandler,
  lighthouse: lighthouseHandler,
  ringkasan: ringkasanHandler,
}

const PEMICU = pemicuDari(process.env)

/**
 * Menjalankan perintah ini sendiri sebagai proses anak dan menunggunya habis.
 *
 * Satu proses per situs, bukan satu proses untuk semalam. Alasannya bukan
 * kecepatan — ini justru sedikit lebih lambat — tapi supaya satu situs yang
 * menjatuhkan prosesnya (Chromium kehabisan memori, rejection tak tertangkap)
 * tidak ikut membatalkan situs yang belum kebagian. Pemindaian tengah malam
 * tidak ada yang menonton; kegagalan yang menular akan terlihat sebagai "tidak
 * ada yang dipindai" esok paginya.
 */
function jalankanAnak(argv: string[]): Promise<number> {
  const script = fileURLToPath(import.meta.url)
  return new Promise((resolve) => {
    const anak = spawn(process.execPath, [script, ...argv], {
      stdio: 'inherit',
      env: { ...process.env, WEBLYZER_TRIGGER: 'scheduled' },
    })
    // Spawn yang gagal memancarkan 'error'; tanpa cabang ini promise-nya
    // menggantung dan seluruh jadwal berhenti di situs pertama.
    anak.on('error', (err) => {
      console.error(`Gagal menjalankan proses anak: ${err.message}`)
      resolve(1)
    })
    anak.on('close', (code) => resolve(code ?? 1))
  })
}

const USAGE = `Penggunaan:
  npm run scan -- add-site <nama> <url>      Menambahkan situs
  npm run scan -- list                       Menampilkan semua situs
  npm run scan -- scan <site-id> [kategori]  Memindai situs (kategori: bugs|console|security|seo)
  npm run scan -- pages <site-id>            Menampilkan halaman tersimpan
  npm run scan -- findings <site-id>         Menampilkan temuan terbuka
  npm run scan -- lighthouse <site-id>       Mengukur skor Lighthouse
  npm run scan -- scores <site-id>           Menampilkan skor terakhir
  npm run scan -- jadwal                     Memindai semua situs aktif (untuk cron)`

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2)
  const db = getDb()

  switch (command) {
    case 'add-site': {
      const [name, url] = args
      if (!name || !url) {
        console.error(USAGE)
        return 1
      }
      const site = createSite(db, { name, base_url: url })
      console.log(`Situs ${site.id} dibuat: ${site.name} — ${site.base_url}`)
      return 0
    }

    case 'list': {
      const sites = listSites(db)
      if (sites.length === 0) console.log('Belum ada situs.')
      for (const s of sites) console.log(`${s.id}\t${s.name}\t${s.base_url}`)
      return 0
    }

    case 'jadwal': {
      const sites = situsTerjadwal(db)
      if (sites.length === 0) {
        // Bukan sukses dan bukan galat: tidak ada yang diminta dikerjakan.
        // Dibedakan dari "semua dipindai dan bersih" — §2.2 berlaku di sini
        // juga, nol situs bukan nol masalah.
        console.log('Tidak ada situs yang aktif. Tidak ada yang dipindai.')
        return 0
      }

      console.log(
        `Jadwal: ${sites.length} situs aktif — ${sites.map((s) => s.name).join(', ')}`,
      )

      const gagal: string[] = []
      for (const site of sites) {
        for (const langkah of LANGKAH) {
          console.log('')
          console.log(`── ${site.name} (${site.id}) — ${langkah}`)
          const code = await jalankanAnak([langkah, String(site.id)])
          if (code !== 0) gagal.push(`${site.name}/${langkah}`)
        }
      }

      console.log('')
      const total = sites.length * LANGKAH.length
      console.log(`Jadwal selesai: ${total - gagal.length} dari ${total} langkah berhasil.`)
      if (gagal.length > 0) {
        console.error(`Gagal: ${gagal.join(', ')}`)
        // Keluar non-nol supaya cron punya sesuatu untuk dilaporkan. Sampai
        // notifikasi email dibangun, MAILTO di crontab adalah satu-satunya
        // kabar yang datang sendiri saat browser tertutup.
        return 1
      }
      return 0
    }

    case 'pages': {
      const siteId = Number(args[0])
      const site = getSite(db, siteId)
      if (!site) {
        console.error(`Situs ${args[0]} tidak ditemukan.`)
        return 1
      }

      const pages = listPages(db, siteId)
      for (const p of pages) console.log(`${p.status_code}\t${p.load_ms}ms\t${p.url}`)
      console.log(`${pages.length} halaman.`)
      return 0
    }

    case 'scan': {
      const siteId = Number(args[0])
      const site = getSite(db, siteId)
      if (!site) {
        console.error(`Situs ${args[0]} tidak ditemukan.`)
        return 1
      }
      const only = args[1]
      // `as const` plus predikat, bukan `includes` biasa: `includes` pada
      // array string tidak mempersempit tipe, jadi `only` tetap `string` dan
      // `createRun` menerima nilai yang RunType tidak mengenal.
      const KATEGORI_CLI = ['bugs', 'console', 'security', 'seo'] as const
      type KategoriCli = (typeof KATEGORI_CLI)[number]
      const dikenal = (k: string): k is KategoriCli =>
        (KATEGORI_CLI as readonly string[]).includes(k)

      if (only !== undefined && !dikenal(only)) {
        console.error(`Kategori tidak dikenal: ${only}. Pilih ${KATEGORI_CLI.join(', ')}.`)
        return 1
      }
      const kategori: KategoriCli | undefined = only === undefined ? undefined : (only as KategoriCli)

      // Hanya perintah yang memang menjalankan job yang boleh mengubah antrian.
      // Bila ini dijalankan pada setiap perintah, `list` di terminal lain akan
      // mengembalikan job yang sedang berjalan menjadi 'queued' dan proses
      // ketiga dapat mengklaim ulang pemindaian yang masih berlangsung.
      requeueInterrupted(db)

      // Tipe run mengikuti kategori yang diminta. Sebelumnya selalu 'full'
      // walau cuma satu analyzer yang dijalankan, dan kebohongan itu menular:
      // UI membaca tipe run untuk memberi nama pemindaian yang berjalan, jadi
      // "Scan Bug" muncul sebagai "memindai full" dan terbaca seolah ketiga
      // kategori sedang ditimpa.
      const run = createRun(db, site.id, kategori ?? 'full', PEMICU)
      enqueue(db, {
        runId: run.id,
        type: 'scan',
        payload: kategori === undefined ? { siteId: site.id } : { siteId: site.id, only: kategori },
      })

      // Ringkasan ikut diantrikan hanya bila ada penyedia terpilih. Antrian
      // dikuras berurutan, jadi job ini pasti jalan setelah pemindaiannya —
      // dan membaca temuan yang baru saja direkonsiliasi, bukan yang lama.
      if (penyediaTerpilih(db) !== null) {
        enqueue(db, { runId: run.id, type: 'ringkasan', payload: { siteId: site.id } })
      }
      console.log(`Run ${run.id}: memindai ${site.base_url} ...`)

      const summary = await drainQueue(db, HANDLERS, { concurrency: 1 })

      // drainQueue menguras antrian GLOBAL, jadi job sisa dari run lama ikut
      // terhitung di summary. Status run ini harus ditentukan oleh job milik
      // run ini sendiri — bukan oleh pekerjaan orang lain.
      const own = db
        .prepare(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
           FROM jobs WHERE run_id = ?`,
        )
        .get(run.id) as { total: number; failed: number | null }
      const ownFailed = Number(own.failed ?? 0)
      finishRun(db, run.id, ownFailed > 0 ? 'failed' : 'done')

      if (ownFailed > 0) {
        const err = db
          .prepare("SELECT error FROM jobs WHERE run_id = ? AND status = 'failed' LIMIT 1")
          .get(run.id) as { error: string } | undefined
        console.error(`Gagal: ${err?.error ?? 'tidak diketahui'}`)
        return 1
      }

      console.log(
        `Selesai — run ini: ${Number(own.total) - ownFailed} job berhasil, ${ownFailed} gagal.`,
      )
      console.log(`Antrian global terkuras: ${summary.done} berhasil, ${summary.failed} gagal.`)
      console.log(`Halaman tersimpan: ${listPages(db, site.id).length}`)

      const rekap = db
        .prepare(
          `SELECT category, severity, COUNT(*) AS n FROM findings
           WHERE site_id = ? AND status = 'open'
           GROUP BY category, severity ORDER BY category, severity`,
        )
        .all(site.id) as { category: string; severity: string; n: number }[]
      for (const r of rekap) console.log(`  ${r.category}/${r.severity}: ${r.n}`)
      return 0
    }

    case 'ringkasan': {
      const siteId = Number(args[0])
      const site = getSite(db, siteId)
      if (!site) {
        console.error(`Situs ${args[0]} tidak ditemukan.`)
        return 1
      }
      const penyedia = penyediaTerpilih(db)
      if (penyedia === null) {
        console.error('Belum ada penyedia AI yang dipilih. Buka halaman /model dulu.')
        return 1
      }

      requeueInterrupted(db)

      // Tipe `ringkasan`, bukan `full` maupun `seo`. `full` akan membuat
      // `waktuScanKategori` melaporkan keempat kategori baru dipindai padahal
      // tidak ada yang dipindai, dan `seo` adalah milik fitur SEO yang belum
      // dibangun — menyerobotnya sekarang berarti tabrakan nanti.
      const run = createRun(db, site.id, 'ringkasan')
      enqueue(db, { runId: run.id, type: 'ringkasan', payload: { siteId: site.id } })
      console.log(`Run ${run.id}: meringkas ${site.name} dengan ${penyedia} ...`)

      await drainQueue(db, HANDLERS, { concurrency: 1 })
      finishRun(db, run.id, 'done')

      const r = db
        .prepare(
          `SELECT ru.ai_status, ru.ai_error, rp.content
           FROM runs ru LEFT JOIN reports rp ON rp.run_id = ru.id
           WHERE ru.id = ?`,
        )
        .get(run.id) as { ai_status: string; ai_error: string | null; content: string | null }

      if (r.ai_status !== 'ok') {
        console.error(`AI ${r.ai_status}: ${r.ai_error ?? 'tanpa pesan'}`)
        return 1
      }
      console.log('')
      console.log(r.content)
      return 0
    }

    case 'findings': {
      const siteId = Number(args[0])
      const site = getSite(db, siteId)
      if (!site) {
        console.error(`Situs ${args[0]} tidak ditemukan.`)
        return 1
      }
      const rows = db
        .prepare(
          `SELECT category, severity, rule, title FROM findings
           WHERE site_id = ? AND status = 'open'
           ORDER BY category,
                    CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                                  WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
        )
        .all(site.id) as { category: string; severity: string; rule: string; title: string }[]
      for (const r of rows) {
        const judul = r.title.length > 110 ? `${r.title.slice(0, 107)}...` : r.title
        console.log(`${r.severity}\t${r.category}\t${r.rule}\t${judul}`)
      }
      console.log(`${rows.length} temuan terbuka.`)
      return 0
    }

    case 'lighthouse': {
      const siteId = Number(args[0])
      const site = getSite(db, siteId)
      if (!site) {
        console.error(`Situs ${args[0]} tidak ditemukan.`)
        return 1
      }

      requeueInterrupted(db)

      const run = createRun(db, site.id, 'lighthouse', PEMICU)
      enqueue(db, { runId: run.id, type: 'lighthouse', payload: { siteId: site.id } })
      console.log(
        `Run ${run.id}: mengukur ${site.base_url} (mode ${site.lighthouse_mode}, ` +
          `${site.lighthouse_strategy}) — sekitar 11 detik per halaman ...`,
      )

      const summary = await drainQueue(db, HANDLERS, { concurrency: 1 })

      const own = db
        .prepare(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
           FROM jobs WHERE run_id = ?`,
        )
        .get(run.id) as { total: number; failed: number | null }
      const ownFailed = Number(own.failed ?? 0)
      finishRun(db, run.id, ownFailed > 0 ? 'failed' : 'done')

      if (ownFailed > 0) {
        const err = db
          .prepare("SELECT error FROM jobs WHERE run_id = ? AND status = 'failed' LIMIT 1")
          .get(run.id) as { error: string } | undefined
        console.error(`Gagal: ${err?.error ?? 'tidak diketahui'}`)
        return 1
      }

      console.log(
        `Selesai — run ini: ${Number(own.total) - ownFailed} job berhasil, ${ownFailed} gagal.`,
      )
      console.log(`Antrian global terkuras: ${summary.done} berhasil, ${summary.failed} gagal.`)

      const skor = skorTerakhir(db, site.id)
      console.log(`${skor.length} pengukuran tersimpan.`)

      const rekap = db
        .prepare(
          `SELECT severity, COUNT(*) AS n FROM findings
           WHERE site_id = ? AND category = 'lighthouse' AND status = 'open'
           GROUP BY severity ORDER BY severity`,
        )
        .all(site.id) as { severity: string; n: number }[]
      for (const r of rekap) console.log(`  lighthouse/${r.severity}: ${r.n}`)
      return 0
    }

    case 'scores': {
      const siteId = Number(args[0])
      const site = getSite(db, siteId)
      if (!site) {
        console.error(`Situs ${args[0]} tidak ditemukan.`)
        return 1
      }
      const rows = skorTerakhir(db, site.id)
      if (rows.length === 0) {
        console.log('Belum ada pengukuran. Jalankan: npm run scan -- lighthouse ' + site.id)
        return 0
      }
      console.log('perf\ta11y\tbest\tseo\tstrategy\turl')
      for (const r of rows) {
        console.log(`${r.perf}\t${r.a11y}\t${r.best_practices}\t${r.seo}\t${r.strategy}\t${r.url}`)
      }
      console.log(`${rows.length} pengukuran.`)
      return 0
    }

    default:
      console.error(USAGE)
      return 1
  }
}

main()
  .then((code) => {
    closeDb()
    process.exit(code)
  })
  .catch((err: unknown) => {
    console.error(err)
    closeDb()
    process.exit(1)
  })
