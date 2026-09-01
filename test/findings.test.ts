import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { fingerprintOf, reconcile, type NewFinding } from '../lib/findings.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('S', 'https://a.test')").run()
})

function newRun(): number {
  const row = db
    .prepare("INSERT INTO runs (site_id, type) VALUES (1, 'bugs') RETURNING id")
    .get() as { id: number }
  return row.id
}

function statusOf(fingerprint: string): string | undefined {
  const row = db
    .prepare('SELECT status FROM findings WHERE fingerprint = ?')
    .get(fingerprint) as { status: string } | undefined
  return row?.status
}

const bug = (url: string, rule = 'http-error'): NewFinding => ({
  url,
  pageId: null,
  severity: 'high',
  rule,
  title: `${rule} pada ${url}`,
})

test('fingerprint stabil untuk masukan yang sama dan berbeda untuk masukan berbeda', () => {
  expect(fingerprintOf('https://a.test/x', 'http-error', '404')).toBe(
    fingerprintOf('https://a.test/x', 'http-error', '404'),
  )
  expect(fingerprintOf('https://a.test/x', 'http-error', '404')).not.toBe(
    fingerprintOf('https://a.test/y', 'http-error', '404'),
  )
  expect(fingerprintOf('https://a.test/x', 'http-error', '404')).not.toBe(
    fingerprintOf('https://a.test/x', 'broken-image', '404'),
  )
})

test('run pertama membuka semua temuan', () => {
  const run = newRun()
  const result = reconcile(db, 1, run, 'bugs', [bug('https://a.test/x'), bug('https://a.test/y')])
  expect(result).toEqual({ opened: 2, reopened: 0, stillOpen: 0, fixed: 0 })
  expect(statusOf(fingerprintOf('https://a.test/x', 'http-error', ''))).toBe('open')
})

test('temuan yang muncul lagi tetap open, bukan digandakan', () => {
  const firstRun = newRun()
  reconcile(db, 1, firstRun, 'bugs', [bug('https://a.test/x')])

  const secondRun = newRun()
  const result = reconcile(db, 1, secondRun, 'bugs', [bug('https://a.test/x')])
  expect(result).toEqual({ opened: 0, reopened: 0, stillOpen: 1, fixed: 0 })

  const rows = db.prepare('SELECT first_seen_run, last_seen_run FROM findings').all() as {
    first_seen_run: number
    last_seen_run: number
  }[]
  expect(rows).toHaveLength(1)
  expect(rows[0]!.first_seen_run).toBe(firstRun)
  expect(rows[0]!.last_seen_run).toBe(secondRun)
})

test('temuan yang hilang otomatis ditandai fixed', () => {
  reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x'), bug('https://a.test/y')])
  const result = reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  expect(result).toEqual({ opened: 0, reopened: 0, stillOpen: 1, fixed: 1 })
  expect(statusOf(fingerprintOf('https://a.test/y', 'http-error', ''))).toBe('fixed')
})

test('temuan yang sudah fixed lalu muncul lagi dihitung sebagai reopened', () => {
  reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  reconcile(db, 1, newRun(), 'bugs', [])
  expect(statusOf(fingerprintOf('https://a.test/x', 'http-error', ''))).toBe('fixed')

  const result = reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  expect(result).toEqual({ opened: 0, reopened: 1, stillOpen: 0, fixed: 0 })
  expect(statusOf(fingerprintOf('https://a.test/x', 'http-error', ''))).toBe('open')
})

test('temuan ignored tidak pernah kembali menjadi open maupun fixed', () => {
  reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  const fp = fingerprintOf('https://a.test/x', 'http-error', '')
  db.prepare("UPDATE findings SET status = 'ignored' WHERE fingerprint = ?").run(fp)

  reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  expect(statusOf(fp)).toBe('ignored')

  reconcile(db, 1, newRun(), 'bugs', [])
  expect(statusOf(fp)).toBe('ignored')
})

test('rekonsiliasi hanya menyentuh kategorinya sendiri', () => {
  reconcile(db, 1, newRun(), 'security', [bug('https://a.test/x', 'missing-csp')])
  reconcile(db, 1, newRun(), 'bugs', [])
  expect(statusOf(fingerprintOf('https://a.test/x', 'missing-csp', ''))).toBe('open')
})

test('rekonsiliasi hanya menyentuh situsnya sendiri', () => {
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('T', 'https://b.test')").run()
  const runB = db
    .prepare("INSERT INTO runs (site_id, type) VALUES (2, 'bugs') RETURNING id")
    .get() as { id: number }

  reconcile(db, 2, runB.id, 'bugs', [bug('https://b.test/x')])
  reconcile(db, 1, newRun(), 'bugs', [])

  const row = db
    .prepare('SELECT status FROM findings WHERE site_id = 2')
    .get() as { status: string }
  expect(row.status).toBe('open')
})

test('severity dan judul diperbarui saat temuan muncul lagi', () => {
  reconcile(db, 1, newRun(), 'bugs', [{ ...bug('https://a.test/x'), severity: 'low' }])
  reconcile(db, 1, newRun(), 'bugs', [
    { ...bug('https://a.test/x'), severity: 'critical', title: 'judul baru' },
  ])
  const row = db
    .prepare('SELECT severity, title FROM findings')
    .get() as { severity: string; title: string }
  expect(row.severity).toBe('critical')
  expect(row.title).toBe('judul baru')
})

test('url dan rule yang sama boleh muncul di dua kategori berbeda', () => {
  const run1 = newRun()
  reconcile(db, 1, run1, 'seo', [bug('https://a.test/x', 'document-title')])
  const run2 = newRun()
  const result = reconcile(db, 1, run2, 'lighthouse', [bug('https://a.test/x', 'document-title')])

  expect(result).toEqual({ opened: 1, reopened: 0, stillOpen: 0, fixed: 0 })

  const rows = db
    .prepare('SELECT category, status FROM findings ORDER BY category')
    .all() as { category: string; status: string }[]
  expect(rows).toHaveLength(2)
  expect(rows.map((r) => r.category)).toEqual(['lighthouse', 'seo'])
  expect(rows.every((r) => r.status === 'open')).toBe(true)
})

test('memperbarui satu kategori tidak menimpa baris kategori lain', () => {
  reconcile(db, 1, newRun(), 'seo', [
    { ...bug('https://a.test/x', 'document-title'), severity: 'low', title: 'judul seo' },
  ])
  reconcile(db, 1, newRun(), 'lighthouse', [
    { ...bug('https://a.test/x', 'document-title'), severity: 'critical', title: 'judul lh' },
  ])
  reconcile(db, 1, newRun(), 'lighthouse', [
    { ...bug('https://a.test/x', 'document-title'), severity: 'high', title: 'judul lh baru' },
  ])

  const seo = db
    .prepare("SELECT severity, title, status FROM findings WHERE category = 'seo'")
    .get() as { severity: string; title: string; status: string }
  expect(seo.severity).toBe('low')
  expect(seo.title).toBe('judul seo')
  expect(seo.status).toBe('open')
})

test('duplikat dalam satu batch memakai severity tertinggi, bukan yang pertama datang', () => {
  const result = reconcile(db, 1, newRun(), 'bugs', [
    { ...bug('https://a.test/x'), severity: 'low', title: 'yang rendah' },
    { ...bug('https://a.test/x'), severity: 'critical', title: 'yang kritis' },
    { ...bug('https://a.test/x'), severity: 'medium', title: 'yang sedang' },
  ])
  expect(result).toEqual({ opened: 1, reopened: 0, stillOpen: 0, fixed: 0 })

  const row = db
    .prepare('SELECT severity, title FROM findings')
    .get() as { severity: string; title: string }
  expect(row.severity).toBe('critical')
  expect(row.title).toBe('yang kritis')
})

test('urutan duplikat tidak mempengaruhi hasil', () => {
  reconcile(db, 1, newRun(), 'bugs', [
    { ...bug('https://a.test/x'), severity: 'critical', title: 'kritis' },
    { ...bug('https://a.test/x'), severity: 'low', title: 'rendah' },
  ])
  const row = db.prepare('SELECT severity FROM findings').get() as { severity: string }
  expect(row.severity).toBe('critical')
})
