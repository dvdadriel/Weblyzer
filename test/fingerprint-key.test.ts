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
