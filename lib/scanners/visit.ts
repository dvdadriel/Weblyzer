import { chromium, type Browser, type Page, type Response } from 'playwright'
import { normalizeUrl } from '../url.ts'

export { normalizeUrl }

/**
 * Data SEO satu halaman.
 *
 * Yang dipilih adalah hal yang tidak bisa disimpulkan dari data lain, dan
 * khususnya hal yang butuh MELIHAT BANYAK HALAMAN untuk dinilai: judul dan
 * description hanya bisa disebut kembar kalau halaman lain juga diketahui, dan
 * hreflang hanya bisa disebut tidak konsisten kalau pasangannya ikut dibaca.
 * Di situlah letak nilainya dibanding Lighthouse, yang tiap kali hanya melihat
 * satu halaman dan hanya pada segelintir halaman sampel.
 */
export type SeoHalaman = {
  metaDescription: string
  h1: string[]
  canonical: string | null
  metaRobots: string | null
  lang: string | null
  hreflang: { lang: string; href: string }[]
}

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
  /** Header Set-Cookie apa adanya, satu entri per cookie.
   *
   *  Diambil dari `headersArray()` karena `headers()` **tidak memuat Set-Cookie
   *  sama sekali** — bukan menggabungkannya, melainkan menghilangkannya
   *  (terverifikasi: `responseHeaders['set-cookie']` adalah undefined pada
   *  respons yang jelas mengirim dua cookie). Jadi ini satu-satunya sumbernya,
   *  dan bentuk array-nya sekaligus menjaga flag tiap cookie tetap terpisah. */
  setCookies: string[]
  /**
   * Elemen yang dinilai analyzer SEO. Dikumpulkan di sini, bukan dinilai —
   * pemisahan yang sama seperti tiga kategori lain.
   */
  seo: SeoHalaman
  /** Pesan kegagalan navigasi, bila ada. */
  error?: string
}

export type VisitOptions = {
  maxPages?: number
  timeoutMs?: number
  /**
   * Kunjungi tepat URL-URL ini dan JANGAN ikuti tautannya.
   *
   * Dipakai pemeriksaan ulang satu temuan: menjelajah 141 halaman untuk
   * memastikan satu bug sudah beres adalah tiga menit untuk satu pertanyaan
   * yang bisa dijawab dalam dua detik. Tautan sengaja tidak diikuti — begitu
   * diikuti, ini bukan pemeriksaan satu halaman lagi.
   */
  hanya?: string[]
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

    const targeted = opts.hanya !== undefined && opts.hanya.length > 0
    const queue: string[] = targeted
      ? opts.hanya!.map((u) => normalizeUrl(u))
      : [normalizeUrl(baseUrl)]
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
      let setCookies: string[] = []
      let seo: SeoHalaman = {
        metaDescription: '',
        h1: [],
        canonical: null,
        metaRobots: null,
        lang: null,
        hreflang: [],
      }
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
          setCookies = (await response.headersArray())
            .filter((h) => h.name.toLowerCase() === 'set-cookie')
            .map((h) => h.value)
        }
        links = await page.$$eval('a[href]', (anchors) =>
          anchors.map((a) => (a as HTMLAnchorElement).href),
        )
        title = await page.title()
        mediaCount = await page.$$eval('img, video, iframe, canvas, picture', (els) => els.length)
        textLength = await page.evaluate(() => document.body?.innerText.trim().length ?? 0)
        // Satu `evaluate` untuk enam field, bukan enam panggilan: tiap
        // panggilan adalah satu perjalanan ke browser, dan 141 halaman x 5
        // perjalanan tambahan adalah biaya yang tidak membeli apa pun.
        seo = await page.evaluate(() => {
          const isi = (sel: string) =>
            (document.querySelector(sel) as HTMLMetaElement | null)?.content?.trim() ?? ''
          return {
            metaDescription: isi('meta[name="description" i]'),
            h1: [...document.querySelectorAll('h1')].map((h) => h.textContent?.trim() ?? ''),
            // `href` pada elemen link sudah diabsolutkan browser, jadi
            // canonical relatif tidak perlu digabung tangan.
            canonical:
              (document.querySelector('link[rel="canonical" i]') as HTMLLinkElement | null)?.href ??
              null,
            metaRobots: isi('meta[name="robots" i]') || null,
            lang: document.documentElement.getAttribute('lang'),
            hreflang: [...document.querySelectorAll('link[rel="alternate" i][hreflang]')].map(
              (l) => ({
                lang: (l as HTMLLinkElement).hreflang,
                href: (l as HTMLLinkElement).href,
              }),
            ),
          }
        })
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
        setCookies,
        seo,
        ...(error === undefined ? {} : { error }),
      })

      // Mode tertarget berhenti di sini: yang diminta cuma halaman ini.
      if (targeted) continue

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
