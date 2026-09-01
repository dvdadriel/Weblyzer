import type { DatabaseSync } from 'node:sqlite'

export type Page = {
  id: number
  site_id: number
  url: string
  status_code: number | null
  load_ms: number | null
  last_seen_at: string | null
  is_pinned: number
}

/**
 * Menyimpan halaman hasil crawl. Halaman yang sudah ada diperbarui, bukan
 * digandakan, sehingga `pages.id` stabil dan dapat dirujuk oleh temuan lintas run.
 */
export function upsertPage(
  db: DatabaseSync,
  siteId: number,
  input: { url: string; statusCode: number | null; loadMs: number | null },
): Page {
  const row = db
    .prepare(
      `INSERT INTO pages (site_id, url, status_code, load_ms, last_seen_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(site_id, url) DO UPDATE
         SET status_code  = excluded.status_code,
             load_ms      = excluded.load_ms,
             last_seen_at = excluded.last_seen_at
       RETURNING id, site_id, url, status_code, load_ms, last_seen_at, is_pinned`,
    )
    .get(siteId, input.url, input.statusCode, input.loadMs)
  return row as unknown as Page
}

export function listPages(db: DatabaseSync, siteId: number): Page[] {
  return db
    .prepare(
      `SELECT id, site_id, url, status_code, load_ms, last_seen_at, is_pinned
       FROM pages WHERE site_id = ? ORDER BY url`,
    )
    .all(siteId) as unknown as Page[]
}
