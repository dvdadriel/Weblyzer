import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { enqueue } from '../lib/queue.ts'
import { drainQueue } from '../lib/runner.ts'
import { crawlHandler } from '../lib/jobs/crawl.ts'
import { startFixtureServer } from './fixture-server.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
})

test('job crawl menyimpan halaman dan membuka temuan untuk status non-2xx', async () => {
  const server = await startFixtureServer('basic')
  try {
    const site = createSite(db, { name: 'Fixture', base_url: server.url, max_pages: 20 })
    const run = createRun(db, site.id, 'crawl')
    enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: site.id } })

    const summary = await drainQueue(db, { crawl: crawlHandler }, { concurrency: 1 })
    expect(summary).toEqual({ done: 1, failed: 0 })

    const pages = db.prepare('SELECT url, status_code FROM pages ORDER BY url').all() as {
      url: string
      status_code: number
    }[]
    expect(pages.length).toBeGreaterThanOrEqual(4)

    const findings = db
      .prepare("SELECT rule, severity, status FROM findings WHERE category = 'bugs'")
      .all() as { rule: string; severity: string; status: string }[]
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('http-error')
    expect(findings[0]!.severity).toBe('high')
    expect(findings[0]!.status).toBe('open')
  } finally {
    await server.close()
  }
})

test('crawl kedua atas fixture yang sama tidak menggandakan halaman maupun temuan', async () => {
  const server = await startFixtureServer('basic')
  try {
    const site = createSite(db, { name: 'Fixture', base_url: server.url, max_pages: 20 })

    for (const _ of [1, 2]) {
      const run = createRun(db, site.id, 'crawl')
      enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: site.id } })
      await drainQueue(db, { crawl: crawlHandler }, { concurrency: 1 })
    }

    const pageCount = db.prepare('SELECT COUNT(*) AS n FROM pages').get() as { n: number }
    const findingCount = db.prepare('SELECT COUNT(*) AS n FROM findings').get() as { n: number }
    expect(Number(findingCount.n)).toBe(1)

    const finding = db
      .prepare('SELECT first_seen_run, last_seen_run FROM findings')
      .get() as { first_seen_run: number; last_seen_run: number }
    expect(finding.first_seen_run).toBe(1)
    expect(finding.last_seen_run).toBe(2)
    expect(Number(pageCount.n)).toBeGreaterThanOrEqual(4)
  } finally {
    await server.close()
  }
})

test('job gagal dengan pesan jelas bila situs tidak ditemukan', async () => {
  const site = createSite(db, { name: 'X', base_url: 'https://x.test' })
  const run = createRun(db, site.id, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: 999 } })

  const summary = await drainQueue(db, { crawl: crawlHandler }, { concurrency: 1 })
  expect(summary).toEqual({ done: 0, failed: 1 })

  const failed = db.prepare("SELECT error FROM jobs WHERE status = 'failed'").get() as {
    error: string
  }
  expect(failed.error).toContain('999')
})

test('situs tidak terjangkau membuat job gagal, bukan menandai temuan sudah diperbaiki', async () => {
  const server = await startFixtureServer('basic')
  const site = createSite(db, { name: 'Fixture', base_url: server.url, max_pages: 20 })

  const run1 = createRun(db, site.id, 'crawl')
  enqueue(db, { runId: run1.id, type: 'crawl', payload: { siteId: site.id } })
  await drainQueue(db, { crawl: crawlHandler }, { concurrency: 1 })

  const before = db
    .prepare("SELECT COUNT(*) AS n FROM findings WHERE status = 'open'")
    .get() as { n: number }
  expect(Number(before.n)).toBe(1)

  await server.close() // situs kini mati

  const run2 = createRun(db, site.id, 'crawl')
  enqueue(db, { runId: run2.id, type: 'crawl', payload: { siteId: site.id } })
  const summary = await drainQueue(db, { crawl: crawlHandler }, { concurrency: 1 })

  expect(summary).toEqual({ done: 0, failed: 1 })

  const after = db
    .prepare("SELECT COUNT(*) AS n FROM findings WHERE status = 'open'")
    .get() as { n: number }
  expect(Number(after.n)).toBe(1) // masih open, TIDAK ditandai fixed

  const failed = db.prepare("SELECT error FROM jobs WHERE status = 'failed'").get() as {
    error: string
  }
  expect(failed.error).toContain('tidak terjangkau')
})

test('max_pages yang bukan angka tidak menghasilkan crawl kosong', async () => {
  const server = await startFixtureServer('basic')
  try {
    const site = createSite(db, { name: 'F', base_url: server.url })
    db.prepare("UPDATE sites SET max_pages = 'abc' WHERE id = ?").run(site.id)

    const run = createRun(db, site.id, 'crawl')
    enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: site.id } })
    const summary = await drainQueue(db, { crawl: crawlHandler }, { concurrency: 1 })

    expect(summary).toEqual({ done: 1, failed: 0 })
    const pages = db.prepare('SELECT COUNT(*) AS n FROM pages').get() as { n: number }
    expect(Number(pages.n)).toBeGreaterThanOrEqual(4)
  } finally {
    await server.close()
  }
})
