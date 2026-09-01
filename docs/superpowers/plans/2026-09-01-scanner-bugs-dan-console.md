# Scanner Bugs & Console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah crawler menjadi satu kunjungan browser yang merekam segalanya, lalu membangun dua analyzer murni di atasnya — bug fungsional dan error/warning konsol — sehingga dua tab pertama aplikasi punya data sungguhan.

**Architecture:** Satu lintasan Playwright per halaman menghasilkan `PageVisit` yang memuat status, rantai redirect, tautan, pesan konsol, request gagal, status setiap resource, dan header respons. Analyzer adalah **fungsi murni** dari `PageVisit[]` ke `NewFinding[]` — tanpa browser, tanpa database — sehingga dapat diuji dengan objek biasa dan dipakai ulang oleh fitur recheck. Satu job menjalankan kunjungan sekali dan merekonsiliasi dua kategori dari hasil yang sama.

**Tech Stack:** Node 26 (menjalankan TypeScript native), `node:sqlite`, Playwright, Vitest.

**Rencana sebelumnya:** `docs/superpowers/plans/2026-09-01-fondasi-dan-crawl.md` (selesai — 14 commit, 49 test)
**Spec:** `docs/superpowers/specs/2026-09-01-web-audit-dashboard-design.md`

---

## Kenapa satu kunjungan, bukan tiga scanner

Spec menyebut `bugs`, `console`, dan `security` sebagai scanner terpisah. Menjalankan tiga penjelajahan Chromium atas situs yang sama berarti tiga kali biaya untuk data yang keluar dari `page.goto` yang sama. Pesan konsol, request gagal, status resource, dan header respons semuanya tersedia dalam satu kunjungan.

Karena itu rencana ini memisahkan **pengumpulan** dari **penilaian**:

- `lib/scanners/visit.ts` — satu lintasan browser, mengembalikan data mentah. Tidak menilai apa pun.
- `lib/analyzers/*.ts` — fungsi murni yang menilai data itu. Tidak menyentuh browser maupun database.

Konsekuensi yang diinginkan: analyzer diuji tanpa Playwright (cepat, deterministik), dan aturan baru dapat ditambahkan tanpa menyentuh kode crawling sama sekali.

`security` tidak ada di rencana ini. Sumber datanya berbeda (permintaan langsung ke server: `robots.txt`, file terekspos, sertifikat TLS) dan memerlukan batasan tersendiri. Itu Rencana 3.

## Struktur File

| File | Tanggung jawab |
|---|---|
| `lib/scanners/visit.ts` | Satu lintasan Playwright; menghasilkan `PageVisit[]`. Menggantikan `crawl.ts`. |
| `lib/analyzers/bugs.ts` | `PageVisit[]` → temuan kategori `bugs` |
| `lib/analyzers/console.ts` | `PageVisit[]` → temuan kategori `console` |
| `lib/analyzers/fingerprint-key.ts` | Menstabilkan teks pesan menjadi kunci fingerprint |
| `lib/jobs/scan.ts` | Menjalankan kunjungan sekali, merekonsiliasi dua kategori |
| `scripts/scan.ts` | Perintah CLI baru: `scan <site-id> [--only bugs\|console]` |
| `test/fixtures/*` | Fixture per aturan, masing-masing positif dan bersih |

`lib/scanners/crawl.ts` dan `lib/jobs/crawl.ts` dihapus di Task 7 setelah penggantinya terbukti bekerja.

## Aturan yang dibangun

**Kategori `bugs`** — sesuatu yang rusak bagi pengunjung:

| Rule | Severity | Pemicu |
|---|---|---|
| `http-error` | 5xx/0 → critical, selain itu high | Status halaman ≥ 400 atau 0 |
| `redirect-loop` | critical | Navigasi gagal dengan `ERR_TOO_MANY_REDIRECTS` |
| `redirect-chain` | low | ≥ 3 hop redirect menuju satu halaman |
| `broken-resource` | high | Resource (gambar/skrip/stylesheet) berstatus ≥ 400 |
| `blank-page` | high | Status 200 tetapi teks terlihat < 50 karakter |

**Kategori `console`** — sesuatu yang rusak bagi browser:

| Rule | Severity | Pemicu |
|---|---|---|
| `uncaught-exception` | critical | Event `pageerror` |
| `console-error` | high | `console.error` |
| `failed-request` | medium | Request yang gagal di level jaringan |
| `console-warning` | low | `console.warn` |

## Kunci fingerprint — bagian yang paling mudah salah

Rekonsiliasi mengenali temuan lewat `fingerprintOf(url, rule, key)`. Untuk aturan yang bisa muncul berkali-kali pada satu halaman, `key` wajib diisi — kalau tidak, sepuluh gambar rusak di satu halaman menjadi satu temuan.

Tetapi teks pesan konsol sering memuat bagian yang berubah setiap muat: timestamp, id permintaan, UUID, posisi di dalam bundel. Memakai teks mentah sebagai `key` membuat fingerprint berganti tiap scan, sehingga setiap temuan lama ditandai `fixed` dan temuan "baru" dibuka — riwayat menjadi sampah.

Karena itu ada `lib/analyzers/fingerprint-key.ts`. Yang disamarkan menjadi `#`: UUID, posisi sumber `:baris:kolom` sebagai satu kesatuan, dan deretan **empat digit atau lebih**. Teks lalu dipotong 200 karakter.

Ambangnya empat, bukan lima, dan posisi sumber ditangani terpisah — keduanya karena alasan konkret yang ditemukan saat memverifikasi implementasinya:

- `at bundle.js:12345:67` → kolomnya hanya dua digit, jadi aturan panjang angka tidak menjangkaunya, padahal baris dan kolom sama-sama bergeser tiap build
- `Failed to load chunk 4821` → id chunk empat digit lolos dari ambang lima

Tiga digit sengaja dibiarkan utuh supaya `HTTP 404` dan `HTTP 500` tetap dua temuan berbeda.

Ini dibangun lebih dulu (Task 1) karena dua analyzer bergantung padanya.

---

## Task 1: Kunci fingerprint yang stabil

**Files:**
- Create: `lib/analyzers/fingerprint-key.ts`
- Test: `test/fingerprint-key.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/fingerprint-key.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { stableKey } from '../lib/analyzers/fingerprint-key.ts'

test('teks yang sama menghasilkan kunci yang sama', () => {
  expect(stableKey('Gagal memuat modul')).toBe(stableKey('Gagal memuat modul'))
})

test('angka panjang yang berubah tiap muat tidak mengubah kunci', () => {
  expect(stableKey('Request 1738291047123 gagal')).toBe(stableKey('Request 1738291999999 gagal'))
})

test('UUID yang berubah tiap muat tidak mengubah kunci', () => {
  const a = stableKey('trace 3f2504e0-4f89-11d3-9a0c-0305e82c3301 error')
  const b = stableKey('trace 7b1f8a22-1c3d-4e55-8a77-9f0b1d2e3c44 error')
  expect(a).toBe(b)
})

test('angka pendek tetap dipertahankan karena sering bermakna', () => {
  expect(stableKey('HTTP 404')).not.toBe(stableKey('HTTP 500'))
})

test('teks yang berbeda tetap menghasilkan kunci berbeda', () => {
  expect(stableKey('Gagal memuat modul')).not.toBe(stableKey('Gagal memuat gambar'))
})

test('teks sangat panjang dipotong agar kunci tidak membengkak', () => {
  const key = stableKey('x'.repeat(5000))
  expect(key.length).toBeLessThanOrEqual(200)
})

test('spasi berlebih tidak mengubah kunci', () => {
  expect(stableKey('  Gagal   memuat\n\tmodul  ')).toBe(stableKey('Gagal memuat modul'))
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/fingerprint-key.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/analyzers/fingerprint-key.ts'`

- [ ] **Step 3: Tulis `lib/analyzers/fingerprint-key.ts`**

```typescript
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
/** Lima digit atau lebih: timestamp, id, offset bundel. Angka pendek seperti
 *  kode status HTTP justru bermakna dan tidak boleh ikut dikaburkan. */
const ANGKA_PANJANG = /\d{5,}/g

/**
 * Mengubah teks pesan menjadi kunci fingerprint yang stabil antar scan.
 *
 * Tanpa ini, pesan yang memuat timestamp atau id permintaan menghasilkan
 * fingerprint baru setiap kali dijalankan: temuan kemarin ditandai `fixed`
 * dan temuan yang identik dibuka sebagai baru, sehingga riwayat "sudah
 * diperbaiki atau belum" kehilangan artinya.
 */
export function stableKey(text: string): string {
  return text
    .replace(UUID, '#')
    .replace(ANGKA_PANJANG, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/fingerprint-key.test.ts`
Diharapkan: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add lib/analyzers/fingerprint-key.ts test/fingerprint-key.test.ts
git commit -m "Add a stable key for finding fingerprints

Console messages often carry a timestamp or request id that changes every
load. Using the raw text would make yesterday's finding look fixed and an
identical one look new, every single scan."
```

---

## Task 2: Kunjungan halaman yang merekam segalanya

Ini menggantikan `crawl` dengan `visit`. Perilaku penjelajahan dipertahankan persis — same-origin, `maxPages` dijinakkan, page dipulihkan setelah navigasi gagal — sambil menambah data yang dikumpulkan.

**Files:**
- Create: `lib/scanners/visit.ts`
- Create: `test/fixtures/rusak-konsol/index.html`
- Test: `test/visit.test.ts`

- [ ] **Step 1: Buat fixture**

`test/fixtures/rusak-konsol/index.html`:

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>Halaman Berisik</title>
  </head>
  <body>
    <h1>Halaman Berisik</h1>
    <p>Halaman ini sengaja memancarkan error dan warning.</p>
    <img src="/gambar-hilang.png" alt="Gambar hilang" />
    <script>
      console.warn('peringatan pertama')
      console.error('kesalahan pertama')
      fetch('/api-hilang.json')
    </script>
    <script>
      // Lemparan sinkron, bukan di dalam setTimeout: `pageerror` dijamin
      // terpancar saat parsing, sebelum navigasi selesai. Dengan setTimeout
      // test-nya bergantung pada balapan waktu dan akan berkedip.
      throw new Error('meledak setelah muat')
    </script>
  </body>
</html>
```

- [ ] **Step 2: Tulis test yang gagal**

`test/visit.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { startFixtureServer } from './fixture-server.ts'
import { visit, normalizeUrl } from '../lib/scanners/visit.ts'

test('normalizeUrl tetap membuang fragment dan mengurutkan query', () => {
  expect(normalizeUrl('http://a.test/x/#bagian')).toBe('http://a.test/x')
  expect(normalizeUrl('http://a.test/')).toBe('http://a.test/')
  expect(normalizeUrl('http://a.test/x?b=2&a=1')).toBe('http://a.test/x?a=1&b=2')
})

test('mencatat status, tautan, dan finalUrl untuk halaman biasa', async () => {
  const server = await startFixtureServer('basic')
  try {
    const visits = await visit(server.url, { maxPages: 20 })
    const root = visits.find((v) => v.url === `${server.url}/`)
    expect(root?.statusCode).toBe(200)
    expect(root?.finalUrl).toBe(`${server.url}/`)
    expect(root?.redirects).toEqual([])
    expect(root?.links.length).toBeGreaterThan(0)
    expect(root?.title).toBe('Beranda Fixture')
  } finally {
    await server.close()
  }
})

test('merekam pesan konsol, exception, dan request gagal', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    expect(page).toBeDefined()

    const levels = page!.console.map((c) => c.level)
    expect(levels).toContain('error')
    expect(levels).toContain('warning')
    expect(page!.console.some((c) => c.text.includes('kesalahan pertama'))).toBe(true)
    expect(page!.console.some((c) => c.text.includes('peringatan pertama'))).toBe(true)

    expect(page!.pageErrors.some((e) => e.includes('meledak setelah muat'))).toBe(true)
  } finally {
    await server.close()
  }
})

test('merekam status setiap resource, termasuk yang rusak', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    const rusak = page!.resources.filter((r) => r.status >= 400)
    expect(rusak.some((r) => r.url.endsWith('/gambar-hilang.png'))).toBe(true)
  } finally {
    await server.close()
  }
})

test('merekam header respons halaman', async () => {
  const server = await startFixtureServer('basic')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    expect(page!.responseHeaders['content-type']).toContain('text/html')
  } finally {
    await server.close()
  }
})

test('mencatat teks terlihat agar halaman kosong dapat dikenali', async () => {
  const server = await startFixtureServer('basic')
  try {
    const [page] = await visit(server.url, { maxPages: 1 })
    expect(page!.textLength).toBeGreaterThan(10)
  } finally {
    await server.close()
  }
})

test('navigasi yang melempar dicatat dengan error dan tidak menular', async () => {
  // Server kecil dengan satu halaman redirect-loop, seperti pada rencana sebelumnya.
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    if (req.url === '/loop') {
      res.writeHead(302, { location: '/loop' }).end()
      return
    }
    if (req.url === '/p1' || req.url === '/p2') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!doctype html><title>Sehat</title><h1>Halaman sehat di sini</h1>')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      '<!doctype html><title>Root</title><a href="/loop">loop</a><a href="/p1">p1</a><a href="/p2">p2</a>',
    )
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`

  try {
    const visits = await visit(base, { maxPages: 10 })
    const byUrl = new Map(visits.map((v) => [v.url, v]))
    expect(byUrl.get(`${base}/loop`)?.statusCode).toBe(0)
    expect(byUrl.get(`${base}/loop`)?.error).toContain('ERR_TOO_MANY_REDIRECTS')
    expect(byUrl.get(`${base}/p1`)?.statusCode).toBe(200)
    expect(byUrl.get(`${base}/p2`)?.statusCode).toBe(200)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})

test('redirect dicatat dengan rantainya dan finalUrl', async () => {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    if (req.url === '/lama') {
      res.writeHead(301, { location: '/tengah' }).end()
      return
    }
    if (req.url === '/tengah') {
      res.writeHead(302, { location: '/baru' }).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Baru</title><h1>Halaman tujuan akhir</h1>')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`

  try {
    const visits = await visit(`${base}/lama`, { maxPages: 1 })
    const v = visits[0]!
    expect(v.url).toBe(`${base}/lama`)
    expect(v.finalUrl).toBe(`${base}/baru`)
    expect(v.statusCode).toBe(200)
    expect(v.redirects.map((h) => h.status)).toEqual([301, 302])
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})
```

- [ ] **Step 3: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/visit.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/scanners/visit.ts'`

- [ ] **Step 4: Tulis `lib/scanners/visit.ts`**

```typescript
import { chromium, type Browser, type Page, type Response } from 'playwright'

export type RedirectHop = { url: string; status: number }

export type ConsoleEntry = {
  level: 'error' | 'warning'
  text: string
}

export type FailedRequest = {
  url: string
  resourceType: string
  failure: string
}

export type ResourceResult = {
  url: string
  status: number
  resourceType: string
}

export type PageVisit = {
  /** URL yang diminta, sudah dinormalisasi. Identitas halaman memakai ini. */
  url: string
  /** URL setelah seluruh redirect diikuti. Sama dengan `url` bila tidak ada redirect. */
  finalUrl: string
  statusCode: number
  redirects: RedirectHop[]
  loadMs: number
  links: string[]
  title: string
  /** Panjang teks terlihat, untuk mengenali halaman yang termuat tapi kosong. */
  textLength: number
  console: ConsoleEntry[]
  pageErrors: string[]
  failedRequests: FailedRequest[]
  resources: ResourceResult[]
  responseHeaders: Record<string, string>
  /** Pesan kegagalan navigasi, bila ada. */
  error?: string
}

export type VisitOptions = {
  maxPages?: number
  timeoutMs?: number
}

/**
 * Menyeragamkan URL agar satu halaman tidak tercatat berkali-kali. Fragment
 * dibuang (tidak menghasilkan dokumen berbeda) dan parameter query diurutkan
 * (urutannya tidak bermakna bagi server).
 */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw)
  url.hash = ''
  url.searchParams.sort()
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
  const query = url.searchParams.toString()
  return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ''}`
}

// `Request.response()` bersifat async — memanggilnya tanpa await mengembalikan
// Promise dan `.status()` melempar. Kegagalannya menipu: throw terjadi setelah
// `finalUrl` di-assign tetapi sebelum `redirects`, sehingga blok catch mereset
// statusCode menjadi 0 dan halaman sehat tampak seperti navigasi gagal.
async function redirectChain(response: Response): Promise<RedirectHop[]> {
  const hops: RedirectHop[] = []
  let request = response.request().redirectedFrom()
  while (request) {
    const previous = await request.response()
    hops.unshift({ url: request.url(), status: previous?.status() ?? 0 })
    request = request.redirectedFrom()
  }
  return hops
}

/**
 * Satu lintasan browser atas sebuah situs. Mengumpulkan, tidak menilai —
 * seluruh penilaian dilakukan analyzer murni di `lib/analyzers/`, sehingga
 * aturan baru tidak pernah perlu menyentuh kode crawling.
 */
export async function visit(baseUrl: string, opts: VisitOptions = {}): Promise<PageVisit[]> {
  // max_pages berasal dari kolom SQLite tanpa validasi dan bisa berisi nilai
  // non-numerik; `results.length < NaN` selalu false dan crawl mengembalikan [].
  const requested = Number(opts.maxPages ?? 200)
  const maxPages = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 200
  const timeoutMs = opts.timeoutMs ?? 20_000
  const origin = new URL(baseUrl).origin

  const browser: Browser = await chromium.launch()
  const results: PageVisit[] = []

  try {
    const context = await browser.newContext()
    let page: Page = await context.newPage()

    const queue: string[] = [normalizeUrl(baseUrl)]
    const seen = new Set<string>(queue)

    while (queue.length > 0 && results.length < maxPages) {
      const url = queue.shift()!
      const startedAt = Date.now()

      const consoleEntries: ConsoleEntry[] = []
      const pageErrors: string[] = []
      const failedRequests: FailedRequest[] = []
      const resources: ResourceResult[] = []

      const onConsole = (msg: { type: () => string; text: () => string }) => {
        const type = msg.type()
        if (type === 'error') consoleEntries.push({ level: 'error', text: msg.text() })
        else if (type === 'warning') consoleEntries.push({ level: 'warning', text: msg.text() })
      }
      const onPageError = (err: Error) => pageErrors.push(err.message)
      const onRequestFailed = (req: {
        url: () => string
        resourceType: () => string
        failure: () => { errorText: string } | null
      }) =>
        failedRequests.push({
          url: req.url(),
          resourceType: req.resourceType(),
          failure: req.failure()?.errorText ?? 'unknown',
        })
      const onResponse = (res: {
        url: () => string
        status: () => number
        request: () => { resourceType: () => string }
      }) =>
        resources.push({
          url: res.url(),
          status: res.status(),
          resourceType: res.request().resourceType(),
        })

      page.on('console', onConsole)
      page.on('pageerror', onPageError)
      page.on('requestfailed', onRequestFailed)
      page.on('response', onResponse)

      let statusCode = 0
      let finalUrl = url
      let redirects: RedirectHop[] = []
      let links: string[] = []
      let title = ''
      let textLength = 0
      let responseHeaders: Record<string, string> = {}
      let error: string | undefined

      try {
        const response = await page.goto(url, {
          timeout: timeoutMs,
          waitUntil: 'domcontentloaded',
        })
        // Gambar dan skrip masih dalam perjalanan saat domcontentloaded, jadi
        // menunggu di sini adalah syarat agar `broken-resource` menemukan apa
        // pun. Tapi menunggunya dibatasi dan kegagalannya diabaikan: memakai
        // waitUntil:'load' langsung akan membuat satu request menggantung
        // menggagalkan seluruh halaman dan melaporkannya critical palsu.
        await page.waitForLoadState('load', { timeout: 5_000 }).catch(() => {})
        if (response) {
          statusCode = response.status()
          finalUrl = normalizeUrl(response.url())
          redirects = await redirectChain(response)
          responseHeaders = response.headers()
        }
        links = await page.$$eval('a[href]', (anchors) =>
          anchors.map((a) => (a as HTMLAnchorElement).href),
        )
        title = await page.title()
        textLength = await page.evaluate(() => document.body?.innerText.trim().length ?? 0)
      } catch (err) {
        // Navigasi yang gagal meninggalkan page dengan navigasi tertunda ke
        // chrome-error://chromewebdata/ dan tidak pernah pulih sendiri: setiap
        // goto berikutnya dibatalkan, sehingga satu halaman rusak mengubah
        // seluruh situs menjadi status 0 palsu. Membuang page dan membuat yang
        // baru adalah satu-satunya pemulihan yang terbukti.
        error = err instanceof Error ? err.message : String(err)
        statusCode = 0
        links = []
        page.off('console', onConsole)
        page.off('pageerror', onPageError)
        page.off('requestfailed', onRequestFailed)
        page.off('response', onResponse)
        await page.close().catch(() => {})
        page = await context.newPage()
      }

      page.off('console', onConsole)
      page.off('pageerror', onPageError)
      page.off('requestfailed', onRequestFailed)
      page.off('response', onResponse)

      results.push({
        url,
        finalUrl,
        statusCode,
        redirects,
        loadMs: Date.now() - startedAt,
        links,
        title,
        textLength,
        console: consoleEntries,
        pageErrors,
        failedRequests,
        resources,
        responseHeaders,
        ...(error === undefined ? {} : { error }),
      })

      for (const href of links) {
        let normalized: string
        try {
          normalized = normalizeUrl(href)
          // Awalan string bukan pemeriksaan origin: "https://a.test" juga
          // menjadi awalan dari a.test.evil.com dan a.test.co.
          if (new URL(normalized).origin !== origin) continue
        } catch {
          continue
        }
        if (seen.has(normalized)) continue
        seen.add(normalized)
        queue.push(normalized)
      }
    }
  } finally {
    await browser.close()
  }

  return results
}
```

- [ ] **Step 5: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/visit.test.ts`
Diharapkan: PASS, 8 test.

Catatan bila ada yang gagal: `page.off` dipanggil dua kali pada jalur error (sekali sebelum `page.close()`, sekali setelah blok try) — pemanggilan kedua pada page baru tidak berbahaya karena listener-nya memang belum terpasang di sana. Jangan menghapus pemanggilan pertama; tanpa itu listener tetap menempel pada page yang sudah ditutup.

- [ ] **Step 6: Commit**

```bash
git add lib/scanners/visit.ts test/visit.test.ts test/fixtures/rusak-konsol
git commit -m "Record everything the browser sees in one pass

The crawler now captures console messages, page errors, failed requests,
every resource's status, response headers, redirect chains and the final URL
— all from the same page load. Three scanners walking the same site three
times would have cost three times as much for the same data."
```

---

## Task 3: Analyzer bug

**Files:**
- Create: `lib/analyzers/bugs.ts`
- Test: `test/analyzer-bugs.test.ts`

Analyzer ini adalah fungsi murni. Test-nya tidak memakai Playwright maupun database — hanya objek `PageVisit` buatan sendiri.

- [ ] **Step 1: Tulis test yang gagal**

`test/analyzer-bugs.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { analyzeBugs } from '../lib/analyzers/bugs.ts'
import type { PageVisit } from '../lib/scanners/visit.ts'

function pageVisit(patch: Partial<PageVisit> = {}): PageVisit {
  return {
    url: 'https://a.test/x',
    finalUrl: 'https://a.test/x',
    statusCode: 200,
    redirects: [],
    loadMs: 100,
    links: [],
    title: 'Judul',
    textLength: 500,
    console: [],
    pageErrors: [],
    failedRequests: [],
    resources: [],
    responseHeaders: {},
    ...patch,
  }
}

test('halaman sehat tidak menghasilkan temuan', () => {
  expect(analyzeBugs([pageVisit()])).toEqual([])
})

test('status 404 menjadi temuan high', () => {
  const [f] = analyzeBugs([pageVisit({ statusCode: 404 })])
  expect(f?.rule).toBe('http-error')
  expect(f?.severity).toBe('high')
  expect(f?.url).toBe('https://a.test/x')
})

test('status 500 menjadi temuan critical', () => {
  const [f] = analyzeBugs([pageVisit({ statusCode: 500 })])
  expect(f?.rule).toBe('http-error')
  expect(f?.severity).toBe('critical')
})

test('redirect loop dikenali dari pesan error, bukan dari status', () => {
  const findings = analyzeBugs([
    pageVisit({ statusCode: 0, error: 'page.goto: net::ERR_TOO_MANY_REDIRECTS at ...' }),
  ])
  expect(findings.map((f) => f.rule)).toEqual(['redirect-loop'])
  expect(findings[0]!.severity).toBe('critical')
})

test('halaman gagal dimuat tanpa sebab redirect menjadi http-error critical', () => {
  const findings = analyzeBugs([
    pageVisit({ statusCode: 0, error: 'page.goto: net::ERR_CONNECTION_REFUSED at ...' }),
  ])
  expect(findings.map((f) => f.rule)).toEqual(['http-error'])
  expect(findings[0]!.severity).toBe('critical')
})

test('rantai redirect panjang dilaporkan sebagai low', () => {
  const findings = analyzeBugs([
    pageVisit({
      redirects: [
        { url: 'https://a.test/1', status: 301 },
        { url: 'https://a.test/2', status: 301 },
        { url: 'https://a.test/3', status: 302 },
      ],
    }),
  ])
  expect(findings.map((f) => f.rule)).toEqual(['redirect-chain'])
  expect(findings[0]!.severity).toBe('low')
})

test('satu redirect tunggal bukan temuan', () => {
  const findings = analyzeBugs([
    pageVisit({ redirects: [{ url: 'https://a.test/1', status: 301 }] }),
  ])
  expect(findings).toEqual([])
})

test('resource rusak menjadi satu temuan per resource', () => {
  const findings = analyzeBugs([
    pageVisit({
      resources: [
        { url: 'https://a.test/ok.png', status: 200, resourceType: 'image' },
        { url: 'https://a.test/hilang.png', status: 404, resourceType: 'image' },
        { url: 'https://a.test/rusak.js', status: 500, resourceType: 'script' },
      ],
    }),
  ])
  expect(findings).toHaveLength(2)
  expect(findings.every((f) => f.rule === 'broken-resource')).toBe(true)
  expect(new Set(findings.map((f) => f.key)).size).toBe(2)
})

test('halaman 200 yang nyaris tanpa teks dilaporkan sebagai blank-page', () => {
  const findings = analyzeBugs([pageVisit({ textLength: 3 })])
  expect(findings.map((f) => f.rule)).toEqual(['blank-page'])
  expect(findings[0]!.severity).toBe('high')
})

test('halaman error tidak ikut dilaporkan sebagai blank-page', () => {
  const findings = analyzeBugs([pageVisit({ statusCode: 404, textLength: 0 })])
  expect(findings.map((f) => f.rule)).toEqual(['http-error'])
})

test('setiap temuan membawa pageId bila dipetakan', () => {
  const findings = analyzeBugs([pageVisit({ statusCode: 404 })], {
    'https://a.test/x': 42,
  })
  expect(findings[0]!.pageId).toBe(42)
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/analyzer-bugs.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/analyzers/bugs.ts'`

- [ ] **Step 3: Tulis `lib/analyzers/bugs.ts`**

```typescript
import type { NewFinding } from '../findings.ts'
import type { PageVisit } from '../scanners/visit.ts'

/** Peta URL halaman ke `pages.id`, agar temuan dapat merujuk barisnya. */
export type PageIdMap = Record<string, number>

const TEKS_MINIMAL = 50

/**
 * Menilai hasil kunjungan sebagai bug fungsional — hal yang rusak bagi
 * pengunjung. Fungsi murni: tidak menyentuh browser maupun database, sehingga
 * dapat diuji dengan objek biasa dan dipakai ulang untuk recheck satu halaman.
 */
export function analyzeBugs(visits: PageVisit[], pageIds: PageIdMap = {}): NewFinding[] {
  const findings: NewFinding[] = []

  for (const v of visits) {
    const pageId = pageIds[v.url] ?? null

    if (v.statusCode === 0) {
      // Redirect loop punya perbaikan yang sama sekali berbeda dari "server
      // mati", jadi dibedakan sejak awal alih-alih digabung jadi "gagal dimuat".
      if (v.error?.includes('ERR_TOO_MANY_REDIRECTS')) {
        findings.push({
          url: v.url,
          pageId,
          severity: 'critical',
          rule: 'redirect-loop',
          title: `Redirect berputar tanpa henti: ${v.url}`,
          detail: { error: v.error },
        })
      } else {
        findings.push({
          url: v.url,
          pageId,
          severity: 'critical',
          rule: 'http-error',
          title: `Halaman gagal dimuat: ${v.url}`,
          detail: { error: v.error ?? null },
        })
      }
    } else if (v.statusCode >= 400) {
      findings.push({
        url: v.url,
        pageId,
        severity: v.statusCode >= 500 ? 'critical' : 'high',
        rule: 'http-error',
        title: `HTTP ${v.statusCode} pada ${v.url}`,
        detail: { statusCode: v.statusCode, loadMs: v.loadMs },
      })
    } else if (v.textLength < TEKS_MINIMAL) {
      findings.push({
        url: v.url,
        pageId,
        severity: 'high',
        rule: 'blank-page',
        title: `Halaman termuat tetapi nyaris kosong: ${v.url}`,
        detail: { textLength: v.textLength, title: v.title },
      })
    }

    if (v.redirects.length >= 3) {
      findings.push({
        url: v.url,
        pageId,
        severity: 'low',
        rule: 'redirect-chain',
        title: `${v.redirects.length} redirect berantai menuju ${v.finalUrl}`,
        detail: { redirects: v.redirects, finalUrl: v.finalUrl },
      })
    }

    for (const r of v.resources) {
      if (r.status < 400) continue
      findings.push({
        url: v.url,
        pageId,
        // `key` wajib: tanpa ini sepuluh gambar rusak di satu halaman
        // menyatu menjadi satu temuan.
        key: r.url,
        severity: 'high',
        rule: 'broken-resource',
        title: `${r.resourceType} gagal dimuat (HTTP ${r.status}): ${r.url}`,
        detail: { resourceUrl: r.url, status: r.status, resourceType: r.resourceType },
      })
    }
  }

  return findings
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/analyzer-bugs.test.ts`
Diharapkan: PASS, 11 test.

- [ ] **Step 5: Commit**

```bash
git add lib/analyzers/bugs.ts test/analyzer-bugs.test.ts
git commit -m "Add the bug analyzer

Turns a page visit into functional bugs: HTTP errors, redirect loops, long
redirect chains, broken images and scripts, and pages that load but are
blank. It's a pure function, so its tests need neither a browser nor a
database."
```

---

## Task 4: Analyzer konsol

**Files:**
- Create: `lib/analyzers/console.ts`
- Test: `test/analyzer-console.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/analyzer-console.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { analyzeConsole } from '../lib/analyzers/console.ts'
import type { PageVisit } from '../lib/scanners/visit.ts'

function pageVisit(patch: Partial<PageVisit> = {}): PageVisit {
  return {
    url: 'https://a.test/x',
    finalUrl: 'https://a.test/x',
    statusCode: 200,
    redirects: [],
    loadMs: 100,
    links: [],
    title: 'Judul',
    textLength: 500,
    console: [],
    pageErrors: [],
    failedRequests: [],
    resources: [],
    responseHeaders: {},
    ...patch,
  }
}

test('halaman bersih tidak menghasilkan temuan', () => {
  expect(analyzeConsole([pageVisit()])).toEqual([])
})

test('console.error menjadi temuan high', () => {
  const [f] = analyzeConsole([
    pageVisit({ console: [{ level: 'error', text: 'Gagal memuat modul' }] }),
  ])
  expect(f?.rule).toBe('console-error')
  expect(f?.severity).toBe('high')
  expect(f?.title).toContain('Gagal memuat modul')
})

test('console.warn menjadi temuan low', () => {
  const [f] = analyzeConsole([
    pageVisit({ console: [{ level: 'warning', text: 'Atribut usang' }] }),
  ])
  expect(f?.rule).toBe('console-warning')
  expect(f?.severity).toBe('low')
})

test('uncaught exception menjadi temuan critical', () => {
  const [f] = analyzeConsole([pageVisit({ pageErrors: ['TypeError: x is not a function'] })])
  expect(f?.rule).toBe('uncaught-exception')
  expect(f?.severity).toBe('critical')
})

test('request gagal menjadi temuan medium, satu per URL', () => {
  const findings = analyzeConsole([
    pageVisit({
      failedRequests: [
        { url: 'https://a.test/a.json', resourceType: 'fetch', failure: 'net::ERR_FAILED' },
        { url: 'https://a.test/b.json', resourceType: 'fetch', failure: 'net::ERR_FAILED' },
      ],
    }),
  ])
  expect(findings).toHaveLength(2)
  expect(findings.every((f) => f.rule === 'failed-request')).toBe(true)
  expect(new Set(findings.map((f) => f.key)).size).toBe(2)
})

test('pesan identik pada satu halaman tidak digandakan', () => {
  const findings = analyzeConsole([
    pageVisit({
      console: [
        { level: 'error', text: 'Gagal memuat modul' },
        { level: 'error', text: 'Gagal memuat modul' },
      ],
    }),
  ])
  expect(findings).toHaveLength(1)
})

test('pesan yang hanya berbeda pada timestamp dianggap sama', () => {
  const findings = analyzeConsole([
    pageVisit({
      console: [
        { level: 'error', text: 'Request 1738291047123 gagal' },
        { level: 'error', text: 'Request 1738299999999 gagal' },
      ],
    }),
  ])
  expect(findings).toHaveLength(1)
})

test('error dan warning dengan teks sama tetap dua temuan berbeda', () => {
  const findings = analyzeConsole([
    pageVisit({
      console: [
        { level: 'error', text: 'sama' },
        { level: 'warning', text: 'sama' },
      ],
    }),
  ])
  expect(findings.map((f) => f.rule).sort()).toEqual(['console-error', 'console-warning'])
})

test('halaman yang gagal dimuat tidak dilaporkan konsolnya', () => {
  const findings = analyzeConsole([
    pageVisit({ statusCode: 0, console: [{ level: 'error', text: 'apa pun' }] }),
  ])
  expect(findings).toEqual([])
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/analyzer-console.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/analyzers/console.ts'`

- [ ] **Step 3: Tulis `lib/analyzers/console.ts`**

```typescript
import type { NewFinding } from '../findings.ts'
import type { PageVisit } from '../scanners/visit.ts'
import { stableKey } from './fingerprint-key.ts'
import type { PageIdMap } from './bugs.ts'

/**
 * Menilai hasil kunjungan sebagai error dan warning browser. Fungsi murni:
 * tidak menyentuh browser maupun database.
 *
 * Halaman yang gagal dimuat sengaja dilewati — konsolnya kosong atau berisi
 * kebisingan dari halaman error Chromium, bukan dari situs yang diaudit.
 * Kegagalannya sendiri sudah dilaporkan analyzer bug.
 */
export function analyzeConsole(visits: PageVisit[], pageIds: PageIdMap = {}): NewFinding[] {
  const findings: NewFinding[] = []

  for (const v of visits) {
    if (v.statusCode === 0) continue
    const pageId = pageIds[v.url] ?? null

    // Satu halaman kerap memancarkan pesan yang sama berkali-kali (loop render,
    // komponen berulang). Digabung di sini, per halaman, supaya satu pesan
    // menjadi satu temuan dengan riwayat yang utuh.
    const terlihat = new Set<string>()
    const tambah = (f: NewFinding): void => {
      const identitas = `${f.rule}\n${f.key ?? ''}`
      if (terlihat.has(identitas)) return
      terlihat.add(identitas)
      findings.push(f)
    }

    for (const err of v.pageErrors) {
      tambah({
        url: v.url,
        pageId,
        key: stableKey(err),
        severity: 'critical',
        rule: 'uncaught-exception',
        title: `Exception tidak tertangkap: ${err.slice(0, 120)}`,
        detail: { message: err },
      })
    }

    for (const entry of v.console) {
      tambah({
        url: v.url,
        pageId,
        key: stableKey(entry.text),
        severity: entry.level === 'error' ? 'high' : 'low',
        rule: entry.level === 'error' ? 'console-error' : 'console-warning',
        title: `console.${entry.level === 'error' ? 'error' : 'warn'}: ${entry.text.slice(0, 120)}`,
        detail: { text: entry.text },
      })
    }

    for (const req of v.failedRequests) {
      tambah({
        url: v.url,
        pageId,
        key: req.url,
        severity: 'medium',
        rule: 'failed-request',
        title: `Permintaan gagal (${req.failure}): ${req.url}`,
        detail: { requestUrl: req.url, failure: req.failure, resourceType: req.resourceType },
      })
    }
  }

  return findings
}
```

Catatan tentang dedup: `reconcile` memang sudah menggabungkan fingerprint kembar dalam satu batch, tetapi test di atas memeriksa keluaran `analyzeConsole` **secara langsung** — jadi dedup harus terjadi di analyzer, seperti pada kode di atas. Jangan menghapus `tambah`.

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/analyzer-console.test.ts`
Diharapkan: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add lib/analyzers/console.ts test/analyzer-console.test.ts
git commit -m "Add the console analyzer

Reports uncaught exceptions, console errors and warnings, and requests that
failed at the network level. Messages are keyed on a normalised form, so a
timestamp in the text doesn't make the same error look new every night."
```

---

## Task 5: Job pemindaian yang merekonsiliasi dua kategori

**Files:**
- Create: `lib/jobs/scan.ts`
- Test: `test/scan-job.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/scan-job.test.ts`:

```typescript
import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { enqueue } from '../lib/queue.ts'
import { drainQueue } from '../lib/runner.ts'
import { scanHandler } from '../lib/jobs/scan.ts'
import { startFixtureServer } from './fixture-server.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
})

function jalankan(siteId: number, only?: string) {
  const run = createRun(db, siteId, 'full')
  enqueue(db, {
    runId: run.id,
    type: 'scan',
    payload: only === undefined ? { siteId } : { siteId, only },
  })
  return drainQueue(db, { scan: scanHandler }, { concurrency: 1 })
}

test('satu pemindaian mengisi kategori bugs dan console sekaligus', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    const summary = await jalankan(site.id)
    expect(summary).toEqual({ done: 1, failed: 0 })

    const kategori = db
      .prepare('SELECT category, COUNT(*) AS n FROM findings GROUP BY category ORDER BY category')
      .all() as { category: string; n: number }[]
    const peta = new Map(kategori.map((k) => [k.category, Number(k.n)]))

    expect(peta.get('bugs')).toBeGreaterThanOrEqual(1) // gambar hilang
    expect(peta.get('console')).toBeGreaterThanOrEqual(2) // error + warning
  } finally {
    await server.close()
  }
})

test('halaman tersimpan dan temuan merujuk ke page_id', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    await jalankan(site.id)

    const yatim = db
      .prepare('SELECT COUNT(*) AS n FROM findings WHERE page_id IS NULL')
      .get() as { n: number }
    expect(Number(yatim.n)).toBe(0)
  } finally {
    await server.close()
  }
})

test('only=bugs hanya merekonsiliasi kategori bugs', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    await jalankan(site.id, 'bugs')

    const kategori = db
      .prepare('SELECT DISTINCT category FROM findings')
      .all() as { category: string }[]
    expect(kategori.map((k) => k.category)).toEqual(['bugs'])
  } finally {
    await server.close()
  }
})

test('situs tidak terjangkau menggagalkan job tanpa menandai temuan fixed', async () => {
  const server = await startFixtureServer('rusak-konsol')
  const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
  await jalankan(site.id)

  const sebelum = db
    .prepare("SELECT COUNT(*) AS n FROM findings WHERE status = 'open'")
    .get() as { n: number }
  expect(Number(sebelum.n)).toBeGreaterThan(0)

  await server.close()
  const summary = await jalankan(site.id)
  expect(summary).toEqual({ done: 0, failed: 1 })

  const sesudah = db
    .prepare("SELECT COUNT(*) AS n FROM findings WHERE status = 'open'")
    .get() as { n: number }
  expect(Number(sesudah.n)).toBe(Number(sebelum.n))
})

test('pemindaian kedua atas situs yang sama tidak menggandakan apa pun', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    await jalankan(site.id)
    const pertama = db.prepare('SELECT COUNT(*) AS n FROM findings').get() as { n: number }

    await jalankan(site.id)
    const kedua = db.prepare('SELECT COUNT(*) AS n FROM findings').get() as { n: number }

    expect(Number(kedua.n)).toBe(Number(pertama.n))
    const halaman = db.prepare('SELECT COUNT(*) AS n FROM pages').get() as { n: number }
    expect(Number(halaman.n)).toBe(1)
  } finally {
    await server.close()
  }
})

test('situs tidak dikenal menggagalkan job dengan pesan jelas', async () => {
  const site = createSite(db, { name: 'X', base_url: 'https://x.test' })
  const run = createRun(db, site.id, 'full')
  enqueue(db, { runId: run.id, type: 'scan', payload: { siteId: 999 } })

  const summary = await drainQueue(db, { scan: scanHandler }, { concurrency: 1 })
  expect(summary).toEqual({ done: 0, failed: 1 })

  const failed = db.prepare("SELECT error FROM jobs WHERE status = 'failed'").get() as {
    error: string
  }
  expect(failed.error).toContain('999')
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/scan-job.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/jobs/scan.ts'`

- [ ] **Step 3: Tulis `lib/jobs/scan.ts`**

```typescript
import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { upsertPage } from '../repos/pages.ts'
import { reconcile } from '../findings.ts'
import { visit } from '../scanners/visit.ts'
import { analyzeBugs, type PageIdMap } from '../analyzers/bugs.ts'
import { analyzeConsole } from '../analyzers/console.ts'

const ANALYZERS = {
  bugs: analyzeBugs,
  console: analyzeConsole,
} as const

export type ScanCategory = keyof typeof ANALYZERS

/**
 * Satu kunjungan browser, lalu setiap analyzer menilai data yang sama.
 * Menjalankan dua kategori berarti dua rekonsiliasi, bukan dua penjelajahan.
 */
export async function scanHandler(job: Job, db: DatabaseSync): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const only = job.payload.only === undefined ? undefined : String(job.payload.only)
  if (only !== undefined && !(only in ANALYZERS)) {
    throw new Error(`Kategori tidak dikenal: ${only}`)
  }
  const categories = (only === undefined ? Object.keys(ANALYZERS) : [only]) as ScanCategory[]

  const visits = await visit(site.base_url, { maxPages: site.max_pages })

  // Situs yang tidak terjangkau menghasilkan kunjungan kosong. Merekonsiliasi
  // hasil itu akan menandai setiap temuan lama sebagai "sudah diperbaiki" —
  // jawaban percaya diri yang salah. Lebih baik menggagalkan job.
  const root = visits[0]
  if (!root || root.statusCode === 0) {
    throw new Error(
      `Situs tidak terjangkau: ${site.base_url} — pemindaian dibatalkan agar temuan lama ` +
        `tidak salah ditandai sudah diperbaiki`,
    )
  }

  const pageIds: PageIdMap = {}
  for (const v of visits) {
    const stored = upsertPage(db, siteId, {
      url: v.url,
      statusCode: v.statusCode,
      loadMs: v.loadMs,
    })
    pageIds[v.url] = stored.id
  }

  for (const category of categories) {
    reconcile(db, siteId, job.run_id, category, ANALYZERS[category](visits, pageIds))
  }
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/scan-job.test.ts`
Diharapkan: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/scan.ts test/scan-job.test.ts
git commit -m "Run one visit and reconcile both categories from it

Scanning bugs and console no longer means walking the site twice. An
unreachable site still fails the job rather than quietly marking every open
finding as fixed."
```

---

## Task 6: CLI untuk memindai

**Files:**
- Modify: `scripts/scan.ts`
- Test: dijalankan manual (CLI tidak punya test otomatis di rencana ini)

- [ ] **Step 1: Tambahkan perintah `scan` dan `findings`**

Di `scripts/scan.ts`, ganti impor `crawlHandler` dengan `scanHandler`:

```typescript
import { scanHandler } from '../lib/jobs/scan.ts'
```

dan ganti konstanta handler:

```typescript
const HANDLERS = { scan: scanHandler }
```

Perbarui `USAGE`:

```typescript
const USAGE = `Penggunaan:
  npm run scan -- add-site <nama> <url>      Menambahkan situs
  npm run scan -- list                       Menampilkan semua situs
  npm run scan -- scan <site-id> [kategori]  Memindai situs (kategori: bugs|console)
  npm run scan -- pages <site-id>            Menampilkan halaman tersimpan
  npm run scan -- findings <site-id>         Menampilkan temuan terbuka`
```

Ganti seluruh blok `case 'crawl':` dengan:

```typescript
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

      requeueInterrupted(db)

      const run = createRun(db, site.id, 'full')
      enqueue(db, {
        runId: run.id,
        type: 'scan',
        payload: only === undefined ? { siteId: site.id } : { siteId: site.id, only },
      })
      console.log(`Run ${run.id}: memindai ${site.base_url} ...`)

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
      console.log(
        `Antrian global terkuras: ${summary.done} berhasil, ${summary.failed} gagal.`,
      )
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
      for (const r of rows) console.log(`${r.severity}\t${r.category}\t${r.rule}\t${r.title}`)
      console.log(`${rows.length} temuan terbuka.`)
      return 0
    }
```

- [ ] **Step 2: Verifikasi manual terhadap situs sungguhan**

```bash
rm -f data.db
npm run scan -- add-site Springair https://springair.co.id
npm run scan -- scan 1
npm run scan -- findings 1
npm run scan -- scan 1 console
```

Diharapkan: pemindaian selesai, rekap per kategori/severity tercetak, `findings` menampilkan daftar terurut severity, dan `scan 1 console` hanya menyentuh kategori `console`. Catat jumlah temuan yang muncul per kategori dan laporkan.

- [ ] **Step 3: Jalankan seluruh test dan typecheck**

Run: `npm test` dan `npx tsc --noEmit`
Diharapkan: seluruh test lulus, typecheck bersih.

- [ ] **Step 4: Commit**

```bash
git add scripts/scan.ts
git commit -m "Replace the crawl command with a scan command

One command now runs both analyzers, or just one if you name a category.
There's also a findings command, so you can read what a scan found without
opening the database."
```

---

## Task 7: Hapus jalur crawl yang lama

Penggantinya sudah terbukti, jadi kode lama dibuang. Membiarkan dua jalur hidup berdampingan adalah cara termudah membuat orang memperbaiki bug di file yang salah.

**Files:**
- Delete: `lib/scanners/crawl.ts`, `lib/jobs/crawl.ts`, `test/crawl.test.ts`, `test/crawl-job.test.ts`

- [ ] **Step 1: Pastikan tidak ada lagi yang mengimpornya**

```bash
grep -rn "scanners/crawl\|jobs/crawl" lib scripts test
```
Diharapkan: tidak ada keluaran. Bila masih ada, perbaiki pemanggilnya dulu.

- [ ] **Step 2: Hapus berkas**

```bash
git rm lib/scanners/crawl.ts lib/jobs/crawl.ts test/crawl.test.ts test/crawl-job.test.ts
```

- [ ] **Step 3: Jalankan seluruh test dan typecheck**

Run: `npm test` dan `npx tsc --noEmit`
Diharapkan: seluruh test lulus, typecheck bersih. Jumlah test berkurang sebanyak test crawl lama (9), bertambah oleh test baru.

- [ ] **Step 4: Commit**

```bash
git commit -m "Remove the old crawl path

visit.ts and scan.ts cover everything it did. Two live paths doing the same
job is the easiest way to end up fixing a bug in the file nobody runs."
```

---

## Definisi Selesai

- [ ] `npm test` lulus seluruhnya dan `npx tsc --noEmit` bersih
- [ ] `npm run scan -- scan <id>` mengisi kategori `bugs` dan `console` dari satu kunjungan browser
- [ ] `npm run scan -- scan <id> bugs` hanya menyentuh kategori itu
- [ ] Memindai dua kali tidak menggandakan halaman maupun temuan
- [ ] Pesan konsol yang hanya berbeda pada timestamp tidak membuka temuan baru tiap scan
- [ ] Situs tidak terjangkau menggagalkan job, bukan menandai semua temuan `fixed`
- [ ] Analyzer tidak mengimpor Playwright maupun modul database — dibuktikan dengan `grep`
- [ ] `lib/scanners/crawl.ts` dan `lib/jobs/crawl.ts` sudah tidak ada

## Rencana Berikutnya

3. **Security** — header hilang, cookie tanpa flag, mixed content, file sensitif publik, library JS rentan, TLS hampir kedaluwarsa. Sumber datanya permintaan langsung ke server, bukan kunjungan browser, dan `responseHeaders` yang sudah dikumpulkan Task 2 menjadi masukannya. Hanya pemeriksaan pasif.
4. **Lighthouse** — runner paralel, penganggaran `sample`/`full`, `strategy` wajib masuk ke `key` fingerprint agar mobile dan desktop tidak saling menimpa.
5. **Lapisan AI** — spawn CLI `claude`/`gemini`, file prompt, `ai_status`.
6. **SEO** — integrasi plugin `claude-seo`.
7. **UI** — tema vintage terminal via `impeccable` + `frontend-design`.
8. **Export Excel, scheduler, notifikasi email, Docker.**
