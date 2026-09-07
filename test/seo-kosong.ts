import type { SeoHalaman } from '../lib/scanners/visit.ts'

/**
 * Blok SEO netral untuk helper `pageVisit` di berkas test.
 *
 * Dipusatkan supaya satu field baru tidak perlu disalin ke empat berkas — dan
 * supaya `seo` tetap WAJIB di `PageVisit`. Membuatnya opsional akan membuat
 * kode produksi bisa lupa mengisinya tanpa satu pun keluhan compiler.
 */
export const SEO_KOSONG: SeoHalaman = {
  metaDescription: '',
  h1: [],
  canonical: null,
  metaRobots: null,
  lang: null,
  hreflang: [],
}
