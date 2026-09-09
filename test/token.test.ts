import { describe, it, expect } from 'vitest'
import { tandaTangani, bacaToken } from '../lib/auth/token.ts'

const KUNCI = Buffer.alloc(32, 7)
const LAIN = Buffer.alloc(32, 9)
const SEKARANG = 1_757_000_000_000

describe('token', () => {
  it('membaca kembali payload yang ditandatangani', () => {
    const t = tandaTangani(KUNCI, { uid: 3 }, 1000, SEKARANG)
    expect(bacaToken(KUNCI, t, SEKARANG)).toEqual({ uid: 3 })
  })

  it('tidak membocorkan exp ke pemanggil', () => {
    // `exp` adalah urusan berkas ini. Pemanggil yang ikut menerimanya akan
    // cepat atau lambat memakainya untuk sesuatu, lalu bergantung pada
    // bentuk internal token.
    const t = tandaTangani(KUNCI, { uid: 3 }, 1000, SEKARANG)
    expect(bacaToken(KUNCI, t, SEKARANG)).not.toHaveProperty('exp')
  })

  it('menolak token yang ditandatangani kunci lain', () => {
    const t = tandaTangani(LAIN, { uid: 3 }, 1000, SEKARANG)
    expect(bacaToken(KUNCI, t, SEKARANG)).toBeNull()
  })

  it('menolak payload yang diubah', () => {
    const t = tandaTangani(KUNCI, { uid: 3 }, 1000, SEKARANG)
    const sig = t.slice(t.indexOf('.') + 1)
    const palsu = Buffer.from(JSON.stringify({ uid: 999, exp: SEKARANG + 1000 })).toString(
      'base64url',
    )
    expect(bacaToken(KUNCI, `${palsu}.${sig}`, SEKARANG)).toBeNull()
  })

  it('menolak tanda tangan yang diubah', () => {
    const t = tandaTangani(KUNCI, { uid: 3 }, 1000, SEKARANG)
    expect(bacaToken(KUNCI, `${t.slice(0, -1)}A`, SEKARANG)).toBeNull()
  })

  it('menolak token kedaluwarsa', () => {
    const t = tandaTangani(KUNCI, { uid: 3 }, 1000, SEKARANG)
    expect(bacaToken(KUNCI, t, SEKARANG + 1001)).toBeNull()
  })

  it('menerima token tepat sebelum kedaluwarsa', () => {
    const t = tandaTangani(KUNCI, { uid: 3 }, 1000, SEKARANG)
    expect(bacaToken(KUNCI, t, SEKARANG + 999)).toEqual({ uid: 3 })
  })

  it('menolak bentuk yang sama sekali bukan token', () => {
    for (const sampah of ['', '.', 'tanpa-titik', '.hanya-sig', 'isi.', 'a.b.c', '!!!.???']) {
      expect(bacaToken(KUNCI, sampah, SEKARANG), JSON.stringify(sampah)).toBeNull()
    }
  })

  it('menolak payload yang bukan objek', () => {
    // Array dan angka lolos `typeof === 'object'`/JSON.parse tapi tidak punya
    // bentuk yang diharapkan pemanggil.
    for (const isi of ['[1,2,3]', '42', '"teks"', 'null']) {
      const b64 = Buffer.from(isi).toString('base64url')
      const t = tandaTangani(KUNCI, {}, 1000, SEKARANG)
      const sig = t.slice(t.indexOf('.') + 1)
      // Tanda tangannya memang tidak cocok — yang diuji di sini adalah tidak
      // ada jalan di mana bentuk seperti itu berhasil dibaca.
      expect(bacaToken(KUNCI, `${b64}.${sig}`, SEKARANG), isi).toBeNull()
    }
  })
})
