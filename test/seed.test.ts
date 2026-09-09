import { describe, it, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { seedAkun } from '../scripts/seed-akun.ts'
import { masukDenganPassword, daftarUser } from '../lib/auth/pengguna.ts'

const db = () => openDb(':memory:')

describe('seedAkun', () => {
  it('membuat akun admin di database kosong', () => {
    const d = db()
    expect(seedAkun(d).dibuat).toBe(true)
    const u = masukDenganPassword(d, 'davidadrielalvyn@gmail.com', 'david123')
    expect(u?.role).toBe('admin')
  })

  it('idempoten — dijalankan dua kali tetap satu akun', () => {
    const d = db()
    seedAkun(d)
    expect(seedAkun(d).dibuat).toBe(false)
    expect(daftarUser(d)).toHaveLength(1)
  })

  it('tidak menyentuh database yang sudah punya user lain', () => {
    // Instance yang sudah dipakai orang tidak boleh mendadak mendapat admin
    // kedua yang tidak diminta.
    const d = db()
    d.prepare("INSERT INTO users (email, role) VALUES ('lain@x.com', 'admin')").run()
    expect(seedAkun(d).dibuat).toBe(false)
    expect(daftarUser(d)).toHaveLength(1)
    expect(daftarUser(d)[0]!.email).toBe('lain@x.com')
  })

  it('memasang pemilik untuk situs warisan', () => {
    const d = db()
    d.prepare('INSERT INTO sites (name, base_url) VALUES (?, ?)').run('Lama', 'https://lama.com')
    d.prepare('INSERT INTO sites (name, base_url) VALUES (?, ?)').run('Lama2', 'https://lama2.com')
    const hasil = seedAkun(d)
    expect(hasil.diadopsi).toBe(2)
    const situs = d.prepare('SELECT user_id FROM sites ORDER BY id').all() as {
      user_id: number
    }[]
    expect(situs.map((s) => s.user_id)).toEqual([1, 1])
  })

  it('tidak mengambil situs milik guest', () => {
    const d = db()
    d.prepare('INSERT INTO sites (name, base_url, guest_id) VALUES (?, ?, ?)').run(
      'G',
      'https://g.com',
      'g1',
    )
    expect(seedAkun(d).diadopsi).toBe(0)
    const s = d.prepare('SELECT user_id, guest_id FROM sites WHERE id = 1').get() as {
      user_id: number | null
      guest_id: string
    }
    expect(s.user_id).toBeNull()
    expect(s.guest_id).toBe('g1')
  })

  it('situs warisan yang diadopsi jadi terlihat oleh admin itu', () => {
    // Inti gunanya: tanpa langkah ini, situs lama tidak terlihat oleh siapa
    // pun sementara pemindaian terjadwalnya tetap jalan tiap malam.
    const d = db()
    d.prepare('INSERT INTO sites (name, base_url) VALUES (?, ?)').run('Lama', 'https://lama.com')
    seedAkun(d)
    const { n } = d
      .prepare('SELECT COUNT(*) AS n FROM sites WHERE user_id = 1')
      .get() as { n: number }
    expect(n).toBe(1)
  })
})
