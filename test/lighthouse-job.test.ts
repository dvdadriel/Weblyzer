import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { upsertPage } from '../lib/repos/pages.ts'
import { enqueue } from '../lib/queue.ts'
import { drainQueue } from '../lib/runner.ts'
import { lighthouseHandler } from '../lib/jobs/lighthouse.ts'
import { skorTerakhir } from '../lib/repos/lighthouse.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
})

const HALAMAN = `<!doctype html><html lang="id"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Uji</title></head><body><main><h1>Uji</h1><p>Isi yang cukup panjang di sini.</p></main></body></html>`

async function serverUji() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(HALAMAN)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

test('job menyimpan skor dan dapat dibaca kembali', async () => {
  const server = await serverUji()
  try {
    const site = createSite(db, { name: 'Uji', base_url: server.url })
    upsertPage(db, site.id, { url: `${server.url}/`, statusCode: 200, loadMs: 10 })

    const run = createRun(db, site.id, 'lighthouse')
    enqueue(db, { runId: run.id, type: 'lighthouse', payload: { siteId: site.id } })
    const summary = await drainQueue(db, { lighthouse: lighthouseHandler }, { concurrency: 1 })
    expect(summary).toEqual({ done: 1, failed: 0 })

    const skor = skorTerakhir(db, site.id)
    expect(skor.length).toBeGreaterThanOrEqual(1)
    expect(skor[0]!.strategy).toBe('mobile')
    expect(typeof skor[0]!.perf).toBe('number')
  } finally {
    await server.close()
  }
}, 180_000)

test('job gagal dengan pesan jelas bila situs tidak ditemukan', async () => {
  const site = createSite(db, { name: 'X', base_url: 'https://x.test' })
  const run = createRun(db, site.id, 'lighthouse')
  enqueue(db, { runId: run.id, type: 'lighthouse', payload: { siteId: 999 } })

  const summary = await drainQueue(db, { lighthouse: lighthouseHandler }, { concurrency: 1 })
  expect(summary).toEqual({ done: 0, failed: 1 })
  const failed = db.prepare("SELECT error FROM jobs WHERE status = 'failed'").get() as {
    error: string
  }
  expect(failed.error).toContain('999')
})

test('job gagal bila belum ada halaman untuk diukur', async () => {
  const site = createSite(db, { name: 'Kosong', base_url: 'https://kosong.test' })
  const run = createRun(db, site.id, 'lighthouse')
  enqueue(db, { runId: run.id, type: 'lighthouse', payload: { siteId: site.id } })

  const summary = await drainQueue(db, { lighthouse: lighthouseHandler }, { concurrency: 1 })
  expect(summary).toEqual({ done: 0, failed: 1 })
  const failed = db.prepare("SELECT error FROM jobs WHERE status = 'failed'").get() as {
    error: string
  }
  expect(failed.error).toMatch(/belum ada halaman/i)
})

test('skorTerakhir mengembalikan satu baris terbaru per halaman per strategi', async () => {
  const server = await serverUji()
  try {
    const site = createSite(db, { name: 'Uji', base_url: server.url })
    upsertPage(db, site.id, { url: `${server.url}/`, statusCode: 200, loadMs: 10 })

    for (const _ of [1, 2]) {
      const run = createRun(db, site.id, 'lighthouse')
      enqueue(db, { runId: run.id, type: 'lighthouse', payload: { siteId: site.id } })
      await drainQueue(db, { lighthouse: lighthouseHandler }, { concurrency: 1 })
    }

    // Riwayat memang disimpan per run — dua baris di tabel itu benar. Yang tidak
    // boleh adalah skorTerakhir mengembalikan keduanya.
    const semua = db.prepare('SELECT COUNT(*) AS n FROM lighthouse').get() as { n: number }
    expect(Number(semua.n)).toBe(2)

    const skor = skorTerakhir(db, site.id)
    expect(skor.filter((s) => s.strategy === 'mobile')).toHaveLength(1)
  } finally {
    await server.close()
  }
}, 300_000)

test('halaman yang tidak terjangkau tidak menyimpan skor palsu', async () => {
  // Lighthouse mengembalikan skor 0 untuk halaman mati. Menyimpannya berarti
  // grid skor menampilkan nol yang tidak dapat dibedakan dari halaman buruk.
  const site = createSite(db, { name: 'Mati', base_url: 'http://127.0.0.1:1' })
  upsertPage(db, site.id, { url: 'http://127.0.0.1:1/', statusCode: 200, loadMs: 1 })

  const run = createRun(db, site.id, 'lighthouse')
  enqueue(db, { runId: run.id, type: 'lighthouse', payload: { siteId: site.id } })
  await drainQueue(db, { lighthouse: lighthouseHandler }, { concurrency: 1 })

  const semua = db.prepare('SELECT COUNT(*) AS n FROM lighthouse').get() as { n: number }
  expect(Number(semua.n)).toBe(0)
}, 180_000)
