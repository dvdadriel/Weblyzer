import { expect, test } from 'vitest'
import { openDb } from '../lib/db.ts'
import { penyediaTerpilih, pilihPenyedia, PENYEDIA } from '../lib/ai/penyedia.ts'

test('tanpa konfigurasi berarti AI dimatikan', () => {
  expect(penyediaTerpilih(openDb(':memory:'))).toBeNull()
})

test('pilihan tersimpan dan terbaca kembali', () => {
  const db = openDb(':memory:')
  pilihPenyedia(db, 'gemini')
  expect(penyediaTerpilih(db)).toBe('gemini')
})

test('memilih ulang menimpa, tidak menumpuk', () => {
  const db = openDb(':memory:')
  pilihPenyedia(db, 'claude')
  pilihPenyedia(db, 'gemini')
  expect(penyediaTerpilih(db)).toBe('gemini')
  expect((db.prepare('SELECT COUNT(*) AS n FROM config').get() as { n: number }).n).toBe(1)
})

test('null menghapus pilihan', () => {
  const db = openDb(':memory:')
  pilihPenyedia(db, 'claude')
  pilihPenyedia(db, null)
  expect(penyediaTerpilih(db)).toBeNull()
})

/**
 * `config` bertipe TEXT bebas, jadi tanpa penjagaan ini nilai sampah dari form
 * tersimpan tanpa keluhan lalu muncul sebagai nama perintah yang di-spawn.
 */
test('penyedia tak dikenal ditolak, bukan disimpan', () => {
  const db = openDb(':memory:')
  expect(() => pilihPenyedia(db, 'rm -rf' as never)).toThrow(/tidak dikenal/)
  expect((db.prepare('SELECT COUNT(*) AS n FROM config').get() as { n: number }).n).toBe(0)
})

/** Nilai yang sudah kotor di database tidak boleh ikut dipercaya saat dibaca. */
test('nilai kotor di database dibaca sebagai dimatikan', () => {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO config (key, value) VALUES ('ai.penyedia', 'bukan-penyedia')").run()
  expect(penyediaTerpilih(db)).toBeNull()
})

test('setiap penyedia punya id, nama, dan perintah', () => {
  for (const p of PENYEDIA) {
    expect(p.id).toBeTruthy()
    expect(p.nama).toBeTruthy()
    expect(p.perintah).toBeTruthy()
  }
})
