import { test, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite, listSites, getSite, updateSite, deleteSite } from '../lib/repos/sites.ts'

test('membuat situs dan mengembalikannya dengan nilai default', () => {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Springair', base_url: 'https://springair.co.id' })
  expect(site.id).toBe(1)
  expect(site.name).toBe('Springair')
  expect(site.max_pages).toBe(200)
  expect(site.lighthouse_mode).toBe('sample')
  expect(site.lighthouse_strategy).toBe('mobile')
  expect(site.enabled).toBe(1)
  db.close()
})

test('base_url dinormalisasi: garis miring akhir dibuang, host dihuruf-kecilkan', () => {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'A', base_url: 'https://Example.COM/path/' })
  expect(site.base_url).toBe('https://example.com/path')
  db.close()
})

test('base_url tanpa skema ditolak', () => {
  const db = openDb(':memory:')
  expect(() => createSite(db, { name: 'A', base_url: 'example.com' })).toThrow(
    /harus diawali http/i,
  )
  db.close()
})

test('base_url duplikat ditolak setelah normalisasi', () => {
  const db = openDb(':memory:')
  createSite(db, { name: 'A', base_url: 'https://a.test' })
  expect(() => createSite(db, { name: 'B', base_url: 'https://a.test/' })).toThrow()
  db.close()
})

test('list, get, update, dan delete', () => {
  const db = openDb(':memory:')
  createSite(db, { name: 'A', base_url: 'https://a.test' })
  createSite(db, { name: 'B', base_url: 'https://b.test' })

  expect(listSites(db).map((s) => s.name)).toEqual(['A', 'B'])
  expect(getSite(db, 1)?.name).toBe('A')
  expect(getSite(db, 99)).toBeUndefined()

  const updated = updateSite(db, 1, { name: 'A2', max_pages: 50, lighthouse_mode: 'full' })
  expect(updated.name).toBe('A2')
  expect(updated.max_pages).toBe(50)
  expect(updated.lighthouse_mode).toBe('full')

  deleteSite(db, 2)
  expect(listSites(db)).toHaveLength(1)
  db.close()
})
