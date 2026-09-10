import { describe, it, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { bacaPilihanCli, simpanPilihanCli, hapusPilihanCli } from '../lib/repos/konfig.ts'
import { konfigurasiEfektif } from '../lib/ai/konfigurasi.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
})

describe('pilihan CLI di tabel config', () => {
  it('kosong berarti belum ada pilihan', () => {
    expect(bacaPilihanCli(db)).toBeNull()
  })

  it('tersimpan lalu terbaca kembali', () => {
    simpanPilihanCli(db, { cli: 'claude', model: 'claude-opus-5' })
    expect(bacaPilihanCli(db)).toEqual({ cli: 'claude', model: 'claude-opus-5' })
  })

  it('menyimpan dua kali menimpa, bukan menumpuk', () => {
    // Tabel `config` ber-PRIMARY KEY pada `key`, dan itu yang menjamin satu
    // pilihan. Tanpa ON CONFLICT, penyimpanan kedua akan melempar.
    simpanPilihanCli(db, { cli: 'claude', model: 'claude-opus-5' })
    simpanPilihanCli(db, { cli: 'agy', model: 'gemini-3.1-pro-high' })
    expect(bacaPilihanCli(db)).toEqual({ cli: 'agy', model: 'gemini-3.1-pro-high' })
    const n = db.prepare('SELECT COUNT(*) AS n FROM config').get() as { n: number }
    expect(n.n).toBe(2) // satu baris untuk cli, satu untuk model
  })

  it('memangkas spasi di sekitar nama model', () => {
    // Nama yang ditempel dari terminal sering membawa spasi, dan CLI-nya akan
    // menolak "claude-opus-5 " sebagai model yang tidak ada.
    simpanPilihanCli(db, { cli: 'claude', model: '  claude-opus-5\n' })
    expect(bacaPilihanCli(db)?.model).toBe('claude-opus-5')
  })

  it('model kosong ditolak', () => {
    expect(() => simpanPilihanCli(db, { cli: 'claude', model: '   ' })).toThrow(/kosong/)
  })

  it('CLI tak dikenal ditolak', () => {
    expect(() =>
      simpanPilihanCli(db, { cli: 'rm-rf' as 'claude', model: 'x' }),
    ).toThrow(/tidak dikenal/)
  })

  it('dilepas berarti kembali ke tidak ada pilihan', () => {
    simpanPilihanCli(db, { cli: 'agy', model: 'm' })
    hapusPilihanCli(db)
    expect(bacaPilihanCli(db)).toBeNull()
    expect((db.prepare('SELECT COUNT(*) AS n FROM config').get() as { n: number }).n).toBe(0)
  })

  it('setengah pilihan diperlakukan sebagai tidak ada pilihan', () => {
    // Bisa terjadi dari versi lama atau suntingan tangan di berkas database.
    // Nama CLI tanpa model akan dijalankan dengan `--model undefined`, dan
    // CLI-nya menolak dengan pesan yang tidak menyebut sebab sebenarnya.
    db.prepare("INSERT INTO config (key, value) VALUES ('ai_cli', 'claude')").run()
    expect(bacaPilihanCli(db)).toBeNull()
  })

  it('nama CLI tak dikenal di database diabaikan, bukan diteruskan', () => {
    // `CLI[nama]` yang undefined akan meledak jauh dari sini, di dalam
    // `jalankanCli`, dengan galat yang tidak menyebut asalnya.
    db.prepare("INSERT INTO config (key, value) VALUES ('ai_cli', 'entah')").run()
    db.prepare("INSERT INTO config (key, value) VALUES ('ai_cli_model', 'm')").run()
    expect(bacaPilihanCli(db)).toBeNull()
  })
})

describe('siapa yang menang', () => {
  const envAnthropic = {
    WEBLYZER_AI: 'anthropic',
    WEBLYZER_AI_MODEL: 'claude-opus-5',
    WEBLYZER_AI_API_KEY: 'sk-ant-x',
  }

  it('tanpa pilihan web, .env yang berlaku', () => {
    const h = konfigurasiEfektif(db, envAnthropic)
    expect(h.siap && h.konfigurasi.jalur).toBe('anthropic')
  })

  it('pilihan web menang atas .env', () => {
    // Urutannya begitu supaya aturannya bisa dijelaskan dalam satu kalimat:
    // yang terakhir disentuh yang menang. Kalau `.env` menang, menekan tombol
    // di halaman web tidak mengubah apa pun dan tidak ada di layar yang bisa
    // menjelaskan kenapa.
    simpanPilihanCli(db, { cli: 'agy', model: 'gemini-3.1-pro-high' })
    const h = konfigurasiEfektif(db, envAnthropic)
    expect(h).toEqual({
      siap: true,
      konfigurasi: { jalur: 'cli', cli: 'agy', model: 'gemini-3.1-pro-high' },
    })
  })

  it('dilepas berarti .env berlaku kembali', () => {
    simpanPilihanCli(db, { cli: 'agy', model: 'm' })
    hapusPilihanCli(db)
    const h = konfigurasiEfektif(db, envAnthropic)
    expect(h.siap && h.konfigurasi.jalur).toBe('anthropic')
  })

  it('pilihan web tetap berlaku walau .env kosong sama sekali', () => {
    // Ini inti "interaktif di web": jalur CLI tidak butuh satu variabel pun.
    simpanPilihanCli(db, { cli: 'claude', model: 'claude-opus-5' })
    const h = konfigurasiEfektif(db, {})
    expect(h.siap).toBe(true)
  })

  it('tanpa keduanya, sebabnya menyebut kedua cara mengaturnya', () => {
    const h = konfigurasiEfektif(db, {})
    expect(h.siap).toBe(false)
    expect(!h.siap && h.sebab).toMatch(/claude atau agy/)
    expect(!h.siap && h.sebab).toMatch(/WEBLYZER_AI/)
  })
})
