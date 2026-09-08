import { test, expect } from 'vitest'
import { validasi, perkiraanMenit } from '../lib/pengaturan-situs.ts'

const dasar = { maxPages: '200', mode: 'sample', sitemap: '', enabled: true }

test('masukan yang sah dibersihkan ke bentuk kolom database', () => {
  const h = validasi(dasar)
  expect(h.ok).toBe(true)
  if (!h.ok) return
  expect(h.nilai).toEqual({
    max_pages: 200,
    lighthouse_mode: 'sample',
    sitemap_url: null,
    enabled: 1,
  })
})

/**
 * Nol halaman bukan "pindai sesukanya" — ia menghasilkan crawl kosong, dan
 * crawl kosong menandai seluruh temuan lama sudah diperbaiki (§2.2).
 */
test('batas halaman nol ditolak', () => {
  const h = validasi({ ...dasar, maxPages: '0' })
  expect(h.ok).toBe(false)
  if (h.ok) return
  expect(h.galat).toMatch(/minimal 1/)
})

test('batas halaman bukan angka ditolak, termasuk yang setengah angka', () => {
  for (const v of ['', '  ', 'abc', '12abc', '1.5', '-5', '1e3', '٢٠٠']) {
    expect(validasi({ ...dasar, maxPages: v }).ok).toBe(false)
  }
})

test('spasi di sekitar angka diterima', () => {
  const h = validasi({ ...dasar, maxPages: '  200  ' })
  expect(h.ok && h.nilai.max_pages).toBe(200)
})

test('batas halaman di atas 2000 ditolak dengan alasan waktu', () => {
  const h = validasi({ ...dasar, maxPages: '5000' })
  expect(h.ok).toBe(false)
  if (h.ok) return
  expect(h.galat).toMatch(/satu malam/)
})

test('mode Lighthouse hanya sample atau full', () => {
  expect(validasi({ ...dasar, mode: 'full' }).ok).toBe(true)
  for (const m of ['', 'both', 'mobile', 'FULL']) {
    expect(validasi({ ...dasar, mode: m }).ok).toBe(false)
  }
})

test('sitemap kosong disimpan sebagai null, bukan string kosong', () => {
  // Kolomnya nullable dan "belum diisi" berbeda dari "diisi kosong".
  for (const v of ['', '   ']) {
    const h = validasi({ ...dasar, sitemap: v })
    expect(h.ok && h.nilai.sitemap_url).toBeNull()
  }
})

test('sitemap tanpa skema ditolak', () => {
  const h = validasi({ ...dasar, sitemap: 'situs.com/sitemap.xml' })
  expect(h.ok).toBe(false)
  if (h.ok) return
  expect(h.galat).toMatch(/http/)
})

test('sitemap yang sah disimpan setelah dipangkas', () => {
  const h = validasi({ ...dasar, sitemap: '  https://a.test/sitemap.xml  ' })
  expect(h.ok && h.nilai.sitemap_url).toBe('https://a.test/sitemap.xml')
})

test('enabled dipetakan ke 1 dan 0, bukan boolean', () => {
  // Kolomnya INTEGER; boolean akan tersimpan sebagai 1/0 juga oleh SQLite,
  // tapi `situsTerjadwal` membandingkan `=== 1` dan tipe yang tepat menjaga
  // perbandingan itu tetap benar.
  expect(validasi({ ...dasar, enabled: true }).ok && validasi(dasar).ok).toBe(true)
  const mati = validasi({ ...dasar, enabled: false })
  expect(mati.ok && mati.nilai.enabled).toBe(0)
  const hidup = validasi({ ...dasar, enabled: true })
  expect(hidup.ok && hidup.nilai.enabled).toBe(1)
})

test('perkiraan waktu naik dengan jumlah halaman dan tidak pernah nol', () => {
  // Diturunkan dari ukuran nyata: Springair 141 halaman ≈ 3 menit crawl.
  expect(perkiraanMenit(141)).toBe(3)
  expect(perkiraanMenit(1)).toBe(1)
  // Angka kecil tidak boleh membulat ke nol — "kira-kira 0 menit" terbaca
  // seperti pemindaian yang tidak melakukan apa pun.
  expect(perkiraanMenit(10)).toBeGreaterThanOrEqual(1)
  expect(perkiraanMenit(2000)).toBeGreaterThan(perkiraanMenit(200))
})
