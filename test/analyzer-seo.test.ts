import { test, expect } from 'vitest'
import { analyzeSeo } from '../lib/analyzers/seo.ts'
import type { PageVisit, SeoHalaman } from '../lib/scanners/visit.ts'
import { SEO_KOSONG } from './seo-kosong.ts'

function hal(url: string, patch: Partial<PageVisit> = {}, seo: Partial<SeoHalaman> = {}): PageVisit {
  return {
    url,
    finalUrl: url,
    statusCode: 200,
    redirects: [],
    loadMs: 100,
    links: [],
    title: 'Judul Wajar',
    textLength: 500,
    mediaCount: 0,
    console: [],
    pageErrors: [],
    failedRequests: [],
    resources: [],
    responseHeaders: {},
    setCookies: [],
    seo: { ...SEO_KOSONG, metaDescription: 'Deskripsi wajar', h1: ['Satu H1'], ...seo },
    ...patch,
  }
}
const aturan = (f: ReturnType<typeof analyzeSeo>) => f.map((x) => x.rule)

/* ── Antar halaman: alasan tab ini ada ───────────────────────────────────── */

test('judul kembar dilaporkan sekali per kelompok, bukan sekali per halaman', () => {
  const f = analyzeSeo([
    hal('https://a.test/1', { title: 'Sama' }),
    hal('https://a.test/2', { title: 'Sama' }),
    hal('https://a.test/3', { title: 'Sama' }),
  ])
  const kembar = f.filter((x) => x.rule === 'judul-kembar')
  expect(kembar).toHaveLength(1)
  expect(kembar[0]!.title).toMatch(/^3 halaman memakai judul yang sama/)
  expect((kembar[0]!.detail as { halaman: string[] }).halaman).toHaveLength(3)
})

test('dua kelompok judul kembar menghasilkan dua temuan berbeda', () => {
  const f = analyzeSeo([
    hal('https://a.test/1', { title: 'A' }),
    hal('https://a.test/2', { title: 'A' }),
    hal('https://a.test/3', { title: 'B' }),
    hal('https://a.test/4', { title: 'B' }),
  ])
  const kembar = f.filter((x) => x.rule === 'judul-kembar')
  expect(kembar).toHaveLength(2)
  expect(new Set(kembar.map((k) => k.key)).size).toBe(2)
})

test('judul unik tidak dilaporkan kembar', () => {
  const f = analyzeSeo([hal('https://a.test/1', { title: 'A' }), hal('https://a.test/2', { title: 'B' })])
  expect(aturan(f)).not.toContain('judul-kembar')
})

test('beda spasi dan kapitalisasi tetap terhitung kembar', () => {
  const f = analyzeSeo([
    hal('https://a.test/1', { title: 'Toko  Kasur' }),
    hal('https://a.test/2', { title: 'toko kasur' }),
  ])
  expect(aturan(f)).toContain('judul-kembar')
})

test('description kembar dilaporkan terpisah dari judul', () => {
  const f = analyzeSeo([
    hal('https://a.test/1', { title: 'A' }, { metaDescription: 'Sama' }),
    hal('https://a.test/2', { title: 'B' }, { metaDescription: 'Sama' }),
  ])
  expect(aturan(f)).toContain('deskripsi-kembar')
  expect(aturan(f)).not.toContain('judul-kembar')
})

test('dua nilai lang tanpa hreflang dilaporkan', () => {
  const f = analyzeSeo([
    hal('https://a.test/1', { title: 'A' }, { lang: 'id' }),
    hal('https://a.test/2', { title: 'B' }, { lang: 'en' }),
  ])
  expect(aturan(f)).toContain('hreflang-hilang')
})

/** Situs yang sudah memasang hreflang tidak boleh dilaporkan kehilangannya. */
test('hreflang yang sudah ada membungkam aturan itu', () => {
  const f = analyzeSeo([
    hal('https://a.test/1', { title: 'A' }, { lang: 'id', hreflang: [{ lang: 'en', href: 'https://a.test/2' }] }),
    hal('https://a.test/2', { title: 'B' }, { lang: 'en' }),
  ])
  expect(aturan(f)).not.toContain('hreflang-hilang')
})

test('satu bahasa saja bukan masalah hreflang', () => {
  const f = analyzeSeo([
    hal('https://a.test/1', { title: 'A' }, { lang: 'id' }),
    hal('https://a.test/2', { title: 'B' }, { lang: 'id' }),
  ])
  expect(aturan(f)).not.toContain('hreflang-hilang')
})

/* ── Per halaman ─────────────────────────────────────────────────────────── */

test('judul hilang dan judul kepanjangan tidak dilaporkan bersamaan', () => {
  expect(aturan(analyzeSeo([hal('https://a.test/1', { title: '  ' })]))).toContain('judul-hilang')
  const panjang = analyzeSeo([hal('https://a.test/1', { title: 'x'.repeat(80) })])
  expect(aturan(panjang)).toContain('judul-panjang')
  expect(aturan(panjang)).not.toContain('judul-hilang')
})

/**
 * Terbukti di lapangan: halaman utama springair.co.id punya satu `<h1>` yang
 * isinya kosong. Aturan "h1 ada" meloloskannya padahal bagi mesin pencari
 * sama saja dengan tidak ada.
 */
test('h1 yang ada tapi kosong dibedakan dari h1 yang tidak ada', () => {
  expect(aturan(analyzeSeo([hal('https://a.test/1', {}, { h1: [] })]))).toContain('h1-hilang')
  const kosong = analyzeSeo([hal('https://a.test/1', {}, { h1: ['  '] })])
  expect(aturan(kosong)).toContain('h1-kosong')
  expect(aturan(kosong)).not.toContain('h1-hilang')
})

/**
 * Beberapa h1 BUKAN masalah SEO, dan aturannya sengaja tidak ada. Diukur
 * sebelum dibuang: 98 temuan dari 141 halaman, mengubur 46 kelompok judul
 * kembar yang justru masalah nyata.
 */
test('beberapa h1 tidak dilaporkan sebagai masalah', () => {
  const f = analyzeSeo([hal('https://a.test/1', {}, { h1: ['Satu', 'Dua', 'Tiga'] })])
  expect(aturan(f)).not.toContain('h1-ganda')
  expect(aturan(f)).not.toContain('h1-hilang')
  expect(aturan(f)).not.toContain('h1-kosong')
})

test('canonical lintas domain dilaporkan high, canonical sendiri tidak', () => {
  const luar = analyzeSeo([
    hal('https://a.test/1', {}, { canonical: 'https://lain.test/1' }),
  ])
  expect(luar.find((x) => x.rule === 'canonical-lintas-domain')?.severity).toBe('high')
  const sendiri = analyzeSeo([hal('https://a.test/1', {}, { canonical: 'https://a.test/1' })])
  expect(aturan(sendiri)).not.toContain('canonical-lintas-domain')
  expect(aturan(sendiri)).not.toContain('canonical-hilang')
})

test('noindex dilaporkan sebagai info, bukan sebagai masalah', () => {
  const f = analyzeSeo([hal('https://a.test/1', {}, { metaRobots: 'noindex, follow' })])
  expect(f.find((x) => x.rule === 'noindex')?.severity).toBe('info')
})

/**
 * Halaman yang gagal dimuat tidak dinilai. Judul kosong pada halaman error
 * Chromium bukan judul yang hilang di situs — dan melaporkannya berarti setiap
 * HTTP 500 melahirkan lima temuan SEO palsu.
 */
test('halaman non-2xx tidak dinilai sama sekali', () => {
  const f = analyzeSeo([
    hal('https://a.test/mati', { statusCode: 500, title: '' }, { h1: [], metaDescription: '' }),
  ])
  expect(f).toEqual([])
})

test('halaman gagal tidak ikut menghitung kekembaran', () => {
  const f = analyzeSeo([
    hal('https://a.test/1', { title: 'Sama' }),
    hal('https://a.test/2', { statusCode: 404, title: 'Sama' }),
  ])
  expect(aturan(f)).not.toContain('judul-kembar')
})
