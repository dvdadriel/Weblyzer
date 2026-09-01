import { chromium, type Browser } from 'playwright'

export type CrawledPage = {
  url: string
  statusCode: number
  loadMs: number
  links: string[]
}

export type CrawlOptions = {
  maxPages?: number
  /** Batas waktu per halaman, agar satu halaman menggantung tidak membekukan antrian. */
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

export async function crawl(baseUrl: string, opts: CrawlOptions = {}): Promise<CrawledPage[]> {
  // max_pages berasal dari kolom SQLite tanpa validasi, dan afinitas INTEGER
  // menyimpan nilai non-numerik apa adanya. `Math.floor('abc')` adalah NaN,
  // `results.length < NaN` selalu false, dan crawl mengembalikan [] — situs sehat
  // yang terlihat mati. Tangkap NaN eksplisit, sama seperti runner.ts.
  const requested = Number(opts.maxPages ?? 200)
  const maxPages = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 200
  const timeoutMs = opts.timeoutMs ?? 20_000
  const origin = new URL(baseUrl).origin

  const browser: Browser = await chromium.launch()
  const results: CrawledPage[] = []

  try {
    const context = await browser.newContext()
    let page = await context.newPage()

    const queue: string[] = [normalizeUrl(baseUrl)]
    const seen = new Set<string>(queue)

    while (queue.length > 0 && results.length < maxPages) {
      const url = queue.shift()!
      const startedAt = Date.now()

      let statusCode = 0
      let links: string[] = []
      try {
        const response = await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })
        statusCode = response?.status() ?? 0
        links = await page.$$eval('a[href]', (anchors) =>
          anchors.map((a) => (a as HTMLAnchorElement).href),
        )
      } catch {
        // Halaman gagal dimuat tetap dicatat dengan status 0 agar terlihat di laporan,
        // bukan hilang diam-diam.
        statusCode = 0
        links = []

        // Navigasi yang gagal meninggalkan page dengan navigasi tertunda ke
        // chrome-error://chromewebdata/ dan tidak pernah pulih sendiri: setiap
        // goto berikutnya dibatalkan, sehingga satu halaman rusak mengubah
        // seluruh situs menjadi status 0 palsu. Membuang page dan membuat yang
        // baru adalah satu-satunya pemulihan yang terbukti — goto ke
        // about:blank TIDAK cukup.
        await page.close().catch(() => {})
        page = await context.newPage()
      }

      results.push({ url, statusCode, loadMs: Date.now() - startedAt, links })

      for (const href of links) {
        let normalized: string
        try {
          normalized = normalizeUrl(href)
          // Awalan string bukan pemeriksaan origin: "https://a.test" juga
          // menjadi awalan dari a.test.evil.com, a.test.co, dan a.test-b.com.
          // Origin yang diurai membandingkan skema, host, dan port sesungguhnya.
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
