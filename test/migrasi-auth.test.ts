import { describe, it, expect } from 'vitest'
import { openDb } from '../lib/db.ts'

const db = () => openDb(':memory:')

describe('migrasi auth — bentuk skema', () => {
  it('membuat users, oauth_akun, dan ai_kunci', () => {
    const nama = (
      db().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string
      }[]
    ).map((r) => r.name)
    expect(nama).toContain('users')
    expect(nama).toContain('oauth_akun')
    expect(nama).toContain('ai_kunci')
  })

  it('tidak meninggalkan tabel sementara sites_baru', () => {
    const nama = (
      db().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string
      }[]
    ).map((r) => r.name)
    expect(nama).toContain('sites')
    expect(nama).not.toContain('sites_baru')
  })

  it('sites punya user_id dan guest_id', () => {
    const kolom = (db().prepare('PRAGMA table_info(sites)').all() as { name: string }[]).map(
      (r) => r.name,
    )
    expect(kolom).toContain('user_id')
    expect(kolom).toContain('guest_id')
  })

  it('sites tidak kehilangan kolom lamanya', () => {
    const kolom = (db().prepare('PRAGMA table_info(sites)').all() as { name: string }[]).map(
      (r) => r.name,
    )
    for (const k of [
      'id',
      'name',
      'base_url',
      'sitemap_url',
      'max_pages',
      'lighthouse_mode',
      'lighthouse_strategy',
      'enabled',
      'created_at',
    ]) {
      expect(kolom, k).toContain(k)
    }
  })

  it('foreign_keys tetap menyala setelah migrasi', () => {
    // Migrasi mematikannya untuk rebuild. Kalau lupa menyalakannya kembali,
    // seluruh CASCADE aplikasi mati diam-diam.
    const p = db().prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(p.foreign_keys).toBe(1)
  })

  it('tidak meninggalkan referensi menggantung', () => {
    expect(db().prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})

describe('migrasi auth — keunikan base_url', () => {
  it('tidak lagi unik secara global', () => {
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    d.prepare('INSERT INTO users (email) VALUES (?)').run('b@x.com')
    d.prepare('INSERT INTO sites (name, base_url, user_id) VALUES (?, ?, 1)').run(
      'A',
      'https://sama.com',
    )
    // Dua user memantau situs yang sama adalah keadaan normal di multi-user.
    expect(() =>
      d
        .prepare('INSERT INTO sites (name, base_url, user_id) VALUES (?, ?, 2)')
        .run('B', 'https://sama.com'),
    ).not.toThrow()
  })

  it('tetap unik di dalam satu user', () => {
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    d.prepare('INSERT INTO sites (name, base_url, user_id) VALUES (?, ?, 1)').run(
      'A',
      'https://sama.com',
    )
    expect(() =>
      d
        .prepare('INSERT INTO sites (name, base_url, user_id) VALUES (?, ?, 1)')
        .run('A lagi', 'https://sama.com'),
    ).toThrow(/UNIQUE/)
  })

  it('tetap unik di dalam satu guest', () => {
    const d = db()
    d.prepare('INSERT INTO sites (name, base_url, guest_id) VALUES (?, ?, ?)').run(
      'A',
      'https://sama.com',
      'g1',
    )
    expect(() =>
      d
        .prepare('INSERT INTO sites (name, base_url, guest_id) VALUES (?, ?, ?)')
        .run('A lagi', 'https://sama.com', 'g1'),
    ).toThrow(/UNIQUE/)
  })

  it('guest berbeda boleh memantau situs yang sama', () => {
    const d = db()
    d.prepare('INSERT INTO sites (name, base_url, guest_id) VALUES (?, ?, ?)').run(
      'A',
      'https://sama.com',
      'g1',
    )
    expect(() =>
      d
        .prepare('INSERT INTO sites (name, base_url, guest_id) VALUES (?, ?, ?)')
        .run('A', 'https://sama.com', 'g2'),
    ).not.toThrow()
  })
})

describe('migrasi auth — CASCADE bertahan melewati rebuild', () => {
  function situsDenganTemuan(d: ReturnType<typeof openDb>) {
    d.prepare('INSERT INTO sites (name, base_url) VALUES (?, ?)').run('S', 'https://s.com')
    d.prepare("INSERT INTO runs (site_id, type) VALUES (1, 'scan')").run()
    d.prepare('INSERT INTO pages (site_id, url) VALUES (1, ?)').run('https://s.com/a')
    d.prepare(
      `INSERT INTO findings (site_id, page_id, category, severity, rule, title,
                             fingerprint, first_seen_run, last_seen_run)
       VALUES (1, 1, 'bugs', 'high', 'r', 't', 'fp', 1, 1)`,
    ).run()
  }

  it('menghapus situs tetap membawa temuan, halaman, dan run', () => {
    const d = db()
    situsDenganTemuan(d)
    d.prepare('DELETE FROM sites WHERE id = 1').run()
    for (const tabel of ['findings', 'pages', 'runs']) {
      const { n } = d.prepare(`SELECT COUNT(*) AS n FROM ${tabel}`).get() as { n: number }
      expect(n, tabel).toBe(0)
    }
  })

  it('temuan tidak bisa menunjuk ke situs yang tidak ada', () => {
    // Buktinya foreign key sungguhan ikut terbawa, bukan cuma teks di skema.
    const d = db()
    expect(() =>
      d
        .prepare(
          `INSERT INTO findings (site_id, category, severity, rule, title,
                                 fingerprint, first_seen_run, last_seen_run)
           VALUES (999, 'bugs', 'high', 'r', 't', 'fp', 1, 1)`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/)
  })

  it('menghapus user membawa serta situsnya dan seluruh temuannya', () => {
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    situsDenganTemuan(d)
    d.prepare('UPDATE sites SET user_id = 1 WHERE id = 1').run()
    d.prepare('DELETE FROM users WHERE id = 1').run()
    const { n } = d.prepare('SELECT COUNT(*) AS n FROM sites').get() as { n: number }
    expect(n).toBe(0)
    const { t } = d.prepare('SELECT COUNT(*) AS t FROM findings').get() as { t: number }
    expect(t).toBe(0)
  })

  it('menghapus user membuang kunci AI-nya', () => {
    const d = db()
    d.prepare('INSERT INTO users (email) VALUES (?)').run('a@x.com')
    d.prepare(
      `INSERT INTO ai_kunci (user_id, model, ciphertext, iv, tag)
       VALUES (1, 'claude-opus-5', x'00', x'01', x'02')`,
    ).run()
    d.prepare('DELETE FROM users WHERE id = 1').run()
    const { n } = d.prepare('SELECT COUNT(*) AS n FROM ai_kunci').get() as { n: number }
    expect(n).toBe(0)
  })
})

describe('migrasi auth — CHECK pada users', () => {
  it('menolak role yang tidak dikenal', () => {
    const d = db()
    expect(() =>
      d.prepare("INSERT INTO users (email, role) VALUES ('a@x.com', 'dewa')").run(),
    ).toThrow(/CHECK/)
  })

  it('menolak locale yang tidak didukung', () => {
    const d = db()
    expect(() =>
      d.prepare("INSERT INTO users (email, locale) VALUES ('a@x.com', 'jp')").run(),
    ).toThrow(/CHECK/)
  })

  it('menolak theme yang tidak dikenal', () => {
    const d = db()
    expect(() =>
      d.prepare("INSERT INTO users (email, theme) VALUES ('a@x.com', 'retro')").run(),
    ).toThrow(/CHECK/)
  })

  it('bawaan role user, locale id, theme system', () => {
    const d = db()
    d.prepare("INSERT INTO users (email) VALUES ('a@x.com')").run()
    const u = d.prepare('SELECT role, locale, theme FROM users WHERE id = 1').get()
    expect(u).toEqual({ role: 'user', locale: 'id', theme: 'system' })
  })
})
