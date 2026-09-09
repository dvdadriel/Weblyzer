import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

/**
 * Merekam video tutorial penggunaan Weblyzer.
 *
 * Bukan bagian aplikasi — skrip sekali pakai yang dijalankan manual ketika
 * videonya perlu dibuat ulang. Ditaruh di repo, bukan di folder sementara,
 * supaya video berikutnya menampilkan alur yang sama dan bukan alur yang
 * kebetulan diingat orang yang membuatnya.
 *
 * DATABASE SENDIRI, dan itu syarat. Alur yang direkam menambahkan situs lalu
 * memindainya — keduanya menulis. Memakai `data.db` berarti frame pertama
 * video menampilkan Springair dan Comforta beserta temuan keamanannya, yaitu
 * kebocoran yang sama yang dihindari di halaman demo. Database kosong juga
 * kebetulan lebih baik sebagai tutorial: penonton melihat dari nol.
 *
 * Jalankan: node scripts/rekam-tutorial.ts
 */

const SITUS = { nama: 'Nike', url: 'https://www.nike.com' }

/** Halaman yang dijelajah. Kecil karena ini tutorial, dan karena crawl 8
 *  halaman sudah cukup memperlihatkan bahwa alatnya benar-benar menjelajah. */
const MAX_PAGES = 8

const KELUARAN = join(process.cwd(), 'docs')

/** Ukuran viewport. 1280×800 mengisi frame video tanpa membuat teks kecil. */
const UKURAN = { width: 1280, height: 800 }

async function portBebas(): Promise<number> {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const { port } = s.address() as { port: number }
  await new Promise<void>((r) => s.close(() => r()))
  return port
}

/** Fase yang dicatat, untuk dua hal: memotong bagian menunggu di ffmpeg, dan
 *  menulis daftar bertimestamp di `docs/tutorial.md`. */
type Fase = { nama: string; mulai: number; akhir: number; cepat: boolean }

async function main(): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), 'weblyzer-rekam-'))
  const dbPath = join(dir, 'tutorial.db')
  const videoDir = join(dir, 'video')
  mkdirSync(videoDir, { recursive: true })
  mkdirSync(KELUARAN, { recursive: true })

  const port = await portBebas()
  // `localhost`, bukan `127.0.0.1`: Next 16 memblokir dev resource dari
  // 127.0.0.1 sehingga HMR gagal dan React tidak terhidrasi — setiap tombol
  // mati, dan videonya akan merekam klik yang tidak melakukan apa pun.
  const asal = `http://localhost:${port}`

  let server: ChildProcess | undefined
  try {
    server = spawn(
      process.execPath,
      [join(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '--port', String(port)],
      { cwd: process.cwd(), env: { ...process.env, DB_PATH: dbPath }, stdio: 'ignore' },
    )

    process.stdout.write('Menunggu server dev ... ')
    const batas = Date.now() + 120_000
    for (;;) {
      if (Date.now() > batas) throw new Error(`Server tidak siap di ${asal}`)
      try {
        if ((await fetch(asal)).ok) break
      } catch {
        // belum siap
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    // Rute dihangatkan supaya kompilasi on-demand `next dev` tidak muncul di
    // video sebagai halaman yang menggantung beberapa detik.
    await Promise.all(
      ['/', '/model'].map((r) => fetch(`${asal}${r}`).catch(() => undefined)),
    )
    console.log('siap')

    const browser = await chromium.launch()
    const ctx = await browser.newContext({
      viewport: UKURAN,
      recordVideo: { dir: videoDir, size: UKURAN },
    })
    const page = await ctx.newPage()
    page.setDefaultTimeout(30_000)
    page.setDefaultNavigationTimeout(120_000)

    const t0 = Date.now()
    const detik = () => (Date.now() - t0) / 1000
    const fase: Fase[] = []
    const catat = async (nama: string, cepat: boolean, fn: () => Promise<void>) => {
      const mulai = detik()
      process.stdout.write(`  ${nama} ... `)
      await fn()
      const akhir = detik()
      fase.push({ nama, mulai, akhir, cepat })
      console.log(`${(akhir - mulai).toFixed(1)}s`)
    }

    const jeda = (ms: number) => page.waitForTimeout(ms)

    /**
     * Membuka detail satu temuan, dan MENGELUH kalau tidak ada temuan.
     *
     * Versi pertama diam saja saat tabelnya kosong, dan itu membuat rekaman
     * yang gagal terlihat berhasil: dua adegan hasil hanya 2,7 dan 3,6 detik,
     * dan satu-satunya petunjuknya adalah durasi yang lebih pendek dari yang
     * diminta. Sekarang ia menyebutkannya di log, jadi rekaman yang tidak ada
     * isinya tidak lolos diam-diam.
     */
    const bukaDetail = async (label: string) => {
      const chip = page.locator('.tombol-sev')
      const n = await chip.count()
      if (n === 0) {
        console.log(`\n     PERINGATAN: tab ${label} tidak punya temuan — adegan ini kosong`)
        await jeda(3000)
        return
      }
      await chip.first().click()
      await jeda(4500)
    }

    await catat('Dashboard kosong', false, async () => {
      await page.goto(asal)
      await page.getByText('Belum ada situs').waitFor()
      await jeda(3500)
    })

    await catat('Tambah situs Nike', false, async () => {
      await page.getByText('Tambah Situs Baru').click()
      await jeda(700)
      // Diketik per karakter, bukan `fill`: tutorial memperlihatkan orang
      // mengetik, dan `fill` mengisi seketika sehingga terlihat seperti
      // tempelan.
      await page.getByLabel('Nama Situs').pressSequentially(SITUS.nama, { delay: 110 })
      await jeda(400)
      await page.getByLabel(/Alamat URL/).pressSequentially(SITUS.url, { delay: 55 })
      await jeda(900)
      await page.getByRole('button', { name: 'Simpan Situs' }).click()
      await page.getByText(SITUS.nama).first().waitFor()
      await jeda(2500)
    })

    await catat('Atur batas halaman', false, async () => {
      // Lewat UI, bukan lewat SQL: halaman pengaturan adalah bagian dari alur
      // yang layak diperlihatkan, dan angka 8 itu yang menentukan videonya
      // tidak jadi sepuluh menit.
      await page.getByRole('link', { name: new RegExp(SITUS.nama) }).first().click()
      await page.getByRole('link', { name: 'Pengaturan' }).click()
      await page.getByLabel(/Batas halaman/).fill(String(MAX_PAGES))
      await jeda(600)
      await page.getByRole('button', { name: 'Simpan' }).click()
      await jeda(2000)
    })

    let path = ''
    await catat('Tekan Scan Bug', false, async () => {
      await page.getByRole('link', { name: /^Bug/ }).click()
      // `waitForURL` WAJIB sebelum `page.url()`.
      //
      // Navigasi Next.js client-side belum selesai saat `click()` kembali, jadi
      // `page.url()` masih memuat URL halaman sebelumnya. Terekam sungguhan:
      // adegan "Hasil Bug" menampilkan halaman Pengaturan, karena `path`
      // menyimpan `/pengaturan` dan `goto(path)` membawa kembali ke sana.
      await page.waitForURL(/\/bugs(\?|$)/)
      path = page.url()
      await jeda(1200)
      await page.getByRole('button', { name: 'Scan Bug' }).click()
      await page.getByText(/berjalan sejak/).waitFor({ timeout: 60_000 })
      await jeda(2500)
    })

    await catat('Menunggu crawl Bug', true, async () => {
      // Halaman menyegarkan dirinya tiap 5 detik dan berganti sendiri saat
      // selesai — itu yang direkam. Tidak dipotong, hanya dipercepat nanti:
      // penonton perlu melihat alat ini memang bekerja bermenit-menit.
      await page.getByText(/berjalan sejak/).waitFor({ state: 'detached', timeout: 600_000 })
      await jeda(1500)
    })

    await catat('Hasil Bug dan detail temuan', false, async () => {
      await page.goto(path)
      await jeda(2500)
      await bukaDetail('Bug')
    })

    await catat('Tekan Scan SEO', false, async () => {
      await page.getByRole('link', { name: /^SEO/ }).click()
      await page.waitForURL(/\/seo(\?|$)/)
      path = page.url()
      await jeda(1500)
      await page.getByRole('button', { name: 'Scan SEO' }).click()
      await page.getByText(/berjalan sejak/).waitFor({ timeout: 60_000 })
      await jeda(2000)
    })

    await catat('Menunggu crawl SEO', true, async () => {
      await page.getByText(/berjalan sejak/).waitFor({ state: 'detached', timeout: 600_000 })
      await jeda(1500)
    })

    await catat('Hasil SEO', false, async () => {
      await page.goto(path)
      await jeda(3500)
      await bukaDetail('SEO')
    })

    await catat('Unduh Excel', false, async () => {
      const unduh = page.waitForEvent('download', { timeout: 60_000 })
      await page.getByRole('link', { name: /Unduh Excel/ }).click()
      const berkas = await unduh
      console.log(`\n     berkas: ${berkas.suggestedFilename()}`)
      await jeda(3000)
    })

    await ctx.close()
    await browser.close()

    // Video baru ditulis setelah context ditutup.
    const mentah = readdirSync(videoDir).filter((f) => f.endsWith('.webm'))
    if (mentah.length === 0) throw new Error('Playwright tidak menghasilkan video')
    const tujuan = join(KELUARAN, 'tutorial-mentah.webm')
    renameSync(join(videoDir, mentah[0]!), tujuan)

    writeFileSync(
      join(KELUARAN, 'tutorial-fase.json'),
      JSON.stringify({ total: detik(), fase }, null, 2),
    )

    console.log(`\nVideo mentah: ${tujuan}`)
    console.log(`Fase: ${join(KELUARAN, 'tutorial-fase.json')}`)
    console.log(`Total: ${detik().toFixed(1)} detik`)
    return 0
  } finally {
    server?.kill('SIGTERM')
    rmSync(dir, { recursive: true, force: true })
  }
}

main()
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
