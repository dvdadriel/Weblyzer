import { describe, it, expect } from 'vitest'
import { hashPassword, verifikasiPassword } from '../lib/auth/password.ts'

describe('password', () => {
  it('menerima password yang benar', () => {
    expect(verifikasiPassword('david123', hashPassword('david123'))).toBe(true)
  })

  it('menolak password yang salah', () => {
    expect(verifikasiPassword('salah', hashPassword('david123'))).toBe(false)
  })

  it('menolak password yang cuma beda kapitalisasi', () => {
    expect(verifikasiPassword('David123', hashPassword('david123'))).toBe(false)
  })

  it('menghasilkan hash berbeda untuk password yang sama', () => {
    // Garam acak per password: dua akun dengan password sama tidak boleh
    // terlihat sama di database.
    expect(hashPassword('sama')).not.toBe(hashPassword('sama'))
  })

  it('menyimpan parameternya di dalam hash', () => {
    // Supaya menaikkan N nanti tidak membuat semua password lama tidak bisa
    // diverifikasi.
    expect(hashPassword('x')).toMatch(/^scrypt\$16384\$8\$1\$/)
  })

  it('menolak hash yang rusak alih-alih melempar', () => {
    for (const rusak of [
      '',
      'bukan-hash',
      'scrypt$16384$8$1$hanya-lima-bagian',
      'scrypt$16384$8$1$$',
      'scrypt$bukan-angka$8$1$YQ==$Yg==',
      'scrypt$3$8$1$YQ==$Yg==',
    ]) {
      expect(verifikasiPassword('apa pun', rusak), rusak).toBe(false)
    }
  })

  it('menolak hash dengan algoritma tak dikenal', () => {
    expect(verifikasiPassword('x', 'bcrypt$16384$8$1$YQ==$Yg==')).toBe(false)
  })

  it('menolak password kosong saat hashing', () => {
    expect(() => hashPassword('')).toThrow(/kosong/)
  })

  it('menerima password kosong sebagai kandidat tanpa melempar', () => {
    // Halaman masuk boleh menerima form kosong; yang tidak boleh adalah 500.
    expect(verifikasiPassword('', hashPassword('david123'))).toBe(false)
  })
})
