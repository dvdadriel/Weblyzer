import { describe, it, expect } from 'vitest'
import { bacaRahasia, subKunci } from '../lib/auth/rahasia.ts'

const SAH = 'x'.repeat(32)

describe('bacaRahasia', () => {
  it('menolak rahasia yang tidak ada', () => {
    expect(() => bacaRahasia({})).toThrow(/WEBLYZER_SECRET/)
  })

  it('pesannya menyebut cara membuatnya', () => {
    // Galat yang cuma berbunyi "secret belum diatur" menyuruh orang mencari
    // sendiri. Perintahnya pendek; menuliskannya menghemat satu pencarian.
    expect(() => bacaRahasia({})).toThrow(/openssl rand/)
  })

  it('menolak rahasia yang lebih pendek dari 32 karakter', () => {
    expect(() => bacaRahasia({ WEBLYZER_SECRET: 'pendek' })).toThrow(/32/)
  })

  it('menerima rahasia yang cukup panjang', () => {
    expect(bacaRahasia({ WEBLYZER_SECRET: SAH })).toBe(SAH)
  })
})

describe('subKunci', () => {
  it('menghasilkan 32 byte', () => {
    expect(subKunci(SAH, 'sesi')).toHaveLength(32)
  })

  it('deterministik untuk tujuan yang sama', () => {
    expect(subKunci(SAH, 'sesi')).toEqual(subKunci(SAH, 'sesi'))
  })

  it('berbeda untuk tujuan yang berbeda', () => {
    // Kunci session dan kunci enkripsi API key TIDAK boleh sama: bocornya
    // salah satu tidak boleh otomatis membocorkan yang lain.
    expect(subKunci(SAH, 'sesi')).not.toEqual(subKunci(SAH, 'ai-kunci'))
  })

  it('berbeda untuk rahasia yang berbeda', () => {
    expect(subKunci(SAH, 'sesi')).not.toEqual(subKunci('y'.repeat(32), 'sesi'))
  })
})
