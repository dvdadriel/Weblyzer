import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { enqueue } from '../lib/queue.ts'
import { drainQueue } from '../lib/runner.ts'
import { scanHandler } from '../lib/jobs/scan.ts'
import { startFixtureServer } from './fixture-server.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
})

function jalankan(siteId: number, only?: string) {
  const run = createRun(db, siteId, 'full')
  enqueue(db, {
    runId: run.id,
    type: 'scan',
    payload: only === undefined ? { siteId } : { siteId, only },
  })
  return drainQueue(db, { scan: scanHandler }, { concurrency: 1 })
}

test('satu pemindaian mengisi kategori bugs dan console sekaligus', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    const summary = await jalankan(site.id)
    expect(summary).toEqual({ done: 1, failed: 0 })

    const kategori = db
      .prepare('SELECT category, COUNT(*) AS n FROM findings GROUP BY category ORDER BY category')
      .all() as { category: string; n: number }[]
    const peta = new Map(kategori.map((k) => [k.category, Number(k.n)]))

    expect(peta.get('bugs')).toBeGreaterThanOrEqual(1)
    expect(peta.get('console')).toBeGreaterThanOrEqual(2)
  } finally {
    await server.close()
  }
})

test('halaman tersimpan dan temuan merujuk ke page_id', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    await jalankan(site.id)

    const yatim = db
      .prepare('SELECT COUNT(*) AS n FROM findings WHERE page_id IS NULL')
      .get() as { n: number }
    expect(Number(yatim.n)).toBe(0)
  } finally {
    await server.close()
  }
})

test('only=bugs hanya merekonsiliasi kategori bugs', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    await jalankan(site.id, 'bugs')

    const kategori = db
      .prepare('SELECT DISTINCT category FROM findings')
      .all() as { category: string }[]
    expect(kategori.map((k) => k.category)).toEqual(['bugs'])
  } finally {
    await server.close()
  }
})

test('kategori tidak dikenal menggagalkan job dengan pesan jelas', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    const summary = await jalankan(site.id, 'lighthouse')
    expect(summary).toEqual({ done: 0, failed: 1 })

    const failed = db.prepare("SELECT error FROM jobs WHERE status = 'failed'").get() as {
      error: string
    }
    expect(failed.error).toContain('lighthouse')
  } finally {
    await server.close()
  }
})

test('situs tidak terjangkau menggagalkan job tanpa menandai temuan fixed', async () => {
  const server = await startFixtureServer('rusak-konsol')
  const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
  await jalankan(site.id)

  const sebelum = db
    .prepare("SELECT COUNT(*) AS n FROM findings WHERE status = 'open'")
    .get() as { n: number }
  expect(Number(sebelum.n)).toBeGreaterThan(0)

  await server.close()
  const summary = await jalankan(site.id)
  expect(summary).toEqual({ done: 0, failed: 1 })

  const sesudah = db
    .prepare("SELECT COUNT(*) AS n FROM findings WHERE status = 'open'")
    .get() as { n: number }
  expect(Number(sesudah.n)).toBe(Number(sebelum.n))
})

test('pemindaian kedua atas situs yang sama tidak menggandakan apa pun', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    await jalankan(site.id)
    const pertama = db.prepare('SELECT COUNT(*) AS n FROM findings').get() as { n: number }

    await jalankan(site.id)
    const kedua = db.prepare('SELECT COUNT(*) AS n FROM findings').get() as { n: number }

    expect(Number(kedua.n)).toBe(Number(pertama.n))
    const halaman = db.prepare('SELECT COUNT(*) AS n FROM pages').get() as { n: number }
    expect(Number(halaman.n)).toBe(1)
  } finally {
    await server.close()
  }
})

test('situs tidak dikenal menggagalkan job dengan pesan jelas', async () => {
  const site = createSite(db, { name: 'X', base_url: 'https://x.test' })
  const run = createRun(db, site.id, 'full')
  enqueue(db, { runId: run.id, type: 'scan', payload: { siteId: 999 } })

  const summary = await drainQueue(db, { scan: scanHandler }, { concurrency: 1 })
  expect(summary).toEqual({ done: 0, failed: 1 })

  const failed = db.prepare("SELECT error FROM jobs WHERE status = 'failed'").get() as {
    error: string
  }
  expect(failed.error).toContain('999')
})
