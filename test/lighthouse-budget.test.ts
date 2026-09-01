import { test, expect } from 'vitest'
import { pilihHalaman, polaUrl } from '../lib/lighthouse-budget.ts'

const halaman = (url: string, isPinned = 0) => ({ id: 0, url, is_pinned: isPinned })

test('polaUrl mengelompokkan halaman menurut bentuk pathnya', () => {
  expect(polaUrl('https://a.test/news/123')).toBe(polaUrl('https://a.test/news/456'))
  expect(polaUrl('https://a.test/news/abc-panjang')).toBe(polaUrl('https://a.test/news/lain-lagi'))
  expect(polaUrl('https://a.test/news/1')).not.toBe(polaUrl('https://a.test/produk/1'))
})

test('polaUrl membedakan kedalaman path', () => {
  expect(polaUrl('https://a.test/a')).not.toBe(polaUrl('https://a.test/a/b'))
})

test('polaUrl memasukkan nama parameter query tetapi bukan nilainya', () => {
  expect(polaUrl('https://a.test/p?locale=en')).toBe(polaUrl('https://a.test/p?locale=id'))
  expect(polaUrl('https://a.test/p?locale=en')).not.toBe(polaUrl('https://a.test/p?sort=asc'))
})

test('mode full memilih semua halaman', () => {
  const semua = ['/', '/a', '/b', '/c'].map((p) => halaman(`https://a.test${p}`))
  expect(pilihHalaman(semua, 'full')).toHaveLength(4)
})

test('mode sample selalu menyertakan halaman akar', () => {
  const semua = ['/', '/a', '/b'].map((p) => halaman(`https://a.test${p}`))
  const dipilih = pilihHalaman(semua, 'sample')
  expect(dipilih.some((h) => h.url === 'https://a.test/')).toBe(true)
})

test('mode sample menyertakan semua halaman yang dipin', () => {
  const semua = [
    halaman('https://a.test/'),
    halaman('https://a.test/penting', 1),
    halaman('https://a.test/juga-penting', 1),
    halaman('https://a.test/biasa'),
  ]
  const dipilih = pilihHalaman(semua, 'sample')
  expect(dipilih.some((h) => h.url === 'https://a.test/penting')).toBe(true)
  expect(dipilih.some((h) => h.url === 'https://a.test/juga-penting')).toBe(true)
})

test('mode sample mengambil satu contoh per pola, bukan semuanya', () => {
  const semua = [
    halaman('https://a.test/'),
    ...Array.from({ length: 60 }, (_, i) => halaman(`https://a.test/news/${i}`)),
    ...Array.from({ length: 40 }, (_, i) => halaman(`https://a.test/produk/${i}`)),
  ]
  const dipilih = pilihHalaman(semua, 'sample')
  // akar + satu berita + satu produk
  expect(dipilih).toHaveLength(3)
})

test('mode sample dibatasi jumlah maksimum', () => {
  const semua = [
    halaman('https://a.test/'),
    ...Array.from({ length: 200 }, (_, i) => halaman(`https://a.test/p${i}/x`)),
  ]
  const dipilih = pilihHalaman(semua, 'sample')
  expect(dipilih.length).toBeLessThanOrEqual(25)
})

test('halaman yang dipin tidak tergeser oleh batas maksimum', () => {
  const semua = [
    halaman('https://a.test/'),
    ...Array.from({ length: 200 }, (_, i) => halaman(`https://a.test/p${i}/x`)),
    halaman('https://a.test/wajib-ada', 1),
  ]
  const dipilih = pilihHalaman(semua, 'sample')
  expect(dipilih.some((h) => h.url === 'https://a.test/wajib-ada')).toBe(true)
})

test('tidak ada halaman kembar di hasil pilihan', () => {
  const semua = [halaman('https://a.test/', 1), halaman('https://a.test/a')]
  const dipilih = pilihHalaman(semua, 'sample')
  expect(new Set(dipilih.map((h) => h.url)).size).toBe(dipilih.length)
})

test('daftar kosong menghasilkan pilihan kosong', () => {
  expect(pilihHalaman([], 'sample')).toEqual([])
  expect(pilihHalaman([], 'full')).toEqual([])
})

test('URL yang tidak dapat diurai dilewati tanpa melempar', () => {
  const semua = [halaman('https://a.test/'), halaman('bukan-url-sama-sekali')]
  expect(() => pilihHalaman(semua, 'sample')).not.toThrow()
})
