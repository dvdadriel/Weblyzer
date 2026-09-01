import { getDb, closeDb } from '../lib/db.ts'
import { createSite, listSites, getSite } from '../lib/repos/sites.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { enqueue, requeueInterrupted } from '../lib/queue.ts'
import { drainQueue } from '../lib/runner.ts'
import { scanHandler } from '../lib/jobs/scan.ts'
import { listPages } from '../lib/repos/pages.ts'

const HANDLERS = { scan: scanHandler }

const USAGE = `Penggunaan:
  npm run scan -- add-site <nama> <url>      Menambahkan situs
  npm run scan -- list                       Menampilkan semua situs
  npm run scan -- scan <site-id> [kategori]  Memindai situs (kategori: bugs|console)
  npm run scan -- pages <site-id>            Menampilkan halaman tersimpan
  npm run scan -- findings <site-id>         Menampilkan temuan terbuka`

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
      if (only !== undefined && only !== 'bugs' && only !== 'console') {
        console.error(`Kategori tidak dikenal: ${only}. Pilih bugs atau console.`)
        return 1
      }

      // Hanya perintah yang memang menjalankan job yang boleh mengubah antrian.
      // Bila ini dijalankan pada setiap perintah, `list` di terminal lain akan
      // mengembalikan job yang sedang berjalan menjadi 'queued' dan proses
      // ketiga dapat mengklaim ulang pemindaian yang masih berlangsung.
      requeueInterrupted(db)

      const run = createRun(db, site.id, 'full')
      enqueue(db, {
        runId: run.id,
        type: 'scan',
        payload: only === undefined ? { siteId: site.id } : { siteId: site.id, only },
      })
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
