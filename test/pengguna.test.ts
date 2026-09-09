import { describe, it, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import {
  buatUser,
  userLewatEmail,
  userLewatId,
  masukDenganPassword,
  tautkanOauth,
  userLewatOauth,
  gantiPassword,
  daftarUser,
  aturPreferensi,
} from '../lib/auth/pengguna.ts'

const db = () => openDb(':memory:')

describe('buatUser', () => {
  it('membuat user dan menemukannya lewat email', () => {
    const d = db()
    const u = buatUser(d, { email: 'A@X.com', password: 'rahasia1' })
    expect(u.role).toBe('user')
    // Email dinormalkan: "A@X.com" dan "a@x.com" adalah orang yang sama.
    expect(userLewatEmail(d, 'a@x.com')?.id).toBe(u.id)
    expect(userLewatEmail(d, 'A@X.COM')?.id).toBe(u.id)
    expect(userLewatEmail(d, '  a@x.com  ')?.id).toBe(u.id)
  })

  it('menyimpan email dalam bentuk yang sudah dinormalkan', () => {
    const d = db()
    expect(buatUser(d, { email: '  DAVID@Gmail.COM ', password: 'x1234567' }).email).toBe(
      'david@gmail.com',
    )
  })

  it('menolak email ganda tanpa peduli kapitalisasi', () => {
    const d = db()
    buatUser(d, { email: 'a@x.com', password: 'rahasia1' })
    expect(() => buatUser(d, { email: 'A@x.com', password: 'lain1234' })).toThrow(/sudah/)
  })

  it('menolak yang jelas bukan email', () => {
    const d = db()
    for (const buruk of ['bukan-email', 'a@b', '@x.com', 'a@.com', 'a b@x.com', '']) {
      expect(() => buatUser(d, { email: buruk, password: 'rahasia1' }), buruk).toThrow(/email/)
    }
  })

  it('bisa membuat admin', () => {
    expect(buatUser(db(), { email: 'a@x.com', password: 'x1234567', role: 'admin' }).role).toBe(
      'admin',
    )
  })
})

describe('masuk dengan password', () => {
  it('lolos untuk password benar, gagal untuk yang salah', () => {
    const d = db()
    buatUser(d, { email: 'a@x.com', password: 'rahasia1' })
    expect(masukDenganPassword(d, 'a@x.com', 'rahasia1')?.email).toBe('a@x.com')
    expect(masukDenganPassword(d, 'a@x.com', 'salah')).toBeNull()
  })

  it('email yang tidak ada mengembalikan null, bukan melempar', () => {
    expect(masukDenganPassword(db(), 'tidak@ada.com', 'rahasia1')).toBeNull()
  })

  it('user tanpa password tidak bisa masuk lewat password', () => {
    // Akun yang lahir dari Google. Mencocokkan string kosong akan meloloskan
    // siapa pun yang menekan submit dengan field kosong.
    const d = db()
    buatUser(d, { email: 'oauth@x.com', password: null })
    expect(masukDenganPassword(d, 'oauth@x.com', '')).toBeNull()
    expect(masukDenganPassword(d, 'oauth@x.com', 'apa pun')).toBeNull()
  })
})

describe('oauth', () => {
  it('menautkan lalu menemukannya kembali', () => {
    const d = db()
    const u = buatUser(d, { email: 'a@x.com', password: null })
    tautkanOauth(d, 'google', 'sub-123', u.id)
    expect(userLewatOauth(d, 'google', 'sub-123')?.id).toBe(u.id)
  })

  it('sub yang tidak dikenal mengembalikan null', () => {
    const d = db()
    const u = buatUser(d, { email: 'a@x.com', password: null })
    tautkanOauth(d, 'google', 'sub-123', u.id)
    expect(userLewatOauth(d, 'google', 'sub-lain')).toBeNull()
    expect(userLewatOauth(d, 'github', 'sub-123')).toBeNull()
  })

  it('menautkan dua kali tidak melempar', () => {
    const d = db()
    const u = buatUser(d, { email: 'a@x.com', password: null })
    tautkanOauth(d, 'google', 'sub-123', u.id)
    expect(() => tautkanOauth(d, 'google', 'sub-123', u.id)).not.toThrow()
    expect(daftarUser(d)).toHaveLength(1)
  })
})

describe('gantiPassword', () => {
  it('memutus password lama', () => {
    const d = db()
    const u = buatUser(d, { email: 'a@x.com', password: 'lama1234' })
    gantiPassword(d, u.id, 'baru1234')
    expect(masukDenganPassword(d, 'a@x.com', 'lama1234')).toBeNull()
    expect(masukDenganPassword(d, 'a@x.com', 'baru1234')?.id).toBe(u.id)
  })

  it('memberi password pada akun yang tadinya hanya OAuth', () => {
    const d = db()
    const u = buatUser(d, { email: 'a@x.com', password: null })
    gantiPassword(d, u.id, 'baru1234')
    expect(masukDenganPassword(d, 'a@x.com', 'baru1234')?.id).toBe(u.id)
  })

  it('melempar untuk user yang tidak ada', () => {
    expect(() => gantiPassword(db(), 999, 'baru1234')).toThrow(/tidak ditemukan/)
  })
})

describe('lain-lain', () => {
  it('userLewatId undefined untuk id yang tidak ada', () => {
    expect(userLewatId(db(), 999)).toBeUndefined()
  })

  it('aturPreferensi menyimpan locale dan theme', () => {
    const d = db()
    const u = buatUser(d, { email: 'a@x.com', password: 'x1234567' })
    aturPreferensi(d, u.id, { locale: 'en', theme: 'dark' })
    const lagi = userLewatId(d, u.id)!
    expect(lagi.locale).toBe('en')
    expect(lagi.theme).toBe('dark')
  })

  it('aturPreferensi tanpa patch tidak mengubah apa pun', () => {
    const d = db()
    const u = buatUser(d, { email: 'a@x.com', password: 'x1234567' })
    aturPreferensi(d, u.id, {})
    expect(userLewatId(d, u.id)!.locale).toBe('id')
  })
})
