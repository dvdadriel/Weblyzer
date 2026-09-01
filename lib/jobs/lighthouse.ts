import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { listPages } from '../repos/pages.ts'
import { reconcile, type NewFinding } from '../findings.ts'
import { runLighthouse, type LighthouseTarget, type Strategy } from '../scanners/lighthouse.ts'
import { pilihHalaman } from '../lighthouse-budget.ts'
import { analyzeLighthouse } from '../analyzers/lighthouse.ts'
import { simpanSkor } from '../repos/lighthouse.ts'
import type { PageIdMap } from '../analyzers/bugs.ts'

/**
 * Mengukur Lighthouse untuk halaman yang dipilih anggaran, menyimpan skornya,
 * lalu merekonsiliasi audit binary sebagai temuan.
 *
 * Job terpisah dari `scan` karena 10,7 detik per halaman melawan setengah detik
 * — memaksa pencarian bug menunggu pengukuran Lighthouse membuat keduanya
 * jarang dipakai.
 */
export async function lighthouseHandler(job: Job, db: DatabaseSync): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const semua = listPages(db, siteId)
  if (semua.length === 0) {
    throw new Error(
      `Belum ada halaman untuk diukur pada situs ${siteId} — jalankan pemindaian dulu`,
    )
  }

  const mode = site.lighthouse_mode === 'full' ? 'full' : 'sample'
  const dipilih = pilihHalaman(semua, mode)

  const strategies: Strategy[] =
    site.lighthouse_strategy === 'both' ? ['mobile', 'desktop'] : ['mobile']

  const targets: LighthouseTarget[] = []
  for (const h of dipilih) {
    for (const strategy of strategies) targets.push({ url: h.url, strategy })
  }

  // Port debugging dialokasikan runner itu sendiri: satu tempat, bukan dua.
  const hasil = await runLighthouse(targets)

  const gagalDiukur: NewFinding[] = []
  const pageIds: PageIdMap = {}
  const idPerUrl = new Map(dipilih.map((h) => [h.url, h.id]))
  for (const h of dipilih) pageIds[h.url] = h.id

  for (const r of hasil) {
    // Halaman yang gagal dimuat mengembalikan skor 0. Menyimpannya membuat grid
    // skor menampilkan nol yang tidak dapat dibedakan dari halaman yang memang
    // buruk — pengukuran yang tidak terjadi bukan pengukuran bernilai nol.
    //
    // Tetapi melewatinya diam-diam juga salah: pengguna melihat "6 pengukuran"
    // tanpa tahu tujuh dicoba. Kegagalannya dilaporkan sebagai temuan supaya
    // terlihat, dengan aturannya sendiri agar tidak tertukar dengan skor buruk.
    if (r.error !== undefined) {
      gagalDiukur.push({
        url: r.url,
        pageId: idPerUrl.get(r.url) ?? null,
        key: r.strategy,
        severity: 'low',
        rule: 'lighthouse-gagal',
        title: `[${r.strategy}] Halaman tidak dapat diukur Lighthouse`,
        detail: { strategy: r.strategy, error: r.error },
      })
      continue
    }
    const pageId = idPerUrl.get(r.url)
    if (pageId === undefined) continue
    simpanSkor(db, job.run_id, pageId, r)
  }

  reconcile(db, siteId, job.run_id, 'lighthouse', [
    ...analyzeLighthouse(hasil, pageIds),
    ...gagalDiukur,
  ])
}
