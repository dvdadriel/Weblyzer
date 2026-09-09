import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, rmSync, createWriteStream, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { buatUser } from '../lib/auth/pengguna.ts'
import { terbitkanSesi, NAMA_COOKIE_SESI } from '../lib/auth/sesi.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { upsertPage } from '../lib/repos/pages.ts'
import { reconcile } from '../lib/findings.ts'

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
let adminId: number

/**
 * Rahasia untuk server dev yang di-spawn.
 *
 * WAJIB diteruskan: tanpa `WEBLYZER_SECRET` aplikasi menolak start, dan
 * setiap halaman yang memanggil `konteks()` akan 500. Nilainya tetap supaya
 * cookie session yang ditandatangani di sini bisa diverifikasi di sana.
 */
const RAHASIA_UI = 'uji-'.repeat(8)

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
  // Situsnya dimiliki admin, dan test menjelajah SEBAGAI admin itu.
  //
  // Tanpa pemilik, `filterPemilik` untuk pengunjung tanpa akun tidak akan
  // mencocokkan apa pun dan dashboard-nya kosong — yang benar, tapi bukan
  // yang sedang diuji di sebagian besar berkas ini. Test khusus guest ada
  // sendiri di bawah.
  const admin = buatUser(db, {
    email: 'admin@uji.test',
    password: 'rahasia-uji',
    role: 'admin',
  })
  adminId = admin.id
  const site = createSite(db, {
    name: 'Situs Uji',
    base_url: 'https://uji.test',
    user_id: admin.id,
  })
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
        WEBLYZER_SECRET: RAHASIA_UI,
        // Direktori build sendiri, di dalam folder sementara test ini.
        //
        // Next 16 menolak server dev kedua di satu direktori build, dan
        // lock-nya ada di `<distDir>/dev/lock`. Tanpa pemisahan ini, seluruh
        // berkas ini gagal begitu ada `npm run dev` yang sedang jalan — dan
        // pesannya cuma "server dev tidak siap dalam 180 detik", yang tidak
        // menyebut sebabnya sama sekali.
        WEBLYZER_DIST_DIR: join(dir, '.next-uji'),
        // OAuth sengaja TIDAK dikonfigurasi: salah satu test memastikan
        // tombol Google tidak muncul tanpa kredensial.
        WEBLYZER_GOOGLE_CLIENT_ID: '',
        WEBLYZER_GOOGLE_CLIENT_SECRET: '',
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

  // Masuk sebagai admin dengan memasang cookie session langsung, bukan lewat
  // form masuk. Dua alasan: menghemat satu navigasi per test, dan yang diuji
  // di berkas ini adalah halamannya — form masuknya punya test sendiri. Ini
  // juga sekaligus membuktikan cookie yang ditandatangani `terbitkanSesi`
  // benar-benar diterima server.
  await masukSebagai(adminId)
})

/** Memasang cookie session yang sah untuk satu user. */
async function masukSebagai(userId: number) {
  await page.context().addCookies([
    {
      name: NAMA_COOKIE_SESI,
      value: terbitkanSesi(RAHASIA_UI, userId),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

/** Membuang cookie session: menjelajah sebagai pengunjung tanpa akun. */
async function keluar() {
  await page.context().clearCookies()
}

/**
 * `fetch` dengan cookie session, untuk rute yang tidak bisa dibuka browser.
 *
 * `page.goto` pada URL unduhan melempar "Download is starting" — Playwright
 * memperlakukannya sebagai unduhan, bukan navigasi. Dan `fetch` polos tidak
 * membawa cookie apa pun, jadi sejak rute export punya gerbang kepemilikan ia
 * akan selalu menjawab 404.
 */
function ambil(jalur: string, userId: number | null = adminId) {
  const kepala: Record<string, string> =
    userId === null
      ? {}
      : { cookie: `${NAMA_COOKIE_SESI}=${terbitkanSesi(RAHASIA_UI, userId)}` }
  return fetch(`${asal}${jalur}`, { headers: kepala })
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

test('ketujuh tab ada dan bisa dibuka', async () => {
  await page.goto(`${asal}/sites/${siteId}/bugs`)
  for (const label of ['Bug', 'Console', 'Security', 'SEO', 'GEO', 'Audit', 'Lighthouse']) {
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

test('halaman model menawarkan pemilih model dan medan API key', async () => {
  await page.goto(`${asal}/model`)
  await tampil(page.getByRole('heading', { name: 'Model AI' }))
  await tampil(page.locator('input[name="apiKey"]'))

  // Diperiksa lewat nilai `select`-nya, bukan `getByText`: `<option>` di dalam
  // select yang tertutup tidak pernah "visible" bagi Playwright, jadi menunggu
  // teksnya terlihat akan timeout pada halaman yang sebenarnya benar.
  const pilih = page.locator('select[name="model"]')
  await tampil(pilih)
  expect(await pilih.inputValue()).toBe('claude-opus-5')
  expect(await pilih.locator('option').count()).toBe(3)
}, BATAS_TEST)

test('medan API key bertipe password, jadi tidak terbaca di layar', async () => {
  await page.goto(`${asal}/model`)
  const medan = page.locator('input[name="apiKey"]')
  await tampil(medan)
  expect(await medan.getAttribute('type')).toBe('password')
}, BATAS_TEST)

test('halaman model tanpa akun menjelaskan sebabnya, bukan 404', async () => {
  await keluar()
  await page.goto(`${asal}/model`)
  await tampil(page.getByRole('heading', { name: 'Model AI' }))
  await tampil(page.getByText('Butuh akun'))
  // Keadaan kosong yang mengajarkan antarmuka: ada jalan keluarnya di layar.
  await tampil(page.getByRole('link', { name: 'Masuk' }))
}, BATAS_TEST)

/* ── auth ────────────────────────────────────────────────────────────────── */

test('pengunjung tanpa akun tidak melihat situs milik orang lain', async () => {
  // Isolasi antar pemilik, diuji dari luar: cookie dibuang, lalu dashboard
  // harus kosong walau databasenya memuat satu situs beserta temuannya.
  await keluar()
  await page.goto(asal)
  await tampil(page.getByRole('heading', { name: 'Situs' }))
  expect(await jumlah(page.getByText('Situs Uji'))).toBe(0)
}, BATAS_TEST)

test('situs orang lain 404, bukan terbuka lewat id yang ditebak', async () => {
  // Kebocoran paling langsung yang bisa ada di aplikasi ini: seluruh pohon
  // /sites/[siteId]/* dulu tidak memeriksa kepemilikan sama sekali, jadi id
  // yang ditebak membuka nama situs, alamatnya, temuannya, dan ringkasan
  // AI-nya. Diuji dari browser, bukan dari fungsinya, karena gerbangnya ada
  // di layout dan hanya jalur nyata yang membuktikannya terpasang.
  await keluar()
  const r = await page.goto(`${asal}/sites/${siteId}/bugs`)
  expect(r?.status()).toBe(404)
}, BATAS_TEST)

test('halaman pengaturan situs orang lain juga 404', async () => {
  // Satu layout membungkus ketujuh tab, Lighthouse, dan pengaturan — test ini
  // memastikan gerbangnya memang di layout dan bukan cuma di satu halaman.
  await keluar()
  const r = await page.goto(`${asal}/sites/${siteId}/pengaturan`)
  expect(r?.status()).toBe(404)
}, BATAS_TEST)

test('ekspor Excel tanpa akun 404, tidak mengunduh temuan orang lain', async () => {
  // Route handler tidak melewati layout, jadi ia punya gerbangnya sendiri.
  // Tanpa itu, satu id yang ditebak mengunduh SELURUH temuan situs orang lain
  // dalam satu berkas — termasuk yang sudah beres dan yang diabaikan.
  const r = await ambil(`/sites/${siteId}/export`, null)
  expect(r.status).toBe(404)
  // Dan isinya bukan spreadsheet.
  expect(r.headers.get('content-type')).not.toContain('spreadsheetml')
}, BATAS_TEST)

test('pemiliknya sendiri tetap bisa membuka dan mengekspor', async () => {
  // Sisi lain dari gerbang itu: menutup kebocoran tanpa mengunci pemiliknya
  // adalah setengah pekerjaan.
  const r = await page.goto(`${asal}/sites/${siteId}/bugs`)
  expect(r?.status()).toBe(200)
  const e = await ambil(`/sites/${siteId}/export`)
  expect(e.status).toBe(200)
  expect(e.headers.get('content-disposition')).toContain('.xlsx')
}, BATAS_TEST)

test('tombol Google tidak muncul tanpa kredensial OAuth', async () => {
  // Ditampilkan lalu gagal setelah diklik adalah jalan buntu; tidak
  // ditampilkan sama sekali adalah jawaban yang jujur.
  await keluar()
  await page.goto(`${asal}/masuk`)
  await tampil(page.getByRole('heading', { name: 'Masuk' }))
  expect(await jumlah(page.getByText(/Google/))).toBe(0)
}, BATAS_TEST)

test('masuk lewat form membawa ke dashboard dan situsnya terlihat', async () => {
  await keluar()
  await page.goto(`${asal}/masuk`)
  await page.locator('input[name="email"]').fill('admin@uji.test')
  await page.locator('input[name="password"]').fill('rahasia-uji')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await tampil(page.getByText('Situs Uji'))
}, BATAS_TEST)

test('password salah ditolak tanpa menyebut apakah emailnya ada', async () => {
  await keluar()
  await page.goto(`${asal}/masuk`)
  await page.locator('input[name="email"]').fill('admin@uji.test')
  await page.locator('input[name="password"]').fill('bukan-passwordnya')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await tampil(page.getByText('Email atau password salah.'))
}, BATAS_TEST)

/* ── keadaan yang tidak boleh tertukar ───────────────────────────────────── */

test('situs tanpa temuan sama sekali tidak mengaku bersih sebelum dipindai', async () => {
  const baru = createSite(db, { name: 'Belum Disentuh', base_url: 'https://baru.test' })
  await page.goto(`${asal}/sites/${baru.id}/bugs`)
  await tampil(page.getByText('Belum pernah dipindai'))
  db.prepare('DELETE FROM sites WHERE id = ?').run(baru.id)
}, BATAS_TEST)
