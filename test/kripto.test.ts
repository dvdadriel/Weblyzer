import { describe, it, expect } from 'vitest'
import { enkripsi, dekripsi } from '../lib/auth/kripto.ts'

const RAHASIA = 'a'.repeat(32)
const LAIN = 'b'.repeat(32)
const KUNCI_API = 'sk-ant-api03-rahasia-sekali-WXYZ'

describe('kripto', () => {
  it('mengembalikan teks asli', () => {
    expect(dekripsi(RAHASIA, enkripsi(RAHASIA, KUNCI_API))).toBe(KUNCI_API)
  })

  it('tidak menyimpan teks asli di ciphertext', () => {
    const kotak = enkripsi(RAHASIA, KUNCI_API)
    expect(kotak.ciphertext.toString('utf8')).not.toContain('sk-ant')
    expect(kotak.ciphertext.toString('latin1')).not.toContain('sk-ant')
  })

  it('menghasilkan iv dan ciphertext berbeda tiap kali', () => {
    const a = enkripsi(RAHASIA, 'sama')
    const b = enkripsi(RAHASIA, 'sama')
    expect(a.iv.equals(b.iv)).toBe(false)
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
  })

  it('melempar untuk rahasia yang salah, tidak mengembalikan sampah', () => {
    expect(() => dekripsi(LAIN, enkripsi(RAHASIA, KUNCI_API))).toThrow()
  })

  it('melempar kalau ciphertext diubah', () => {
    const kotak = enkripsi(RAHASIA, KUNCI_API)
    kotak.ciphertext[0] = (kotak.ciphertext[0] ?? 0) ^ 0xff
    expect(() => dekripsi(RAHASIA, kotak)).toThrow()
  })

  it('melempar kalau tag diubah', () => {
    const kotak = enkripsi(RAHASIA, KUNCI_API)
    kotak.tag[0] = (kotak.tag[0] ?? 0) ^ 0xff
    expect(() => dekripsi(RAHASIA, kotak)).toThrow()
  })

  it('melempar kalau iv diubah', () => {
    const kotak = enkripsi(RAHASIA, KUNCI_API)
    kotak.iv[0] = (kotak.iv[0] ?? 0) ^ 0xff
    expect(() => dekripsi(RAHASIA, kotak)).toThrow()
  })

  it('menangani teks kosong', () => {
    expect(dekripsi(RAHASIA, enkripsi(RAHASIA, ''))).toBe('')
  })
})
