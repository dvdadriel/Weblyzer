import { describe, it, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { buatUser } from '../lib/auth/pengguna.ts'
import {
  simpanKunci,
  bacaKunci,
  infoKunci,
  kunciSiap,
  tandaiTerverifikasi,
  hapusKunci,
} from '../lib/ai/kunci.ts'

const RAHASIA = 'z'.repeat(32)
const API_KEY = 'sk-ant-api03-rahasia-sekali-WXYZ'

function siap() {
  const d = openDb(':memory:')
  const u = buatUser(d, { email: 'a@x.com', password: 'rahasia1' })
  return { d, u }
}

describe('simpan dan baca', () => {
  it('mengembalikan kunci yang sama', () => {
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    expect(bacaKunci(d, RAHASIA, u.id)?.apiKey).toBe(API_KEY)
  })

  it('memangkas spasi di sekitar kunci', () => {
    // Kunci yang ditempel dari clipboard sering membawa spasi atau newline,
    // dan kunci dengan spasi ditolak Anthropic dengan 401 — yang terbaca
    // seperti kunci salah.
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: `  ${API_KEY}\n` })
    expect(bacaKunci(d, RAHASIA, u.id)?.apiKey).toBe(API_KEY)
  })

  it('tidak menyimpan kunci sebagai teks biasa', () => {
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    const baris = d.prepare('SELECT ciphertext FROM ai_kunci WHERE user_id = ?').get(u.id) as {
      ciphertext: Uint8Array
    }
    expect(Buffer.from(baris.ciphertext).toString('latin1')).not.toContain('sk-ant')
  })

  it('tidak ada kunci berarti null', () => {
    const { d, u } = siap()
    expect(bacaKunci(d, RAHASIA, u.id)).toBeNull()
    expect(infoKunci(d, u.id)).toBeNull()
  })

  it('menolak kunci kosong', () => {
    const { d, u } = siap()
    for (const kosong of ['', '   ', '\n\t']) {
      expect(
        () => simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: kosong }),
        JSON.stringify(kosong),
      ).toThrow(/kosong/)
    }
  })

  it('menolak model yang tidak dikenal', () => {
    const { d, u } = siap()
    for (const model of ['gpt-4', 'claude-opus-4-6', '']) {
      expect(
        () => simpanKunci(d, RAHASIA, u.id, { model, apiKey: API_KEY }),
        model,
      ).toThrow(/[Mm]odel/)
    }
  })

  it('menyimpan ulang menimpa, tidak menambah baris', () => {
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-haiku-4-5', apiKey: 'sk-ant-lain' })
    const { n } = d.prepare('SELECT COUNT(*) AS n FROM ai_kunci').get() as { n: number }
    expect(n).toBe(1)
    expect(bacaKunci(d, RAHASIA, u.id)?.model).toBe('claude-haiku-4-5')
  })
})

describe('gerbang verifikasi', () => {
  it('kunci baru belum siap sebelum diverifikasi', () => {
    // Inilah gerbang "harus konfigurasikan dulu, sudah oke baru bisa gunakan".
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    expect(kunciSiap(d, u.id)).toBe(false)
    tandaiTerverifikasi(d, u.id)
    expect(kunciSiap(d, u.id)).toBe(true)
  })

  it('menyimpan ulang mencabut verifikasi', () => {
    // Kunci yang diganti belum diuji. Membiarkan verifikasi lama menempel
    // berarti kunci salah dianggap siap sampai pemindaian tengah malam gagal.
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    tandaiTerverifikasi(d, u.id)
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: 'sk-ant-lain' })
    expect(kunciSiap(d, u.id)).toBe(false)
  })

  it('mengganti model saja juga mencabut verifikasi', () => {
    // Kunci yang berlaku untuk satu model bisa ditolak untuk model lain.
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    tandaiTerverifikasi(d, u.id)
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-haiku-4-5', apiKey: API_KEY })
    expect(kunciSiap(d, u.id)).toBe(false)
  })

  it('tidak ada kunci berarti tidak siap', () => {
    const { d, u } = siap()
    expect(kunciSiap(d, u.id)).toBe(false)
  })

  it('kunci user lain tidak membuat user ini siap', () => {
    const { d, u } = siap()
    const lain = buatUser(d, { email: 'b@x.com', password: 'rahasia1' })
    simpanKunci(d, RAHASIA, lain.id, { model: 'claude-opus-5', apiKey: API_KEY })
    tandaiTerverifikasi(d, lain.id)
    expect(kunciSiap(d, u.id)).toBe(false)
  })
})

describe('yang boleh ditampilkan', () => {
  it('ekor kunci empat karakter terakhir', () => {
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    expect(bacaKunci(d, RAHASIA, u.id)?.ekor).toBe('WXYZ')
  })

  it('infoKunci tidak membuka kuncinya', () => {
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    const info = infoKunci(d, u.id)!
    expect(info.model).toBe('claude-opus-5')
    expect(info.terverifikasi).toBe(false)
    // Rahasia tidak diminta, jadi tidak ada jalan untuk membocorkannya.
    expect(JSON.stringify(info)).not.toContain('sk-ant')
  })
})

describe('hapusKunci', () => {
  it('mengosongkan', () => {
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    hapusKunci(d, u.id)
    expect(bacaKunci(d, RAHASIA, u.id)).toBeNull()
    expect(kunciSiap(d, u.id)).toBe(false)
  })
})

describe('rahasia yang salah', () => {
  it('membaca dengan rahasia lain melempar, tidak mengembalikan sampah', () => {
    // Kalau WEBLYZER_SECRET berubah, kunci tersimpan tidak bisa dibuka lagi.
    // Yang harus terjadi adalah galat keras, bukan kunci sampah yang lalu
    // dikirim ke Anthropic.
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    expect(() => bacaKunci(d, 'y'.repeat(32), u.id)).toThrow()
  })
})
