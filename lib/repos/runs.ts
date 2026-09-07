import type { DatabaseSync } from 'node:sqlite'

export type RunType =
  | 'crawl'
  | 'bugs'
  | 'console'
  | 'security'
  | 'lighthouse'
  | 'seo'
  | 'ringkasan'
  | 'full'
export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type AiStatus = 'ok' | 'failed' | 'skipped' | 'not_needed'

export type Run = {
  id: number
  site_id: number
  type: RunType
  status: RunStatus
  trigger: 'manual' | 'scheduled'
  started_at: string | null
  finished_at: string | null
  error: string | null
  ai_status: AiStatus
  ai_error: string | null
  ai_model: string | null
}

const COLUMNS = `id, site_id, type, status, trigger, started_at, finished_at, error,
                 ai_status, ai_error, ai_model`

export function createRun(
  db: DatabaseSync,
  siteId: number,
  type: RunType,
  trigger: 'manual' | 'scheduled' = 'manual',
): Run {
  const row = db
    .prepare(
      `INSERT INTO runs (site_id, type, trigger, status, started_at)
       VALUES (?, ?, ?, 'queued', datetime('now'))
       RETURNING ${COLUMNS}`,
    )
    .get(siteId, type, trigger)
  return row as unknown as Run
}

export function finishRun(
  db: DatabaseSync,
  runId: number,
  status: RunStatus,
  error: string | null = null,
): void {
  db.prepare(
    `UPDATE runs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?`,
  ).run(status, error, runId)
}

export function setAiStatus(
  db: DatabaseSync,
  runId: number,
  status: AiStatus,
  model: string | null = null,
  error: string | null = null,
): void {
  db.prepare('UPDATE runs SET ai_status = ?, ai_model = ?, ai_error = ? WHERE id = ?').run(
    status,
    model,
    error,
    runId,
  )
}

export function getRun(db: DatabaseSync, id: number): Run | undefined {
  return db.prepare(`SELECT ${COLUMNS} FROM runs WHERE id = ?`).get(id) as unknown as
    | Run
    | undefined
}
