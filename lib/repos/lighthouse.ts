import type { DatabaseSync } from 'node:sqlite'
import type { LighthouseResult } from '../scanners/lighthouse.ts'

export type BarisSkor = {
  url: string
  strategy: string
  perf: number | null
  a11y: number | null
  best_practices: number | null
  seo: number | null
}

/**
 * Menyimpan skor satu pengukuran. Baris baru per run, bukan menimpa: yang
 * membuat tab Lighthouse berguna adalah melihat skor bergerak dari waktu ke
 * waktu, bukan sekadar angka hari ini.
 *
 * `raw_json` sengaja tidak diisi. Laporan penuh Lighthouse berukuran ~500KB per
 * halaman; menyimpannya untuk 141 halaman × 2 strategi × tiap malam akan
 * menumbuhkan database puluhan gigabyte demi data yang belum ada yang membaca.
 */
export function simpanSkor(
  db: DatabaseSync,
  runId: number,
  pageId: number,
  hasil: LighthouseResult,
): void {
  db.prepare(
    `INSERT INTO lighthouse (run_id, page_id, strategy, perf, a11y, best_practices, seo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    pageId,
    hasil.strategy,
    hasil.scores.perf,
    hasil.scores.a11y,
    hasil.scores.bestPractices,
    hasil.scores.seo,
  )
}

/** Skor terbaru per halaman per strategi. */
export function skorTerakhir(db: DatabaseSync, siteId: number): BarisSkor[] {
  return db
    .prepare(
      `SELECT p.url, l.strategy, l.perf, l.a11y, l.best_practices, l.seo
       FROM lighthouse l
       JOIN pages p ON p.id = l.page_id
       WHERE p.site_id = ?
         AND l.id = (
           SELECT MAX(l2.id) FROM lighthouse l2
           WHERE l2.page_id = l.page_id AND l2.strategy = l.strategy
         )
       ORDER BY p.url, l.strategy`,
    )
    .all(siteId) as unknown as BarisSkor[]
}
