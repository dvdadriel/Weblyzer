import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { createRun } from '../lib/repos/runs.ts'
import { enqueue } from '../lib/queue.ts'
import { drainQueue, type JobHandlers } from '../lib/runner.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('S', 'https://a.test')").run()
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('menjalankan semua job yang mengantre', async () => {
  const run = createRun(db, 1, 'crawl')
  const seen: number[] = []
  for (const n of [1, 2, 3]) enqueue(db, { runId: run.id, type: 'noop', payload: { n } })

  const handlers: JobHandlers = {
    noop: async (job) => {
      seen.push(job.payload.n as number)
    },
  }
  const summary = await drainQueue(db, handlers, { concurrency: 2 })

  expect(seen.sort()).toEqual([1, 2, 3])
  expect(summary).toEqual({ done: 3, failed: 0 })
})

test('tidak pernah melebihi batas paralel', async () => {
  const run = createRun(db, 1, 'crawl')
  for (let n = 0; n < 6; n += 1) enqueue(db, { runId: run.id, type: 'slow', payload: {} })

  let active = 0
  let peak = 0
  const handlers: JobHandlers = {
    slow: async () => {
      active += 1
      peak = Math.max(peak, active)
      await sleep(20)
      active -= 1
    },
  }

  await drainQueue(db, handlers, { concurrency: 2 })
  expect(peak).toBe(2)
})

test('handler yang melempar error menandai job failed tanpa menghentikan job lain', async () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'boom', payload: {} })
  enqueue(db, { runId: run.id, type: 'ok', payload: {} })

  const handlers: JobHandlers = {
    boom: async () => {
      throw new Error('meledak')
    },
    ok: async () => {},
  }
  const summary = await drainQueue(db, handlers, { concurrency: 1 })

  expect(summary).toEqual({ done: 1, failed: 1 })
  const failed = db
    .prepare("SELECT error FROM jobs WHERE status = 'failed'")
    .get() as { error: string }
  expect(failed.error).toContain('meledak')
})

test('job dengan tipe tanpa handler ditandai failed, bukan menggantung', async () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'tidak-dikenal', payload: {} })

  const summary = await drainQueue(db, {}, { concurrency: 1 })
  expect(summary).toEqual({ done: 0, failed: 1 })
  const failed = db
    .prepare("SELECT error FROM jobs WHERE status = 'failed'")
    .get() as { error: string }
  expect(failed.error).toContain('tidak-dikenal')
})
