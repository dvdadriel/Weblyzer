import { chromium, type Browser, type Page, type Response } from 'playwright'
import { normalizeUrl } from '../url.ts'

export { normalizeUrl }

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
  mediaCount: number
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
 * `Request.response()` di Playwright adalah async — ia menunggu respons tiba.
 * Memanggilnya tanpa await mengembalikan Promise, bukan Response, sehingga
 * `.status()` melempar dan seluruh navigasi tercatat gagal padahal berhasil.
 */
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
      const resourceSeen = new Set<string>()

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
      }) => {
        const identitas = `${res.url()}\n${res.status()}`
        if (resourceSeen.has(identitas)) return
        resourceSeen.add(identitas)
        resources.push({
          url: res.url(),
          status: res.status(),
          resourceType: res.request().resourceType(),
        })
      }

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
      let mediaCount = 0
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
        // `load` menyala saat jaringan senyap, sementara halaman yang dirender
        // klien baru menuliskan isinya beberapa saat kemudian. Tanpa jeda ini
        // setiap rute React/Vue terukur 0 karakter dan aturan blank-page akan
        // mengarang temuan. Halaman yang isinya sudah ada kembali seketika,
        // jadi biayanya hanya dibayar halaman yang benar-benar kosong.
        // Argumen kedua `waitForFunction` adalah `arg` untuk fungsi halaman,
        // bukan opsi; menaruh `{ timeout }` di sana membuat batas waktunya
        // jatuh ke default 30 detik dan setiap halaman pendek menggantung.
        await page
          .waitForFunction(() => (document.body?.innerText.trim().length ?? 0) >= 50, undefined, {
            timeout: 1_500,
          })
          .catch(() => {})
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
        mediaCount = await page.$$eval('img, video, iframe, canvas, picture', (els) => els.length)
        textLength = await page.evaluate(() => document.body?.innerText.trim().length ?? 0)
      } catch (err) {
        // Navigasi yang gagal meninggalkan page dengan navigasi tertunda ke
        // chrome-error://chromewebdata/ dan tidak pernah pulih sendiri: setiap
        // goto berikutnya dibatalkan, sehingga satu halaman rusak mengubah
        // seluruh situs menjadi status 0 palsu. Membuang page dan membuat yang
        // baru adalah satu-satunya pemulihan yang terbukti.
        error = err instanceof Error ? err.message : String(err)
        // Status sesungguhnya sudah tertangkap di `resources` sebelum navigasi
        // kehabisan waktu. Membuangnya berarti melaporkan halaman hidup sebagai
        // tidak terjangkau — temuan critical yang dikarang.
        //
        // Hop 3xx dikecualikan: pada redirect berputar seluruh entri document
        // adalah 302, dan memungutnya akan menutupi bahwa tidak ada dokumen yang
        // pernah tiba — aturan redirect-loop bergantung pada status 0. Yang
        // dicari adalah dokumen terakhir yang sungguh terkirim.
        const dokumen = resources.findLast(
          (r) => r.resourceType === 'document' && (r.status < 300 || r.status >= 400),
        )
        statusCode = dokumen?.status ?? 0
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
        mediaCount,
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
