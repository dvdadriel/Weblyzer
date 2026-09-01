import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { upsertPage } from '../repos/pages.ts'
import { reconcile } from '../findings.ts'
import { visit } from '../scanners/visit.ts'
import { analyzeBugs, type PageIdMap } from '../analyzers/bugs.ts'
import { analyzeConsole } from '../analyzers/console.ts'

const ANALYZERS = {
  bugs: analyzeBugs,
  console: analyzeConsole,
} as const

export type ScanCategory = keyof typeof ANALYZERS

/**
 * Satu kunjungan browser, lalu setiap analyzer menilai data yang sama.
 * Menjalankan dua kategori berarti dua rekonsiliasi, bukan dua penjelajahan.
 */
export async function scanHandler(job: Job, db: DatabaseSync): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const only = job.payload.only === undefined ? undefined : String(job.payload.only)
  if (only !== undefined && !(only in ANALYZERS)) {
    throw new Error(`Kategori tidak dikenal: ${only}`)
  }
  const categories = (only === undefined ? Object.keys(ANALYZERS) : [only]) as ScanCategory[]

  const visits = await visit(site.base_url, { maxPages: site.max_pages })

  // Situs yang tidak terjangkau menghasilkan kunjungan kosong. Merekonsiliasi
  // hasil itu akan menandai setiap temuan lama sebagai "sudah diperbaiki" —
  // jawaban percaya diri yang salah. Lebih baik menggagalkan job.
  const root = visits[0]
  if (!root || root.statusCode === 0) {
    throw new Error(
      `Situs tidak terjangkau: ${site.base_url} — pemindaian dibatalkan agar temuan lama ` +
        `tidak salah ditandai sudah diperbaiki`,
    )
  }

  const pageIds: PageIdMap = {}
  for (const v of visits) {
    const stored = upsertPage(db, siteId, {
      url: v.url,
      statusCode: v.statusCode,
      loadMs: v.loadMs,
    })
    pageIds[v.url] = stored.id
  }

  for (const category of categories) {
    reconcile(db, siteId, job.run_id, category, ANALYZERS[category](visits, pageIds))
  }
}
