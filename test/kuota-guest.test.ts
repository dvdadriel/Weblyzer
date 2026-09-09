import { describe, it, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { buatUser } from '../lib/auth/pengguna.ts'
import {
  bolehTambahSitus,
  bolehScan,
  MAKS_SITUS_GUEST,
  MAKS_SCAN_GUEST,
} from '../lib/auth/kuota.ts'
import type { Konteks } from '../lib/auth/pemilik.ts'
import { terjemah } from '../lib/i18n/index.ts'

const KG: Konteks = { jenis: 'guest', guestId: 'g1' }
const SEKARANG = Date.parse('2026-09-09T12:00:00Z')

function situsGuest(d: ReturnType<typeof openDb>, url: string, guestId = 'g1'): number {
  return (
    d
      .prepare('INSERT INTO sites (name, base_url, guest_id) VALUES (?, ?, ?) RETURNING id')
      .get('G', url, guestId) as { id: number }
  ).id
}

function run(d: ReturnType<typeof openDb>, siteId: number, kapan: string | null) {
  d.prepare("INSERT INTO runs (site_id, type, started_at) VALUES (?, 'scan', ?)").run(
    siteId,
    kapan,
  )
}

describe('kuota situs', () => {
  it('mengizinkan situs pertama', () => {
    expect(bolehTambahSitus(openDb(':memory:'), KG).boleh).toBe(true)
  })

  it('menolak situs kedua dan menyebut batasnya', () => {
    const d = openDb(':memory:')
    situsGuest(d, 'https://a.com')
    const hasil = bolehTambahSitus(d, KG)
    expect(hasil.boleh).toBe(false)
    if (hasil.boleh) return
    expect(hasil.alasan).toBe('kuota.situs')

    // Kuncinya saja tidak cukup: yang dilihat pemakai adalah hasil
    // terjemahannya, dan ia harus memuat angka batasnya serta menyebut jalan
    // keluarnya — bukan cuma menolak. Diperiksa di KEDUA bahasa, karena
    // placeholder yang tidak terpasang hanya muncul di salah satunya.
    const id_ = terjemah('id', hasil.alasan, hasil.params)
    const en_ = terjemah('en', hasil.alasan, hasil.params)
    for (const teks of [id_, en_]) {
      expect(teks).toContain(String(MAKS_SITUS_GUEST))
      expect(teks).not.toContain('{')
    }
    expect(id_).toMatch(/Masuk/)
    expect(en_).toMatch(/Sign in/)
  })

  it('tidak menghitung situs guest lain', () => {
    const d = openDb(':memory:')
    situsGuest(d, 'https://lain.com', 'g2')
    expect(bolehTambahSitus(d, KG).boleh).toBe(true)
  })

  it('tidak menghitung situs milik user', () => {
    const d = openDb(':memory:')
    const u = buatUser(d, { email: 'a@x.com', password: 'rahasia1' })
    d.prepare('INSERT INTO sites (name, base_url, user_id) VALUES (?, ?, ?)').run(
      'U',
      'https://u.com',
      u.id,
    )
    expect(bolehTambahSitus(d, KG).boleh).toBe(true)
  })
})

describe('kuota scan', () => {
  it('mengizinkan tiga lalu menolak yang keempat', () => {
    const d = openDb(':memory:')
    const s = situsGuest(d, 'https://a.com')
    for (let i = 0; i < MAKS_SCAN_GUEST; i++) {
      expect(bolehScan(d, KG, SEKARANG).boleh, `scan ke-${i + 1}`).toBe(true)
      run(d, s, '2026-09-09 11:00:00')
    }
    const hasil = bolehScan(d, KG, SEKARANG)
    expect(hasil.boleh).toBe(false)
    if (hasil.boleh) return
    expect(hasil.alasan).toBe('kuota.scan')
    for (const locale of ['id', 'en'] as const) {
      const teks = terjemah(locale, hasil.alasan, hasil.params)
      expect(teks).toContain('24')
      expect(teks).toContain(String(MAKS_SCAN_GUEST))
      expect(teks).not.toContain('{')
    }
  })

  it('scan lebih dari 24 jam lalu tidak dihitung', () => {
    const d = openDb(':memory:')
    const s = situsGuest(d, 'https://a.com')
    for (let i = 0; i < MAKS_SCAN_GUEST; i++) run(d, s, '2026-09-08 11:00:00')
    // 25 jam sesudah scan-scan itu: jendelanya sudah lewat.
    expect(bolehScan(d, KG, SEKARANG).boleh).toBe(true)
  })

  it('run yang belum mulai tidak dihitung', () => {
    // `started_at` NULL berarti masih di antrian. Menghitungnya berarti job
    // yang gagal start memakan kuota orangnya.
    const d = openDb(':memory:')
    const s = situsGuest(d, 'https://a.com')
    for (let i = 0; i < MAKS_SCAN_GUEST + 2; i++) run(d, s, null)
    expect(bolehScan(d, KG, SEKARANG).boleh).toBe(true)
  })

  it('tidak menghitung scan guest lain', () => {
    const d = openDb(':memory:')
    const lain = situsGuest(d, 'https://lain.com', 'g2')
    for (let i = 0; i < MAKS_SCAN_GUEST + 1; i++) run(d, lain, '2026-09-09 11:00:00')
    expect(bolehScan(d, KG, SEKARANG).boleh).toBe(true)
  })
})

describe('user tidak dibatasi', () => {
  it('boleh menambah situs dan memindai sebanyak apa pun', () => {
    const d = openDb(':memory:')
    const u = buatUser(d, { email: 'a@x.com', password: 'rahasia1' })
    const ku: Konteks = { jenis: 'user', user: u }
    for (let i = 0; i < 10; i++) {
      const id = (
        d
          .prepare('INSERT INTO sites (name, base_url, user_id) VALUES (?, ?, ?) RETURNING id')
          .get(`S${i}`, `https://s${i}.com`, u.id) as { id: number }
      ).id
      run(d, id, '2026-09-09 11:00:00')
    }
    expect(bolehTambahSitus(d, ku).boleh).toBe(true)
    expect(bolehScan(d, ku, SEKARANG).boleh).toBe(true)
  })
})
