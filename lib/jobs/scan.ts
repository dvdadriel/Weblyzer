import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { upsertPage } from '../repos/pages.ts'
import { reconcile, type NewFinding } from '../findings.ts'
import { visit, type PageVisit } from '../scanners/visit.ts'
import { probeSite, type ProbeResult } from '../scanners/probe.ts'
import { analyzeBugs, type PageIdMap } from '../analyzers/bugs.ts'
import { analyzeConsole } from '../analyzers/console.ts'
import { analyzeSecurity } from '../analyzers/security.ts'

/** Kategori yang butuh permintaan langsung ke server, di luar kunjungan browser. */
const BUTUH_PROBE = new Set<string>(['security'])

const KATEGORI = ['bugs', 'console', 'security'] as const
export type ScanCategory = (typeof KATEGORI)[number]

const PROBE_KOSONG: ProbeResult = { exposed: [], directoryListing: [], tls: null }

function nilai(
  category: ScanCategory,
  visits: PageVisit[],
  pageIds: PageIdMap,
  probe: ProbeResult | null,
): NewFinding[] {
  switch (category) {
    case 'bugs':
      return analyzeBugs(visits, pageIds)
    case 'console':
      return analyzeConsole(visits, pageIds)
    case 'security':
      return analyzeSecurity(visits, probe ?? PROBE_KOSONG, pageIds)
  }
}

/**
 * Satu kunjungan browser, lalu setiap analyzer menilai data yang sama.
 * Menjalankan tiga kategori berarti tiga rekonsiliasi, bukan tiga penjelajahan.
 *
 * Probe hanya dijalankan bila kategori yang diminta memerlukannya — memindai
 * bug seharusnya tidak menembakkan sembilan permintaan tambahan ke situs orang.
 */
export async function scanHandler(job: Job, db: DatabaseSync): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const only = job.payload.only === undefined ? undefined : String(job.payload.only)
  if (only !== undefined && !KATEGORI.includes(only as ScanCategory)) {
    throw new Error(`Kategori tidak dikenal: ${only}`)
  }
  const categories: ScanCategory[] = only === undefined ? [...KATEGORI] : [only as ScanCategory]

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

  const probe = categories.some((c) => BUTUH_PROBE.has(c)) ? await probeSite(site.base_url) : null

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
    reconcile(db, siteId, job.run_id, category, nilai(category, visits, pageIds, probe))
  }
}
