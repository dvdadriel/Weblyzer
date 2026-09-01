import { test, expect } from 'vitest'
import { openDb, migrate } from '../lib/db.ts'

function tableNames(db: ReturnType<typeof openDb>): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[]
  return rows.map((r) => r.name)
}

test('migrasi membuat seluruh tabel sesuai spec', () => {
  const db = openDb(':memory:')
  const names = tableNames(db)
  for (const t of [
    'config',
    'findings',
    'jobs',
    'lighthouse',
    'pages',
    'reports',
    'runs',
    'sites',
  ]) {
    expect(names).toContain(t)
  }
  db.close()
})

test('migrasi bersifat idempoten pada database yang sama', () => {
  const db = openDb(':memory:')
  const before = tableNames(db)
  expect(() => migrate(db)).not.toThrow()
  expect(tableNames(db)).toEqual(before)
  db.close()
})

test('foreign key aktif: menghapus situs ikut menghapus halamannya', () => {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('S', 'https://a.test')").run()
  db.prepare("INSERT INTO pages (site_id, url) VALUES (1, 'https://a.test/')").run()
  db.prepare('DELETE FROM sites WHERE id = 1').run()
  const rows = db.prepare('SELECT id FROM pages').all()
  expect(rows).toHaveLength(0)
  db.close()
})
