import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { upsertPage } from '../repos/pages.ts'
import { reconcile, type NewFinding } from '../findings.ts'
import { crawl } from '../scanners/crawl.ts'

/**
 * Menjalankan scanner crawl lalu menyimpan hasilnya. Scanner sendiri tidak
 * menyentuh database — pemisahan ini yang membuatnya dapat diuji tanpa DB dan
 * dipakai ulang oleh fitur recheck satu halaman.
 */
export async function crawlHandler(job: Job, db: DatabaseSync): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const pages = await crawl(site.base_url, { maxPages: site.max_pages })

  // Crawl tidak pernah melempar: situs yang mati mengembalikan satu entri
  // berstatus 0 tanpa tautan. Merekonsiliasi hasil kosong itu akan menandai
  // SEMUA temuan lama sebagai "sudah diperbaiki" sambil melaporkan sukses —
  // kebalikan dari yang sebenarnya terjadi. Lebih baik menggagalkan job.
  const root = pages[0]
  if (!root || root.statusCode === 0) {
    throw new Error(
      `Situs tidak terjangkau: ${site.base_url} — crawl dibatalkan agar temuan lama ` +
        `tidak salah ditandai sudah diperbaiki`,
    )
  }

  const findings: NewFinding[] = []

  for (const page of pages) {
    const stored = upsertPage(db, siteId, {
      url: page.url,
      statusCode: page.statusCode,
      loadMs: page.loadMs,
    })

    const ok = page.statusCode >= 200 && page.statusCode < 400
    if (ok) continue

    findings.push({
      url: page.url,
      pageId: stored.id,
      severity: page.statusCode >= 500 || page.statusCode === 0 ? 'critical' : 'high',
      rule: 'http-error',
      title:
        page.statusCode === 0
          ? `Halaman gagal dimuat: ${page.url}`
          : `HTTP ${page.statusCode} pada ${page.url}`,
      detail: { statusCode: page.statusCode, loadMs: page.loadMs },
    })
  }

  reconcile(db, siteId, job.run_id, 'bugs', findings)
}
