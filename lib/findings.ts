import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type FindingStatus = 'open' | 'fixed' | 'ignored'

export type NewFinding = {
  url: string
  pageId: number | null
  severity: Severity
  rule: string
  title: string
  /** Pembeda tambahan bila satu aturan bisa muncul beberapa kali pada URL yang sama. */
  key?: string
  detail?: unknown
}

export type ReconcileResult = {
  opened: number
  reopened: number
  stillOpen: number
  fixed: number
}

/**
 * Identitas sebuah temuan. Selama tiga masukan ini tidak berubah, temuan yang
 * sama pada run berikutnya dikenali sebagai temuan yang sama — inilah dasar
 * deteksi otomatis "sudah diperbaiki".
 */
export function fingerprintOf(url: string, rule: string, key = ''): string {
  return createHash('sha256').update(`${url}\n${rule}\n${key}`).digest('hex').slice(0, 16)
}

/**
 * Menyelaraskan temuan tersimpan dengan hasil satu scan.
 *
 * Strateginya: tandai semua temuan open pada kategori ini sebagai fixed lebih
 * dulu, lalu buka kembali yang benar-benar dilaporkan. Ini menghindari klausa
 * `NOT IN (...)` yang akan menabrak batas jumlah parameter SQLite pada situs
 * besar.
 *
 * Temuan berstatus `ignored` tidak pernah disentuh — keputusan manual pengguna
 * bersifat lengket.
 */
export function reconcile(
  db: DatabaseSync,
  siteId: number,
  runId: number,
  category: string,
  incoming: NewFinding[],
): ReconcileResult {
  const priorRows = db
    .prepare('SELECT fingerprint, status FROM findings WHERE site_id = ? AND category = ?')
    .all(siteId, category) as { fingerprint: string; status: FindingStatus }[]
  const prior = new Map(priorRows.map((r) => [r.fingerprint, r.status]))

  const result: ReconcileResult = { opened: 0, reopened: 0, stillOpen: 0, fixed: 0 }

  db.exec('BEGIN')
  try {
    db.prepare(
      `UPDATE findings SET status = 'fixed'
       WHERE site_id = ? AND category = ? AND status = 'open'`,
    ).run(siteId, category)

    const insert = db.prepare(
      `INSERT INTO findings (site_id, page_id, category, severity, rule, title,
                             detail_json, fingerprint, status, first_seen_run, last_seen_run)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    )
    const refresh = db.prepare(
      `UPDATE findings
       SET page_id = ?, severity = ?, title = ?, detail_json = ?,
           last_seen_run = ?,
           status = CASE WHEN status = 'ignored' THEN 'ignored' ELSE 'open' END
       WHERE site_id = ? AND fingerprint = ?`,
    )

    const seen = new Set<string>()
    for (const f of incoming) {
      const fp = fingerprintOf(f.url, f.rule, f.key ?? '')
      if (seen.has(fp)) continue
      seen.add(fp)

      const detail = JSON.stringify(f.detail ?? {})
      const previous = prior.get(fp)

      if (previous === undefined) {
        insert.run(
          siteId,
          f.pageId,
          category,
          f.severity,
          f.rule,
          f.title,
          detail,
          fp,
          runId,
          runId,
        )
        result.opened += 1
      } else {
        refresh.run(f.pageId, f.severity, f.title, detail, runId, siteId, fp)
        if (previous === 'open') result.stillOpen += 1
        else if (previous === 'fixed') result.reopened += 1
      }
    }

    for (const [fp, status] of prior) {
      if (status === 'open' && !seen.has(fp)) result.fixed += 1
    }

    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // sengaja diabaikan: error asli lebih penting
    }
    throw err
  }

  return result
}
