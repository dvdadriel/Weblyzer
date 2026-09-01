import type { DatabaseSync } from 'node:sqlite'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export type Job = {
  id: number
  run_id: number
  type: string
  payload: Record<string, unknown>
  status: JobStatus
  attempts: number
}

type JobRow = {
  id: number
  run_id: number
  type: string
  payload_json: string
  status: JobStatus
  attempts: number
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    run_id: row.run_id,
    type: row.type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    status: row.status,
    attempts: row.attempts,
  }
}

export function enqueue(
  db: DatabaseSync,
  input: { runId: number; type: string; payload?: Record<string, unknown> },
): number {
  const row = db
    .prepare('INSERT INTO jobs (run_id, type, payload_json) VALUES (?, ?, ?) RETURNING id')
    .get(input.runId, input.type, JSON.stringify(input.payload ?? {})) as { id: number }
  return row.id
}

/**
 * Mengambil satu job berikutnya secara atomik. `UPDATE ... RETURNING` pada
 * subquery memastikan dua pemanggil bersamaan tidak pernah mendapat job yang
 * sama, tanpa perlu kunci di sisi aplikasi.
 */
export function claimNext(db: DatabaseSync): Job | undefined {
  const row = db
    .prepare(
      `UPDATE jobs
       SET status = 'running', attempts = attempts + 1, started_at = datetime('now')
       WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1)
       RETURNING id, run_id, type, payload_json, status, attempts`,
    )
    .get() as JobRow | undefined
  return row ? toJob(row) : undefined
}

export function completeJob(db: DatabaseSync, id: number): void {
  db.prepare(
    `UPDATE jobs SET status = 'done', finished_at = datetime('now') WHERE id = ?`,
  ).run(id)
}

export function failJob(db: DatabaseSync, id: number, error: string): void {
  db.prepare(
    `UPDATE jobs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?`,
  ).run(error, id)
}

/**
 * Dipanggil saat aplikasi mulai. Job yang tertinggal berstatus `running` berarti
 * proses sebelumnya mati di tengah jalan — kembalikan ke antrian agar tidak ada
 * pekerjaan yang hilang diam-diam.
 */
export function requeueInterrupted(db: DatabaseSync): number {
  const result = db
    .prepare(
      `UPDATE jobs SET status = 'queued', error = 'interrupted' WHERE status = 'running'`,
    )
    .run()
  return Number(result.changes)
}

export function countQueued(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'").get() as {
    n: number
  }
  return Number(row.n)
}
