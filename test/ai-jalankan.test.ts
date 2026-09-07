import { expect, test } from 'vitest'
import { tafsirkan } from '../lib/ai/jalankan.ts'

const galat = (kode?: string, pesan = 'Command failed') =>
  Object.assign(new Error(pesan), kode === undefined ? {} : { code: kode })

test('keluaran normal dipangkas spasinya', () => {
  expect(tafsirkan('claude', null, '  SIAP\n\n', '')).toEqual({ ok: true, teks: 'SIAP' })
})

test('CLI tidak terpasang disebut apa adanya', () => {
  const h = tafsirkan('gemini', galat('ENOENT'), '', '')
  expect(h).toEqual({ ok: false, galat: 'gemini tidak ditemukan di PATH' })
})

test('batas waktu dibedakan dari galat lain', () => {
  const h = tafsirkan('claude', galat('ETIMEDOUT'), '', '')
  expect(h.ok).toBe(false)
  expect(h.ok === false && h.galat).toMatch(/tidak selesai dalam 90 detik/)
})

/**
 * Kasus yang menjadi alasan seluruh berkas ini ada. `gemini` keluar dengan
 * kode bukan nol dan menaruh alasannya di stderr; pesan Node cuma "Command
 * failed". Meneruskan pesan Node akan menghapus satu-satunya petunjuk.
 */
test('alasan dari stderr menang atas pesan Node', () => {
  const h = tafsirkan(
    'gemini',
    galat('41', 'Command failed'),
    '',
    'When using Gemini API, you must specify the GEMINI_API_KEY environment variable.',
  )
  expect(h.ok).toBe(false)
  expect(h.ok === false && h.galat).toMatch(/GEMINI_API_KEY/)
  expect(h.ok === false && h.galat).not.toMatch(/Command failed/)
})

test('pesan Node dipakai hanya bila stderr kosong', () => {
  const h = tafsirkan('claude', galat('1', 'meledak'), '', '   ')
  expect(h).toEqual({ ok: false, galat: 'meledak' })
})

/** Exit 0 tanpa keluaran bukan keberhasilan: tidak ada yang bisa disimpan. */
test('sukses tanpa keluaran dihitung gagal', () => {
  const h = tafsirkan('claude', null, '   \n ', '')
  expect(h).toEqual({ ok: false, galat: 'claude selesai tanpa keluaran' })
})

test('keluaran raksasa dipotong, bukan disimpan utuh', () => {
  const h = tafsirkan('claude', null, 'x'.repeat(50_000), '')
  expect(h.ok).toBe(true)
  expect(h.ok === true && h.teks.length).toBe(20_000)
})

test('stderr yang sangat panjang juga dibatasi', () => {
  const h = tafsirkan('claude', galat('1'), '', 'y'.repeat(9_000))
  expect(h.ok === false && h.galat.length).toBe(2_000)
})
