import { describe, it, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { buatUser } from '../lib/auth/pengguna.ts'
import {
  simpanKunci,
  simpanCli,
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


describe('provider agy CLI', () => {
  it('tersimpan tanpa kunci untuk didekripsi', () => {
    const { d, u } = siap()
    simpanCli(d, u.id, 'gemini-3.1-pro-high')
    const k = bacaKunci(d, RAHASIA, u.id)!
    expect(k.provider).toBe('agy-cli')
    expect(k.model).toBe('gemini-3.1-pro-high')
    // NULL, bukan string kosong: pemanggilnya harus dipaksa membedakan
    // "tidak ada kunci" dari "kunci kosong", dan itulah yang membuat
    // percabangan di `panggilBawaan` tidak bisa dilewati diam-diam.
    expect(k.apiKey).toBeNull()
    expect(k.ekor).toBe('')
  })

  it('belum siap sampai diuji', () => {
    const { d, u } = siap()
    simpanCli(d, u.id, 'gemini-3.1-pro-high')
    expect(kunciSiap(d, u.id)).toBe(false)
    tandaiTerverifikasi(d, u.id)
    expect(kunciSiap(d, u.id)).toBe(true)
  })

  it('menolak model milik provider lain', () => {
    // Satu baris per user berarti label provider yang salah akan mengirim
    // model Anthropic ke CLI agy, dan gagal dengan pesan yang tidak menyebut
    // sebabnya.
    const { d, u } = siap()
    expect(() => simpanCli(d, u.id, 'claude-opus-5')).toThrow(/bukan model agy/)
    expect(() =>
      simpanKunci(d, RAHASIA, u.id, { model: 'gemini-3.1-pro-high', apiKey: API_KEY }),
    ).toThrow(/bukan model Anthropic/)
  })

  it('beralih ke agy menghapus kunci yang tersimpan sebelumnya', () => {
    // API key yang menempel di baris provider CLI berarti kunci itu masih ada
    // di database untuk provider yang tidak pernah memakainya.
    const { d, u } = siap()
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    tandaiTerverifikasi(d, u.id)
    simpanCli(d, u.id, 'gemini-3.1-pro-high')

    const baris = d.prepare('SELECT ciphertext, iv, tag FROM ai_kunci WHERE user_id = ?').get(
      u.id,
    ) as Record<string, unknown>
    expect(baris.ciphertext).toBeNull()
    expect(baris.iv).toBeNull()
    expect(baris.tag).toBeNull()
    expect(kunciSiap(d, u.id)).toBe(false)
  })

  it('beralih kembali ke Anthropic memasang kuncinya lagi', () => {
    const { d, u } = siap()
    simpanCli(d, u.id, 'gemini-3.1-pro-high')
    simpanKunci(d, RAHASIA, u.id, { model: 'claude-opus-5', apiKey: API_KEY })
    const k = bacaKunci(d, RAHASIA, u.id)!
    expect(k.provider).toBe('anthropic')
    expect(k.apiKey).toBe(API_KEY)
  })

  it('infoKunci menyebut providernya', () => {
    const { d, u } = siap()
    simpanCli(d, u.id, 'gemini-3.8-flash-medium')
    expect(infoKunci(d, u.id)?.provider).toBe('agy-cli')
  })
})
