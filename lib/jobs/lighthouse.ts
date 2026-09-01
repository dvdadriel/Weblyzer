import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { listPages } from '../repos/pages.ts'
import { reconcile } from '../findings.ts'
import { runLighthouse, type LighthouseTarget, type Strategy } from '../scanners/lighthouse.ts'
import { pilihHalaman } from '../lighthouse-budget.ts'
import { analyzeLighthouse } from '../analyzers/lighthouse.ts'
import { simpanSkor } from '../repos/lighthouse.ts'
import type { PageIdMap } from '../analyzers/bugs.ts'

/**
 * Meminta satu port debugging yang benar-benar bebas dari sistem operasi.
 *
 * Port bawaan `runLighthouse` adalah 9222 dan port itu global: dua pengukuran
 * yang berjalan bersamaan menyambung ke browser yang sama dan gagal dengan
 * "An internal Chrome error occurred". Itu bukan skenario teoretis —
 * `drainQueue` menjalankan tiga job sekaligus secara bawaan, jadi dua situs
 * yang diukur pada malam yang sama sudah cukup.
 */
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

  const pageIds: PageIdMap = {}
  const idPerUrl = new Map(dipilih.map((h) => [h.url, h.id]))
  for (const h of dipilih) pageIds[h.url] = h.id

  for (const r of hasil) {
    // Halaman yang gagal dimuat mengembalikan skor 0. Menyimpannya membuat grid
    // skor menampilkan nol yang tidak dapat dibedakan dari halaman yang memang
    // buruk — pengukuran yang tidak terjadi bukan pengukuran bernilai nol.
    if (r.error !== undefined) continue
    const pageId = idPerUrl.get(r.url)
    if (pageId === undefined) continue
    simpanSkor(db, job.run_id, pageId, r)
  }

  reconcile(db, siteId, job.run_id, 'lighthouse', analyzeLighthouse(hasil, pageIds))
}
