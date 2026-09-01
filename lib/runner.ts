import type { DatabaseSync } from 'node:sqlite'
import { claimNext, completeJob, failJob, type Job } from './queue.ts'

export type JobHandler = (job: Job, db: DatabaseSync) => Promise<void>
export type JobHandlers = Record<string, JobHandler>

export type DrainSummary = { done: number; failed: number }

/**
 * Menguras antrian sampai kosong, menjalankan paling banyak `concurrency` job
 * secara bersamaan. Kegagalan satu job tidak pernah menghentikan yang lain —
 * satu halaman rusak tidak boleh membatalkan seluruh scan.
 */
export async function drainQueue(
  db: DatabaseSync,
  handlers: JobHandlers,
  opts: { concurrency?: number } = {},
): Promise<DrainSummary> {
  const limit = Math.max(1, opts.concurrency ?? 3)
  const summary: DrainSummary = { done: 0, failed: 0 }
  const active = new Set<Promise<void>>()

  const runOne = async (job: Job): Promise<void> => {
    const handler = handlers[job.type]
    if (!handler) {
      failJob(db, job.id, `Tidak ada handler untuk tipe job "${job.type}"`)
      summary.failed += 1
      return
    }
    try {
      await handler(job, db)
      completeJob(db, job.id)
      summary.done += 1
    } catch (err) {
      failJob(db, job.id, err instanceof Error ? err.message : String(err))
      summary.failed += 1
    }
  }

  for (;;) {
    while (active.size < limit) {
      const job = claimNext(db)
      if (!job) break
      const promise = runOne(job).finally(() => active.delete(promise))
      active.add(promise)
    }
    if (active.size === 0) break
    await Promise.race(active)
  }

  return summary
}
