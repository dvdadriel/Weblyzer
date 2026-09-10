import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { openDb } from '../lib/db.ts'

const db = () => openDb(':memory:')

const DIR = join(import.meta.dirname, '..', 'lib', 'migrations')

/**
 * Database yang berhenti TEPAT SEBELUM migrasi 003.
 *
 * Ini yang membuat test ini menguji migrasinya dan bukan hanya skema akhirnya:
 * baris ditulis dengan bentuk tabel lama, lalu 003 dijalankan di atasnya.
 * Membuat database baru dari nol akan melewatkan satu-satunya hal yang bisa
 * merusak data orang — langkah INSERT ... SELECT di tengah rebuild.
 */
function sebelum003(): DatabaseSync {
  const d = new DatabaseSync(':memory:')
  d.exec('PRAGMA foreign_keys = ON')
  d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)')
  for (const f of readdirSync(DIR)
    .filter((f) => f.endsWith('.sql') && f < '003')
    .sort()) {
    // BEGIN-nya wajib, sama seperti di `migrate`: 002 membawa COMMIT-nya
    // sendiri untuk bisa mematikan `foreign_keys`, jadi tanpa transaksi
    // terbuka lebih dulu ia gagal dengan "no transaction is active".
    d.exec('BEGIN')
    d.exec(readFileSync(join(DIR, f), 'utf8'))
    d.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(f)
    try {
      d.exec('COMMIT')
    } catch {
      // 002 sudah commit sendiri; tidak ada lagi transaksi untuk ditutup.
    }
  }
  return d
}

function jalankan003(d: DatabaseSync): void {
  d.exec(readFileSync(join(DIR, '003_provider_cli.sql'), 'utf8'))
}

describe('migrasi 003 — data yang sudah ada', () => {
  it('kunci yang tersimpan selamat melewati rebuild', () => {
    const d = sebelum003()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    d.prepare(
      `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag, terverifikasi_at)
       VALUES (1, 'anthropic', 'claude-opus-5', ?, ?, ?, '2026-01-01 00:00:00')`,
    ).run(
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
      new Uint8Array([7, 8, 9]),
    )

    jalankan003(d)

    const baris = d.prepare('SELECT * FROM ai_kunci').get() as Record<string, unknown>
    expect(baris.user_id).toBe(1)
    expect(baris.provider).toBe('anthropic')
    expect(baris.model).toBe('claude-opus-5')
    expect(Array.from(baris.ciphertext as Uint8Array)).toEqual([1, 2, 3])
    expect(Array.from(baris.iv as Uint8Array)).toEqual([4, 5, 6])
    expect(Array.from(baris.tag as Uint8Array)).toEqual([7, 8, 9])
    // Verifikasi yang sudah lolos tidak boleh hilang karena rebuild: kalau
    // hilang, ringkasan AI semua orang mati diam-diam sampai mereka menyimpan
    // ulang kuncinya.
    expect(baris.terverifikasi_at).toBe('2026-01-01 00:00:00')
  })

  it('tidak meninggalkan tabel sementara dan tidak merusak referensi', () => {
    const d = sebelum003()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    jalankan003(d)

    const nama = (
      d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(nama).toContain('ai_kunci')
    expect(nama).not.toContain('ai_kunci_baru')
    expect(d.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('CASCADE dari users masih hidup setelah rebuild', () => {
    // Rebuild tabel adalah cara paling gampang menghilangkan foreign key tanpa
    // ada yang sadar: barisnya utuh, kolomnya utuh, dan yang hilang cuma
    // penghapusan otomatisnya.
    const d = sebelum003()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    jalankan003(d)
    d.prepare(
      `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag)
       VALUES (1, 'anthropic', 'claude-opus-5', x'01', x'02', x'03')`,
    ).run()

    d.prepare('DELETE FROM users WHERE id = 1').run()
    expect(d.prepare('SELECT COUNT(*) AS n FROM ai_kunci').get()).toEqual({ n: 0 })
  })
})

describe('migrasi 003 — keadaan yang tidak boleh tersimpan', () => {
  it('provider di luar daftar ditolak', () => {
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    expect(() =>
      d
        .prepare(
          `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag)
           VALUES (1, 'openai', 'gpt-4', x'01', x'02', x'03')`,
        )
        .run(),
    ).toThrow()
  })

  it('anthropic tanpa ciphertext ditolak', () => {
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    expect(() =>
      d
        .prepare(
          `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag)
           VALUES (1, 'anthropic', 'claude-opus-5', NULL, NULL, NULL)`,
        )
        .run(),
    ).toThrow()
  })

  it('anthropic dengan ciphertext tapi tanpa iv ditolak', () => {
    // Keadaan setengah jalan, dan ini yang paling mungkin terjadi dari bug
    // pemanggil — bukan ketiganya hilang, tapi satu yang lupa dikirim.
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    expect(() =>
      d
        .prepare(
          `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag)
           VALUES (1, 'anthropic', 'claude-opus-5', x'01', NULL, x'03')`,
        )
        .run(),
    ).toThrow()
  })

  it('agy-cli yang membawa ciphertext ditolak', () => {
    // Sisa kunci lama yang menempel di baris provider CLI berarti API key
    // masih ada di database untuk provider yang tidak pernah memakainya.
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    expect(() =>
      d
        .prepare(
          `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag)
           VALUES (1, 'agy-cli', 'gemini-3.1-pro-high', x'01', x'02', x'03')`,
        )
        .run(),
    ).toThrow()
  })

  it('agy-cli tanpa kunci diterima', () => {
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    d.prepare(
      `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag)
       VALUES (1, 'agy-cli', 'gemini-3.1-pro-high', NULL, NULL, NULL)`,
    ).run()
    expect(d.prepare('SELECT provider FROM ai_kunci').get()).toEqual({ provider: 'agy-cli' })
  })

  it('satu user tetap satu baris', () => {
    // Inti dari "satu user, satu konfigurasi model": ini dijaga PRIMARY KEY,
    // dan rebuild adalah tempat paling gampang untuk kehilangannya.
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    d.prepare(
      `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag)
       VALUES (1, 'agy-cli', 'gemini-3.1-pro-high', NULL, NULL, NULL)`,
    ).run()
    expect(() =>
      d
        .prepare(
          `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag)
           VALUES (1, 'anthropic', 'claude-opus-5', x'01', x'02', x'03')`,
        )
        .run(),
    ).toThrow()
  })
})
