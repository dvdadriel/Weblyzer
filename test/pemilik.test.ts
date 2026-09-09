import { describe, it, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { buatUser } from '../lib/auth/pengguna.ts'
import {
  situsMilik,
  filterPemilik,
  pasangPemilik,
  bolehCliHost,
  bolehAi,
} from '../lib/auth/pemilik.ts'
import type { Konteks } from '../lib/auth/pemilik.ts'

function siap() {
  const d = openDb(':memory:')
  const a = buatUser(d, { email: 'a@x.com', password: 'rahasia1' })
  const b = buatUser(d, { email: 'b@x.com', password: 'rahasia1' })
  const situsA = (
    d
      .prepare('INSERT INTO sites (name, base_url, user_id) VALUES (?, ?, ?) RETURNING id')
      .get('A', 'https://a.com', a.id) as { id: number }
  ).id
  const situsG = (
    d
      .prepare('INSERT INTO sites (name, base_url, guest_id) VALUES (?, ?, ?) RETURNING id')
      .get('G', 'https://g.com', 'g1') as { id: number }
  ).id
  return {
    d,
    ka: { jenis: 'user', user: a } as Konteks,
    kb: { jenis: 'user', user: b } as Konteks,
    kg: { jenis: 'guest', guestId: 'g1' } as Konteks,
    kg2: { jenis: 'guest', guestId: 'g2' } as Konteks,
    situsA,
    situsG,
  }
}

describe('situsMilik', () => {
  it('mengizinkan pemiliknya', () => {
    const { d, ka, situsA } = siap()
    expect(situsMilik(d, ka, situsA).name).toBe('A')
  })

  it('menolak user lain', () => {
    const { d, kb, situsA } = siap()
    expect(() => situsMilik(d, kb, situsA)).toThrow(/tidak ditemukan/)
  })

  it('menolak guest lain', () => {
    const { d, kg2, situsG } = siap()
    expect(() => situsMilik(d, kg2, situsG)).toThrow(/tidak ditemukan/)
  })

  it('menolak user membuka situs guest', () => {
    const { d, ka, situsG } = siap()
    expect(() => situsMilik(d, ka, situsG)).toThrow(/tidak ditemukan/)
  })

  it('menolak guest membuka situs user', () => {
    const { d, kg, situsA } = siap()
    expect(() => situsMilik(d, kg, situsA)).toThrow(/tidak ditemukan/)
  })

  it('mengizinkan admin membuka situs siapa pun', () => {
    const { d, situsA, situsG } = siap()
    const admin = buatUser(d, { email: 'admin@x.com', password: 'rahasia1', role: 'admin' })
    const k: Konteks = { jenis: 'user', user: admin }
    expect(situsMilik(d, k, situsA).name).toBe('A')
    expect(situsMilik(d, k, situsG).name).toBe('G')
  })

  it('membawa kolom pemilik supaya pemanggil tidak perlu kueri kedua', () => {
    const { d, ka, situsA } = siap()
    const s = situsMilik(d, ka, situsA)
    expect(s.user_id).toBe(1)
    expect(s.guest_id).toBeNull()
  })

  it('pesannya tidak membedakan situs asing dari situs yang tidak ada', () => {
    // Pesan yang membedakan keduanya memberi tahu penyerang situs mana yang
    // ada di instance ini — cukup dengan mencoba id satu per satu.
    //
    // Yang dibandingkan adalah BENTUK pesannya, dengan id dinormalkan: id itu
    // masukan pemanggil sendiri, jadi menyebutkannya kembali tidak
    // membocorkan apa pun.
    const { d, kb, situsA } = siap()
    const bentuk = (f: () => unknown) => {
      try {
        f()
        return 'tidak melempar'
      } catch (e) {
        return (e as Error).message.replace(/\d+/, '<id>')
      }
    }
    expect(bentuk(() => situsMilik(d, kb, situsA))).toBe('Situs <id> tidak ditemukan.')
    expect(bentuk(() => situsMilik(d, kb, 9999))).toBe('Situs <id> tidak ditemukan.')
  })
})

describe('filterPemilik', () => {
  it('user hanya melihat situsnya', () => {
    const { d, ka } = siap()
    const { klausa, nilai } = filterPemilik(ka)
    expect(d.prepare(`SELECT name FROM sites WHERE ${klausa}`).all(...nilai)).toEqual([
      { name: 'A' },
    ])
  })

  it('guest hanya melihat situsnya', () => {
    const { d, kg } = siap()
    const { klausa, nilai } = filterPemilik(kg)
    expect(d.prepare(`SELECT name FROM sites WHERE ${klausa}`).all(...nilai)).toEqual([
      { name: 'G' },
    ])
  })

  it('guest tanpa situs melihat kosong', () => {
    const { d, kg2 } = siap()
    const { klausa, nilai } = filterPemilik(kg2)
    expect(d.prepare(`SELECT name FROM sites WHERE ${klausa}`).all(...nilai)).toEqual([])
  })

  it('admin melihat semuanya, termasuk situs warisan tanpa pemilik', () => {
    const { d } = siap()
    d.prepare('INSERT INTO sites (name, base_url) VALUES (?, ?)').run('Warisan', 'https://w.com')
    const admin = buatUser(d, { email: 'admin@x.com', password: 'rahasia1', role: 'admin' })
    const { klausa, nilai } = filterPemilik({ jenis: 'user', user: admin })
    const { n } = d.prepare(`SELECT COUNT(*) AS n FROM sites WHERE ${klausa}`).get(...nilai) as {
      n: number
    }
    expect(n).toBe(3)
  })

  it('user biasa TIDAK melihat situs warisan tanpa pemilik', () => {
    const { d, ka } = siap()
    d.prepare('INSERT INTO sites (name, base_url) VALUES (?, ?)').run('Warisan', 'https://w.com')
    const { klausa, nilai } = filterPemilik(ka)
    expect(d.prepare(`SELECT name FROM sites WHERE ${klausa}`).all(...nilai)).toEqual([
      { name: 'A' },
    ])
  })
})

describe('pasangPemilik', () => {
  it('memberi user_id untuk user', () => {
    const { ka } = siap()
    expect(pasangPemilik(ka)).toEqual({ user_id: 1, guest_id: null })
  })

  it('memberi guest_id untuk guest', () => {
    const { kg } = siap()
    expect(pasangPemilik(kg)).toEqual({ user_id: null, guest_id: 'g1' })
  })

  it('tidak pernah mengisi keduanya', () => {
    const { ka, kg } = siap()
    for (const ctx of [ka, kg]) {
      const p = pasangPemilik(ctx)
      expect(p.user_id === null || p.guest_id === null).toBe(true)
    }
  })
})

describe('gerbang fitur', () => {
  it('GEO dan Audit hanya untuk admin', () => {
    const { d, ka, kg } = siap()
    const admin = buatUser(d, { email: 'admin@x.com', password: 'rahasia1', role: 'admin' })
    expect(bolehCliHost(ka)).toBe(false)
    expect(bolehCliHost(kg)).toBe(false)
    expect(bolehCliHost({ jenis: 'user', user: admin })).toBe(true)
  })

  it('guest tidak pernah boleh memakai AI', () => {
    const { ka, kg } = siap()
    expect(bolehAi(kg)).toBe(false)
    expect(bolehAi(ka)).toBe(true)
  })
})
