import { test, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

test('node:sqlite tersedia dan dapat menjalankan query', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
  db.prepare('INSERT INTO t (name) VALUES (?)').run('halo')
  const rows = db.prepare('SELECT name FROM t').all() as { name: string }[]
  expect(rows).toHaveLength(1)
  expect(rows[0]!.name).toBe('halo')
  db.close()
})
