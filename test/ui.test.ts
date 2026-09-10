import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, createWriteStream, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { upsertPage } from '../lib/repos/pages.ts'
import { reconcile } from '../lib/findings.ts'
import { namaTangkapan } from '../lib/tangkapan.ts'

/**
 * Test UI end-to-end.
 *
 * Playwright, bukan test komponen dengan jsdom — dan itu keputusan soal
 * dependensi maupun soal apa yang layak diuji. Playwright SUDAH dependensi
 * runtime proyek ini, jadi nol paket baru; jsdom plus testing-library adalah
 * dua paket untuk menguji komponen yang terlepas dari server action, database,
 * dan `revalidatePath` yang justru menjadi tempat bug UI di proyek ini
 * bersembunyi.
 *
 * Server dev, bukan `next start`: yang kedua butuh `.next` hasil build, dan
 * `npm test` tidak membangun. Port diminta dari OS supaya suite ini tidak
 * bertabrakan dengan `npm run dev` yang mungkin sedang jalan.
 *
 * Database sendiri di folder sementara. Menyentuh `data.db` berarti test yang
 * mengubah data situs sungguhan — dan sebagian test di sini memang menekan
 * tombol yang menulis.
 */

let dir: string
let db: ReturnType<typeof openDb>
let server: ChildProcess
let browser: Browser
let page: Page
let asal: string
let siteId: number

/**
 * Batas per test, dan sengaja longgar.
 *
 * Dua hal menumpuk di sini. Server dev mengompilasi tiap rute saat pertama
 * diminta — beberapa detik yang tidak ada di produksi. Dan di `npm test`
 * berkas ini berjalan PARALEL dengan tiga puluh delapan berkas lain, beberapa
 * di antaranya menjalankan Chromium sendiri (`lighthouse-*.test.ts`), jadi
 * server dev-nya berebut CPU.
 *
 * Terukur: berkas ini lolos tiga kali berturut-turut saat dijalankan sendiri,
 * lalu sepuluh test-nya timeout satu kali di dalam suite penuh. Batas yang
 * longgar menutup itu tanpa menyembunyikan kerusakan sungguhan — server yang
 * benar-benar mati tetap gagal, hanya lebih lambat sampai laporannya.
 */
/**
 * JPEG yang dibuat OLEH browser yang akan membacanya.
 *
 * Versi pertama memakai base64 rakitan tangan. Bytes-nya lolos pemeriksaan
 * struktur (SOI, SOF 1×1, EOI) dan Chromium tetap menolak mendekodenya —
 * `naturalWidth` nol, dan testnya gagal pada fitur yang justru bekerja.
 * JPEG minimal yang sah lebih rewel daripada yang tampak: ia butuh tabel
 * Huffman dan SOS yang konsisten.
 *
 * Membuatnya dengan canvas menghapus seluruh kelas masalah itu: yang menulis
 * dan yang membaca adalah mesin yang sama.
 */
async function jpegSah(p: Page): Promise<Buffer> {
  const b64 = await p.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 8
    const g = c.getContext('2d')!
    g.fillStyle = '#123456'
    g.fillRect(0, 0, 8, 8)
    return c.toDataURL('image/jpeg', 0.8).split(',')[1]!
  })
  return Buffer.from(b64, 'base64')
}

const BATAS_TEST = 120_000

/**
 * Menunggu satu elemen terlihat, dan melempar bila tidak.
 *
 * `expect(locator).toBeVisible()` adalah matcher milik test runner Playwright,
 * BUKAN vitest — memakainya di sini menghasilkan `undefined is not a function`
 * yang menyamar sebagai timeout. Yang dipakai adalah `waitFor` dari Playwright
 * sendiri: ia menunggu, lalu melempar dengan pesan yang menyebut selectornya.
 */
const tampil = (loc: ReturnType<Page['getByText']>, ms = 10_000) =>
  loc.first().waitFor({ state: 'visible', timeout: ms })

/** Jumlah elemen yang cocok. Untuk memastikan sesuatu TIDAK ada. */
const jumlah = (loc: ReturnType<Page['getByText']>) => loc.count()

/** Port kosong dari OS. Pola yang sama dengan `portBebas` di scanner
 *  Lighthouse, dan alasannya sama: port tetap adalah milik bersama. */
async function portBebas(): Promise<number> {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const { port } = s.address() as { port: number }
  await new Promise<void>((r) => s.close(() => r()))
  return port
}

function seed(): number {
  const site = createSite(db, { name: 'Situs Uji', base_url: 'https://uji.test' })
  const p = upsertPage(db, site.id, {
    url: 'https://uji.test/rusak',
    statusCode: 500,
    loadMs: 80,
  })
  const run = createRun(db, site.id, 'full')
  reconcile(db, site.id, run.id, 'bugs', [
    {
      url: 'https://uji.test/rusak',
      pageId: p.id,
      severity: 'critical',
      rule: 'http-error',
      title: 'HTTP 500 pada https://uji.test/rusak',
      detail: { statusCode: 500 },
    },
  ])
  finishRun(db, run.id, 'done')
  return site.id
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'weblyzer-ui-'))
  db = openDb(join(dir, 'uji.db'))
  siteId = seed()

  const port = await portBebas()
  // `localhost`, BUKAN `127.0.0.1`.
  //
  // Next 16 memblokir permintaan lintas-origin ke dev resource-nya sendiri,
  // dan `127.0.0.1` tidak termasuk yang diizinkan secara bawaan walau ia
  // mesin yang sama. Akibatnya WebSocket HMR gagal, React TIDAK TERHIDRASI,
  // dan setiap `onClick` di client component menjadi mati.
  //
  // Terdiagnosis, bukan diduga: klik pada tombol severity dilaporkan berhasil
  // oleh Playwright — elemennya ada, terlihat, dan aktif — tapi baris
  // detailnya tidak pernah mengembang. Yang tercatat di console browser adalah
  // "Blocked cross-origin request to Next.js dev resource /_next/hmr".
  //
  // Lima test read-only lolos selama ini justru karena tidak butuh hidrasi.
  // Suite yang hanya membaca akan memberi rasa aman yang salah.
  asal = `http://localhost:${port}`

  server = spawn(
    process.execPath,
    [join(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '--port', String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DB_PATH: join(dir, 'uji.db'),
        NODE_ENV: 'development',
        // Direktori build sendiri, DI DALAM proyek dan bernama tetap.
        //
        // Next 16 menolak server dev kedua di satu direktori build, dan
        // lock-nya ada di `<distDir>/dev/lock`. Tanpa pemisahan ini, seluruh
        // berkas ini gagal begitu ada `npm run dev` yang sedang jalan — dan
        // pesannya cuma "server dev tidak siap dalam 180 detik", yang tidak
        // menyebut sebabnya sama sekali.
        //
        // Versi pertama menaruhnya di folder sementara test ini, dan itu
        // salah dalam dua hal sekaligus: Next membuang garis miring depan
        // sehingga build-nya sungguhan mendarat di `<proyek>/var/folders/...`,
        // dan typegen menuliskan path absolut folder itu ke `include` di
        // `tsconfig.json` — dua baris sampah baru per jalannya suite, ikut
        // ter-commit. Nama tetap di dalam proyek membuat entri itu ditulis
        // sekali lalu diam.
        WEBLYZER_DIST_DIR: '.next-uji',
        // AI sengaja TIDAK dikonfigurasi: satu test memeriksa bahwa halaman
        // /model menyebut kedua cara mengaturnya, bukan diam. Dikosongkan
        // eksplisit supaya suite tidak berubah arti di mesin yang punya
        // WEBLYZER_AI di lingkungannya.
        WEBLYZER_AI: '',
        // Tangkapan layar Mobile Parity ditulis dan dilayani dari sini.
        WEBLYZER_SHOT_DIR: join(dir, 'tangkapan'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  // Log dipasang SEBELUM penungguan, bukan sesudah.
  //
  // Terurut begitu karena log inilah satu-satunya tempat sebab kegagalan start
  // tertulis, dan kalau ia dipasang sesudah loop penungguan maka pada saat
  // gagal ia masih kosong — persis saat ia paling dibutuhkan.
  const logPath = join(dir, 'server.log')
  const logStream = createWriteStream(logPath)
  server.stdout?.pipe(logStream)
  server.stderr?.pipe(logStream)
  process.env.WEBLYZER_UI_LOG = logPath

  // Ditunggu sampai benar-benar menjawab, bukan sampai proses ada. `spawn`
  // kembali seketika sedangkan Next butuh beberapa detik untuk siap, dan test
  // pertama yang menabrak server yang belum siap gagal dengan ECONNREFUSED
  // yang tidak menyebut sebabnya.
  const batas = Date.now() + 180_000
  for (;;) {
    if (Date.now() > batas) {
      // Log-nya dibaca dan disertakan: sebab paling sering bukan server yang
      // lambat, melainkan server lain yang memegang lock build — dan itu
      // tertulis jelas di log yang tanpa ini tidak pernah dilihat siapa pun.
      let log = ''
      try {
        log = readFileSync(join(dir, 'server.log'), 'utf8').slice(-1200)
      } catch {
        // log belum ada
      }
      throw new Error(`Server dev tidak siap dalam 180 detik di ${asal}\n--- log ---\n${log}`)
    }
    try {
      const r = await fetch(asal)
      if (r.ok) break
    } catch {
      // belum siap
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  // Rute dihangatkan lewat fetch SEBELUM browser dipakai.
  //
  // `next dev` mengompilasi tiap rute saat pertama diminta, dan untuk rute
  // yang berat itu melewati batas navigasi Playwright — gagal dengan "Timeout
  // 30000ms exceeded" yang terbaca seperti halaman rusak padahal cuma sedang
  // dibangun. Dilakukan dengan fetch karena kompilasinya tidak butuh browser,
  // dan biayanya jadi dibayar sekali di sini alih-alih di test pertama yang
  // kebetulan menyentuh rute itu.
  await Promise.all(
    [
      '/',
      '/model',
      '/masuk',
      '/akun',
      `/sites/${siteId}/bugs`,
      `/sites/${siteId}/geo`,
      `/sites/${siteId}/pengaturan`,
      `/sites/${siteId}/export`,
    ].map((r) => fetch(`${asal}${r}`).catch(() => undefined)),
  )

  browser = await chromium.launch()
}, 300_000)

/**
 * Page baru untuk SETIAP test, bukan satu yang dibagi.
 *
 * Terukur: dengan page bersama, satu klik yang gagal membuat enam test
 * berikutnya timeout enam puluh detik masing-masing — termasuk yang cuma
 * memanggil `fetch` dan tidak menyentuh browser. Kegagalan pertama menular ke
 * seluruh sisanya, dan yang terbaca di laporan adalah tujuh kerusakan padahal
 * yang rusak satu.
 */
beforeEach(async () => {
  page = await browser.newPage()
  // Batas Playwright sendiri, terpisah dari batas vitest.
  page.setDefaultNavigationTimeout(120_000)
  page.setDefaultTimeout(30_000)

})

/**
 * `fetch`, bukan `page.goto`, untuk rute unduhan.
 *
 * `page.goto` pada URL unduhan melempar "Download is starting" — Playwright
 * memperlakukannya sebagai unduhan, bukan navigasi.
 */
function ambil(jalur: string) {
  return fetch(`${asal}${jalur}`)
}

afterEach(async () => {
  await page?.close()
})

afterAll(async () => {
  // Log server dicetak hanya bila ada yang gagal — kalau selalu, keluaran
  // suite jadi tidak terbaca.
  if (process.env.WEBLYZER_UI_LOG && process.exitCode) {
    try {
      console.log('--- log server dev ---')
      console.log(readFileSync(process.env.WEBLYZER_UI_LOG, 'utf8').slice(-4000))
    } catch {
      // tidak ada log
    }
  }
  await browser?.close()
  server?.kill('SIGTERM')
  db?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

/* ── dashboard ───────────────────────────────────────────────────────────── */

test('dashboard menampilkan situs beserta hitungan temuannya', async () => {
  await page.goto(asal)
  await tampil(page.getByRole('heading', { name: 'Situs' }))
  await tampil(page.getByText('Situs Uji'))
  // Hitungan severity, bukan cuma nama: kartu yang menampilkan nama tanpa
  // angka berarti `ringkasanSitus` mengembalikan situs tapi bukan temuannya.
  await tampil(page.getByText('1 critical'))
}, BATAS_TEST)

/* ── tab dan halaman kategori ────────────────────────────────────────────── */

test('tab Mobile Parity ada, berlabel BETA, dan bisa dibuka', async () => {
  // Labelnya BETA dan bukan AI, dan bedanya nyata: temuannya diukur dan
  // deterministik, yang masih baru adalah ambangnya. Label AI di sini akan
  // membuat orang meragukan angka yang justru bisa dipercaya.
  await page.goto(`${asal}/sites/${siteId}/bugs`)
  const tab = page.getByRole('link', { name: /Mobile Parity/ })
  await tampil(tab)
  await tampil(tab.getByText('BETA'))
  expect(await jumlah(tab.getByText('AI'))).toBe(0)

  await tab.click()
  await tampil(page.getByRole('button', { name: /Scan Mobile/ }))
}, BATAS_TEST)

test('strip tangkapan tampil dengan ketiga lebar, dan gambarnya benar-benar termuat', async () => {
  // Tangkapan ditulis langsung, bukan lewat pemindaian: yang diuji di sini
  // adalah rantai berkas → route → gambar di layar. Pemindaian sungguhannya
  // sudah dibuktikan terpisah terhadap fixture.
  const dirShot = join(dir, 'tangkapan', String(siteId))
  mkdirSync(dirShot, { recursive: true })
  const jpeg = await jpegSah(page)
  for (const lebar of ['mobile', 'tablet', 'desktop']) {
    writeFileSync(join(dirShot, namaTangkapan('https://uji.test', lebar)), jpeg)
  }

  try {
    await page.goto(`${asal}/sites/${siteId}/mobile`)
    const strip = page.locator('.strip')
    await tampil(strip)
    expect(await jumlah(strip.locator('img'))).toBe(3)

    // Gambarnya harus BENAR-BENAR termuat, bukan cuma ada di DOM: `<img>` yang
    // 404 tetap muncul sebagai elemen, dan strip yang penuh gambar rusak
    // terlihat seperti fitur yang gagal.
    //
    // `scrollIntoViewIfNeeded` lebih dulu, dan itu bukan kehati-hatian
    // berlebihan: strip-nya memakai `loading="lazy"` (perlu, karena satu situs
    // bisa punya 75 gambar), jadi gambar di bawah lipatan memang BELUM dimuat
    // saat halamannya selesai. Tanpa menggulir, pemeriksaan ini gagal pada
    // fitur yang justru bekerja.
    await strip.locator('img').first().scrollIntoViewIfNeeded()
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.strip img') as HTMLImageElement | null
        return !!el && el.complete && el.naturalWidth > 0
      },
      undefined,
      { timeout: 15_000 },
    )

    // Ketiga lebar disebut namanya, karena inti aspek ini adalah
    // perbandingannya.
    for (const lebar of ['mobile', 'tablet', 'desktop']) {
      await tampil(strip.getByText(new RegExp(lebar)))
    }
  } finally {
    rmSync(join(dir, 'tangkapan'), { recursive: true, force: true })
  }
}, BATAS_TEST)

test('route tangkapan menolak nama di luar polanya', async () => {
  // Allowlist, bukan daftar hitam. Yang diuji bukan daftar bentuk jahat yang
  // terpikirkan, melainkan bahwa apa pun di luar pola dijawab 404 — termasuk
  // upaya menjangkau berkas database.
  for (const nama of [
    '..%2Fdata.db',
    '..%2F..%2Fdata.db',
    'abcd1234-mobile.png',
    'zzzzzzzz-mobile.jpg',
    'abcd1234-ponsel.jpg',
  ]) {
    const r = await ambil(`/sites/${siteId}/tangkapan/${nama}`)
    expect(r.status, nama).toBe(404)
  }
}, BATAS_TEST)

test('tangkapan situs lain tidak bisa diambil lewat id yang ditebak', async () => {
  // Berkasnya ada, tapi di direktori situs lain. Route-nya harus mencarinya di
  // direktori situs yang diminta — bukan di seluruh akar.
  const dirShot = join(dir, 'tangkapan', String(siteId))
  mkdirSync(dirShot, { recursive: true })
  const nama = namaTangkapan('https://uji.test', 'mobile')
  writeFileSync(join(dirShot, nama), await jpegSah(page))

  try {
    expect((await ambil(`/sites/${siteId}/tangkapan/${nama}`)).status).toBe(200)
    expect((await ambil(`/sites/999999/tangkapan/${nama}`)).status).toBe(404)
  } finally {
    rmSync(join(dir, 'tangkapan'), { recursive: true, force: true })
  }
}, BATAS_TEST)

test('tab Mobile Parity yang belum dipindai mengaku begitu, bukan bersih', async () => {
  // Keadaan kosong yang paling mudah tertukar: nol temuan karena belum pernah
  // diukur, bukan karena tidak ada masalah.
  await page.goto(`${asal}/sites/${siteId}/mobile`)
  await tampil(page.getByText('Belum pernah dipindai'))
}, BATAS_TEST)

test('kedelapan tab ada dan bisa dibuka', async () => {
  await page.goto(`${asal}/sites/${siteId}/bugs`)
  for (const label of [
    'Bug',
    'Console',
    'Security',
    'SEO',
    'Mobile Parity',
    'GEO',
    'Audit',
    'Lighthouse',
  ]) {
    await tampil(page.getByRole('link', { name: new RegExp(`^${label}`) }))
  }
}, BATAS_TEST)

test('tab Bug menampilkan temuannya', async () => {
  await page.goto(`${asal}/sites/${siteId}/bugs`)
  await tampil(page.getByRole('cell', { name: 'http-error' }))
  await tampil(page.getByText('1 temuan terbuka'))
}, BATAS_TEST)

/**
 * §2.2 di layar. Tab yang belum pernah dianalisis harus mengaku tidak tahu,
 * bukan mengaku bersih — dan ini bug yang benar-benar ada sebelum tab GEO
 * ditambahkan.
 */
test('tab GEO yang belum dianalisis mengaku belum dipindai, bukan bersih', async () => {
  await page.goto(`${asal}/sites/${siteId}/geo`)
  await tampil(page.getByText('Belum pernah dipindai'))
  expect(await jumlah(page.getByText('Tidak ada yang rusak di sini'))).toBe(0)
}, BATAS_TEST)

test('tab claude-seo menyebutkan bahwa isinya penilaian, bukan pengukuran', async () => {
  await page.goto(`${asal}/sites/${siteId}/geo`)
  await tampil(page.getByText(/Dinilai claude-seo/))
  // Dan tab aturan TIDAK menyebutkannya — kalau semua tab berbunyi begitu,
  // pembedaannya berhenti berarti apa pun.
  await page.goto(`${asal}/sites/${siteId}/bugs`)
  expect(await jumlah(page.getByText(/Dinilai claude-seo/))).toBe(0)
}, BATAS_TEST)

/* ── server action: jalur tulis ──────────────────────────────────────────── */

/**
 * Alur tulis pertama yang diuji otomatis di proyek ini. Ia melewati server
 * action, `UPDATE` di SQLite, dan `revalidatePath` — tiga lapisan yang test
 * unit tidak menyentuh, dan tempat bug UI di sini pernah bersembunyi.
 */
test('tombol Abaikan mengubah status temuan di database', async () => {
  await page.goto(`${asal}/sites/${siteId}/bugs`)
  // Selector CSS, bukan accessible name: nama tombol ini dirakit dari chip
  // severity, dan mengikatnya ke teks membuat test rusak setiap kali label
  // severity diubah — padahal yang diuji di sini adalah jalur tulisnya.
  await page.locator('.tombol-sev').first().click()
  await page.getByRole('button', { name: 'Abaikan' }).click()

  // Yang di-poll adalah DATABASE, bukan teks di layar. `revalidatePath`
  // berjalan asinkron dan layar menyusul beberapa ratus milidetik kemudian;
  // memeriksa layar lebih dulu menghasilkan kegagalan yang menyalahkan server
  // action padahal ia sudah benar.
  await expect
    .poll(
      () =>
        (
          db
            .prepare("SELECT status FROM findings WHERE site_id = ? AND rule = 'http-error'")
            .get(siteId) as { status: string }
        ).status,
      { timeout: 10_000 },
    )
    .toBe('ignored')

  // Dan ia muncul di saringan Diabaikan, bukan hilang begitu saja.
  await page.goto(`${asal}/sites/${siteId}/bugs?status=ignored`)
  await tampil(page.getByRole('cell', { name: 'http-error' }))

  // Dipulihkan supaya test lain tidak bergantung urutan.
  db.prepare("UPDATE findings SET status = 'open' WHERE site_id = ?").run(siteId)
}, BATAS_TEST)

/* ── pengaturan situs ────────────────────────────────────────────────────── */

test('form pengaturan menyimpan keempat medannya', async () => {
  await page.goto(`${asal}/sites/${siteId}/pengaturan`)

  await page.getByLabel(/Batas halaman/).fill('75')
  await page.getByLabel(/Mode Lighthouse/).selectOption('full')
  await page.getByLabel(/Alamat sitemap/).fill('https://uji.test/sitemap.xml')
  await page.getByLabel(/Ikut pemindaian terjadwal/).uncheck()
  await page.getByRole('button', { name: 'Simpan' }).click()

  await expect
    .poll(
      () =>
        (
          db
            .prepare(
              'SELECT max_pages, lighthouse_mode, sitemap_url, enabled FROM sites WHERE id = ?',
            )
            .get(siteId) as Record<string, unknown>
        ).max_pages,
      { timeout: 10_000 },
    )
    .toBe(75)

  const s = db
    .prepare('SELECT max_pages, lighthouse_mode, sitemap_url, enabled FROM sites WHERE id = ?')
    .get(siteId) as Record<string, unknown>
  expect(s).toEqual({
    max_pages: 75,
    lighthouse_mode: 'full',
    sitemap_url: 'https://uji.test/sitemap.xml',
    enabled: 0,
  })
}, BATAS_TEST)

/**
 * Yang diuji adalah HASILNYA — nilai di atas batas tidak tersimpan — bukan
 * mekanismenya.
 *
 * Versi pertama test ini mencari pesan galat dari server, dan gagal dengan
 * alert kosong: `max={2000}` pada input membuat BROWSER menolak submit lebih
 * dulu, jadi server action tidak pernah dipanggil. Test itu menguji jalur yang
 * tidak bisa dicapai lewat UI. Validasi server-nya sendiri sudah diuji penuh
 * di `test/pengaturan-situs.test.ts`; yang perlu dijamin di sini cuma bahwa
 * kedua lapisan itu bersama-sama tidak meloloskan nilainya.
 */
test('nilai di atas batas tidak pernah tersimpan', async () => {
  await page.goto(`${asal}/sites/${siteId}/pengaturan`)
  await page.getByLabel(/Batas halaman/).fill('99999')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await page.waitForTimeout(1500)

  const s = db.prepare('SELECT max_pages FROM sites WHERE id = ?').get(siteId) as {
    max_pages: number
  }
  expect(s.max_pages).toBe(75)
}, BATAS_TEST)

/* ── ekspor ──────────────────────────────────────────────────────────────── */

test('ekspor mengembalikan xlsx dengan nama berkas yang aman', async () => {
  const r = await ambil(`/sites/${siteId}/export`)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toContain('spreadsheetml')
  expect(r.headers.get('content-disposition')).toContain('weblyzer-situs-uji-')
  // Cache-Control penting: berkasnya dirakit dari database saat diminta, dan
  // cache akan menyajikan angka lama kepada orang yang baru selesai memindai.
  expect(r.headers.get('cache-control')).toContain('no-store')

  const buf = Buffer.from(await r.arrayBuffer())
  // Zip magic. Bukan cuma memeriksa panjangnya: respons galat yang panjangnya
  // wajar akan lolos pemeriksaan ukuran.
  expect(buf.subarray(0, 2).toString('binary')).toBe('PK')
  expect(buf.length).toBeGreaterThan(2000)
}, BATAS_TEST)

/* ── halaman model ───────────────────────────────────────────────────────── */

test('halaman model menyebut kedua cara mengatur, bukan cuma "tidak aktif"', async () => {
  // Server uji ini dijalankan tanpa WEBLYZER_AI dan tanpa pilihan CLI. Yang
  // diperiksa: halamannya menyebut kedua jalan keluarnya — pesan yang tidak
  // menyebutnya memaksa orang membaca kode untuk memakai fiturnya.
  await page.goto(`${asal}/model`)
  await tampil(page.getByRole('heading', { name: 'Model AI' }))
  await tampil(page.getByText(/Pilih claude atau agy/))
}, BATAS_TEST)

test('halaman model tidak pernah meminta API key lewat form', async () => {
  // Batas yang paling penting di halaman ini: rahasia tidak menyeberang lewat
  // browser. Jalur CLI boleh dipilih di sini justru karena ia tidak punya
  // rahasia. Kalau medan kunci muncul suatu saat tanpa sengaja, di sinilah ia
  // tertangkap.
  await page.goto(`${asal}/model`)
  await tampil(page.getByRole('heading', { name: 'Model AI' }))
  expect(await jumlah(page.locator('input[name="apiKey"]'))).toBe(0)
  expect(await jumlah(page.locator('input[type="password"]'))).toBe(0)
}, BATAS_TEST)

test('CLI bisa dipilih dari halaman web', async () => {
  // "claude dan agy gunakan cli, interaktif di web": keduanya harus terlihat
  // dan bisa dipilih tanpa menyentuh .env sama sekali.
  await page.goto(`${asal}/model`)
  await tampil(page.locator('input[name="cli"][value="claude"]'))
  await tampil(page.locator('input[name="cli"][value="agy"]'))
  // Medan model bertipe teks, BUKAN select: daftar model kedua CLI berubah
  // tanpa Weblyzer tahu, dan select akan menolak model yang berfungsi.
  const medan = page.locator('input[name="model"]')
  await tampil(medan)
  expect(await medan.getAttribute('type')).toBe('text')
}, BATAS_TEST)

test('medan model membawa saran tanpa mengunci pilihan', async () => {
  await page.goto(`${asal}/model`)
  const medan = page.locator('input[name="model"]')
  await tampil(medan)
  const daftar = await medan.getAttribute('list')
  expect(daftar).toBeTruthy()
  // Saran ada, tapi bentuknya datalist — jadi nama lain tetap bisa diketik.
  expect(await jumlah(page.locator(`datalist#${daftar} option`))).toBeGreaterThan(0)
}, BATAS_TEST)

test('memilih agy mengganti sarannya, bukan cuma labelnya', async () => {
  // Saran yang tidak ikut berganti lebih buruk daripada tidak ada saran: ia
  // menyarankan model claude untuk agy, dan agy menolaknya.
  await page.goto(`${asal}/model`)
  await tampil(page.locator('input[name="cli"][value="agy"]'))
  await page.locator('input[name="cli"][value="agy"]').check()
  await page.waitForTimeout(300)
  const daftar = await page.locator('input[name="model"]').getAttribute('list')
  expect(daftar).toBe('saran-agy')
  // Dihitung, bukan ditunggu terlihat: isi `<datalist>` tidak pernah "visible"
  // bagi Playwright — persis alasan yang sama dengan `<option>` di dalam
  // select yang tertutup.
  expect(await jumlah(page.locator('datalist#saran-agy option[value="gemini-3.1-pro-high"]'))).toBe(
    1,
  )
  expect(await jumlah(page.locator('datalist#saran-agy option[value="claude-opus-5"]'))).toBe(0)
}, BATAS_TEST)

test('pilihan CLI tersimpan di database walau CLI-nya gagal dijawab', async () => {
  // Sengaja: tidak ada lagi keadaan "tersimpan tapi belum terbukti" yang
  // menahan fitur. CLI yang sedang rusak biasanya pulih tanpa perlu ada yang
  // menyimpan ulang apa pun, dan keadaan tersembunyi yang menahannya justru
  // yang basi.
  await page.goto(`${asal}/model`)
  await page.locator('input[name="cli"][value="agy"]').check()
  await page.locator('input[name="model"]').fill('model-yang-tidak-ada')
  await page.getByRole('button', { name: /Simpan/ }).click()

  // Hasil pemanggilannya ditunggu apa adanya — berhasil atau gagal, keduanya
  // muncul di layar. Yang diuji di sini adalah tersimpannya.
  await page.waitForFunction(
    () => !document.querySelector('button[disabled]'),
    undefined,
    { timeout: 200_000 },
  )
  const baris = db
    .prepare("SELECT value FROM config WHERE key = 'ai_cli'")
    .get() as { value: string } | undefined
  expect(baris?.value).toBe('agy')

  db.prepare("DELETE FROM config WHERE key LIKE 'ai_cli%'").run()
}, 240_000)

test('halaman model menunjukkan contoh .env yang bisa ditiru', async () => {
  // Halaman yang cuma bilang "isi .env" memindahkan pekerjaan ke pembacanya.
  await page.goto(`${asal}/model`)
  await tampil(page.getByText(/WEBLYZER_AI_MODEL=/))
  await tampil(page.getByText(/nvapi-/))
}, BATAS_TEST)

/* ── tanpa auth ──────────────────────────────────────────────────────────── */

test('navbar tidak lagi menawarkan masuk atau keluar', async () => {
  // Weblyzer jalan di mesin sendiri; tautan masuk yang tertinggal akan
  // mengarah ke halaman yang sudah tidak ada.
  await page.goto(asal)
  await tampil(page.getByRole('heading', { name: 'Situs' }))
  expect(await jumlah(page.getByRole('link', { name: 'Masuk' }))).toBe(0)
  expect(await jumlah(page.getByRole('button', { name: 'Keluar' }))).toBe(0)
}, BATAS_TEST)

test('rute auth yang sudah dibuang menjawab 404', async () => {
  // Rute yang dihapus dari `app/` tapi masih dirujuk di suatu tempat adalah
  // tautan mati; ini yang membuktikan keduanya benar-benar hilang.
  for (const jalur of ['/masuk', '/akun']) {
    const r = await ambil(jalur)
    expect(r.status, jalur).toBe(404)
  }
}, BATAS_TEST)

test('dashboard terbuka tanpa cookie apa pun', async () => {
  // Tidak ada sesi, tidak ada cookie guest, dan situsnya tetap terlihat.
  await page.context().clearCookies()
  await page.goto(asal)
  await tampil(page.getByText('Situs Uji'))
}, BATAS_TEST)

test('situs yang tidak ada 404, bukan kerangka halaman kosong', async () => {
  // Id yang tidak ada dulu merender kerangka lengkap dengan nama situs kosong,
  // dan itu terbaca sebagai data yang hilang alih-alih alamat yang salah.
  const r = await page.goto(`${asal}/sites/999999/bugs`)
  expect(r?.status()).toBe(404)
}, BATAS_TEST)

test('halaman pengaturan situs yang tidak ada juga 404', async () => {
  // Satu layout membungkus ketujuh tab, Lighthouse, dan pengaturan — test ini
  // memastikan pemeriksaannya memang di layout dan bukan cuma di satu halaman.
  const r = await page.goto(`${asal}/sites/999999/pengaturan`)
  expect(r?.status()).toBe(404)
}, BATAS_TEST)

test('ekspor situs yang tidak ada 404, bukan xlsx berisi nol baris', async () => {
  // Rute ekspor adalah jalur terpisah dari layout dan harus memeriksanya
  // sendiri. Berkas Excel kosong terbaca seperti situs yang datanya hilang.
  const r = await ambil('/sites/999999/export')
  expect(r.status).toBe(404)
}, BATAS_TEST)

/* ── keadaan yang tidak boleh tertukar ───────────────────────────────────── */

test('situs tanpa temuan sama sekali tidak mengaku bersih sebelum dipindai', async () => {
  const baru = createSite(db, { name: 'Belum Disentuh', base_url: 'https://baru.test' })
  await page.goto(`${asal}/sites/${baru.id}/bugs`)
  await tampil(page.getByText('Belum pernah dipindai'))
  db.prepare('DELETE FROM sites WHERE id = ?').run(baru.id)
}, BATAS_TEST)
