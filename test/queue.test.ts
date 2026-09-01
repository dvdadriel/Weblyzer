import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { enqueue, claimNext, completeJob, failJob, requeueInterrupted } from '../lib/queue.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('S', 'https://a.test')").run()
})

test('membuat run dengan status queued dan trigger default manual', () => {
  const run = createRun(db, 1, 'crawl')
  expect(run.status).toBe('queued')
  expect(run.trigger).toBe('manual')
  expect(run.ai_status).toBe('not_needed')
})

test('job diambil satu per satu menurut urutan masuk', () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: 1 } })
  enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: 2 } })

  const first = claimNext(db)
  const second = claimNext(db)
  expect(first?.payload).toEqual({ siteId: 1 })
  expect(second?.payload).toEqual({ siteId: 2 })
  expect(claimNext(db)).toBeUndefined()
})

test('job yang diambil berstatus running dan attempts bertambah', () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: {} })
  const job = claimNext(db)
  expect(job?.status).toBe('running')
  expect(job?.attempts).toBe(1)
})

test('completeJob menandai selesai, failJob menyimpan pesan error', () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: {} })
  enqueue(db, { runId: run.id, type: 'crawl', payload: {} })

  completeJob(db, claimNext(db)!.id)
  failJob(db, claimNext(db)!.id, 'chromium gagal dijalankan')

  const rows = db
    .prepare('SELECT status, error FROM jobs ORDER BY id')
    .all() as { status: string; error: string | null }[]
  expect(rows[0]!.status).toBe('done')
  expect(rows[1]!.status).toBe('failed')
  expect(rows[1]!.error).toBe('chromium gagal dijalankan')
})

test('job yang tertinggal running setelah restart dapat dikembalikan ke antrian', () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: {} })
  claimNext(db)

  expect(requeueInterrupted(db)).toBe(1)
  expect(claimNext(db)?.attempts).toBe(2)
})

test('finishRun menutup run dan mencatat waktu selesai', () => {
  const run = createRun(db, 1, 'crawl')
  finishRun(db, run.id, 'done')
  const row = db
    .prepare('SELECT status, finished_at FROM runs WHERE id = ?')
    .get(run.id) as { status: string; finished_at: string | null }
  expect(row.status).toBe('done')
  expect(row.finished_at).not.toBeNull()
})
