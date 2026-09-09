import { describe, it, expect } from 'vitest'
import { terbitkanSesi, bacaSesi, NAMA_COOKIE_SESI, UMUR_SESI_MS } from '../lib/auth/sesi.ts'
import { terbitkanGuest, bacaGuest, idGuestBaru, NAMA_COOKIE_GUEST } from '../lib/auth/guest.ts'

const RAHASIA = 'q'.repeat(32)
const LAIN = 'w'.repeat(32)
const SEKARANG = 1_757_000_000_000

describe('sesi', () => {
  it('membaca kembali user id', () => {
    expect(bacaSesi(RAHASIA, terbitkanSesi(RAHASIA, 42, SEKARANG), SEKARANG)).toBe(42)
  })

  it('menolak rahasia lain', () => {
    expect(bacaSesi(LAIN, terbitkanSesi(RAHASIA, 42, SEKARANG), SEKARANG)).toBeNull()
  })

  it('menolak sesudah kedaluwarsa', () => {
    const t = terbitkanSesi(RAHASIA, 42, SEKARANG)
    expect(bacaSesi(RAHASIA, t, SEKARANG + UMUR_SESI_MS + 1)).toBeNull()
  })

  it('masih berlaku sehari sebelum kedaluwarsa', () => {
    const t = terbitkanSesi(RAHASIA, 42, SEKARANG)
    expect(bacaSesi(RAHASIA, t, SEKARANG + UMUR_SESI_MS - 86_400_000)).toBe(42)
  })

  it('menolak cookie yang dikarang', () => {
    for (const karangan of ['', 'karangan.sendiri', 'a.b.c']) {
      expect(bacaSesi(RAHASIA, karangan, SEKARANG), karangan).toBeNull()
    }
  })

  it('nama cookienya tidak berubah tanpa sengaja', () => {
    // Mengubahnya mengeluarkan semua orang yang sedang masuk.
    expect(NAMA_COOKIE_SESI).toBe('weblyzer_sesi')
  })
})

describe('guest', () => {
  it('membaca kembali guest id', () => {
    expect(bacaGuest(RAHASIA, terbitkanGuest(RAHASIA, 'g-abc', SEKARANG), SEKARANG)).toBe('g-abc')
  })

  it('id baru selalu berbeda', () => {
    expect(idGuestBaru()).not.toBe(idGuestBaru())
  })

  it('menolak cookie guest yang dikarang', () => {
    expect(bacaGuest(RAHASIA, 'karangan.sendiri', SEKARANG)).toBeNull()
  })

  it('menolak rahasia lain', () => {
    expect(bacaGuest(LAIN, terbitkanGuest(RAHASIA, 'g-abc', SEKARANG), SEKARANG)).toBeNull()
  })

  it('nama cookienya tidak berubah tanpa sengaja', () => {
    expect(NAMA_COOKIE_GUEST).toBe('weblyzer_guest')
  })
})

describe('dua cookie tidak bisa saling dipakai', () => {
  it('cookie sesi bukan cookie guest', () => {
    // Kunci turunannya berbeda per tujuan (lihat `subKunci`), jadi satu cookie
    // tidak bisa diterima sebagai yang lain. Kalau ini gagal, artinya kedua
    // cookie ditandatangani kunci yang sama — dan guest bisa mengarang session.
    const sesi = terbitkanSesi(RAHASIA, 42, SEKARANG)
    expect(bacaGuest(RAHASIA, sesi, SEKARANG)).toBeNull()
  })

  it('cookie guest bukan cookie sesi', () => {
    const guest = terbitkanGuest(RAHASIA, 'g-abc', SEKARANG)
    expect(bacaSesi(RAHASIA, guest, SEKARANG)).toBeNull()
  })
})
