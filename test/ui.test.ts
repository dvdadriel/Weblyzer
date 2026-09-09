import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, rmSync, createWriteStream, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
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

/** Tiap test punya batas sendiri karena server dev mengompilasi tiap rute saat
 *  pertama diminta, dan itu beberapa detik yang tidak ada di produksi. */
const BATAS_TEST = 60_000

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
      env: { ...process.env, DB_PATH: join(dir, 'uji.db'), NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  // Ditunggu sampai benar-benar menjawab, bukan sampai proses ada. `spawn`
  // kembali seketika sedangkan Next butuh beberapa detik untuk siap, dan test
  // pertama yang menabrak server yang belum siap gagal dengan ECONNREFUSED
  // yang tidak menyebut sebabnya.
  const batas = Date.now() + 60_000
  for (;;) {
    if (Date.now() > batas) throw new Error(`Server dev tidak siap dalam 60 detik di ${asal}`)
    try {
      const r = await fetch(asal)
      if (r.ok) break
    } catch {
      // belum siap
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  // Log server disimpan supaya kegagalan bisa didiagnosis tanpa menjalankan
  // ulang — pelajaran yang sama dari claude-seo.
  const logPath = join(dir, 'server.log')
  const logStream = createWriteStream(logPath)
  server.stdout?.pipe(logStream)
  server.stderr?.pipe(logStream)
  process.env.WEBLYZER_UI_LOG = logPath

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
      `/sites/${siteId}/bugs`,
      `/sites/${siteId}/geo`,
      `/sites/${siteId}/pengaturan`,
      `/sites/${siteId}/export`,
    ].map((r) => fetch(`${asal}${r}`).catch(() => undefined)),
  )

  browser = await chromium.launch()
}, 240_000)

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
  page.setDefaultNavigationTimeout(60_000)
  page.setDefaultTimeout(15_000)
})

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
  const r = await fetch(`${asal}/sites/${siteId}/export`)
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

test('halaman model menampilkan penyedia dan tidak menyimpan API key', async () => {
  await page.goto(`${asal}/model`)
  await tampil(page.getByRole('heading', { name: 'Model AI' }))
  await tampil(page.getByText(/tidak ada\s+API key/))
  await tampil(page.getByText('Claude'))
}, BATAS_TEST)

/* ── keadaan yang tidak boleh tertukar ───────────────────────────────────── */

test('situs tanpa temuan sama sekali tidak mengaku bersih sebelum dipindai', async () => {
  const baru = createSite(db, { name: 'Belum Disentuh', base_url: 'https://baru.test' })
  await page.goto(`${asal}/sites/${baru.id}/bugs`)
  await tampil(page.getByText('Belum pernah dipindai'))
  db.prepare('DELETE FROM sites WHERE id = ?').run(baru.id)
}, BATAS_TEST)
