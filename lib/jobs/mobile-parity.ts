import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { listPages } from '../repos/pages.ts'
import { pilihHalaman } from '../lighthouse-budget.ts'
import { reconcile, type NewFinding } from '../findings.ts'
import { ukurSitus, type UkuranHalaman } from '../scanners/mobile-parity.ts'
import { analisisSitus } from '../analyzers/mobile-parity.ts'

/**
 * Pengukur bisa ditukar, dan itu untuk pengujian.
 *
 * Tanpa seam ini, menguji job ini berarti menyalakan Chromium tiga kali per
 * halaman — dan yang diuji sebenarnya adalah pemetaan pengukuran menjadi
 * temuan, bukan Chromium-nya. Pengukur sungguhannya diuji terpisah terhadap
 * halaman fixture yang cacatnya sudah diketahui.
 */
export type Pengukur = (urls: string[]) => Promise<UkuranHalaman[]>

/**
 * Mobile Parity untuk satu situs.
 *
 * Halamannya dipilih `pilihHalaman`, mesin yang sama dengan Lighthouse, dan
 * itu bukan kebetulan: cacat tata letak berulang PER TEMPLATE, bukan per
 * halaman. Enam puluh halaman berita punya satu tata letak, jadi mengukur
 * keenam puluhnya menghasilkan enam puluh salinan temuan yang sama dan
 * menghabiskan sepuluh menit. `pilihHalaman` sudah menyusutkannya menjadi satu
 * contoh per pola, berdasarkan data dan bukan dugaan bentuk URL.
 */
export async function mobileParityHandler(
  job: Job,
  db: DatabaseSync,
  ukur: Pengukur = ukurSitus,
): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const semua = listPages(db, siteId)

  // Situs yang belum pernah dijelajah tetap bisa diukur — berandanya saja.
  //
  // Bukan kemewahan: inilah cara aspek ini bisa dipakai lebih dulu, sebelum
  // crawl penuh yang butuh menit-menitan. Dan kegagalan nomor satu ("mobile
  // terabaikan") hampir selalu sudah terlihat di beranda.
  const halaman =
    semua.length === 0
      ? [{ id: null as number | null, url: site.base_url }]
      : pilihHalaman(semua, 'sample').map((h) => ({ id: h.id as number | null, url: h.url }))

  const ukuran = await ukur(halaman.map((h) => h.url))

  const idPerUrl = new Map(halaman.map((h) => [h.url, h.id]))
  const temuan: NewFinding[] = analisisSitus(ukuran).map((t) => ({
    url: t.url,
    // `?? null`, bukan `!`: halaman yang diukur bisa saja tidak ada di peta
    // kalau redirect membawanya ke URL lain, dan temuan tanpa `page_id` tetap
    // sah — kolomnya nullable justru untuk itu.
    pageId: idPerUrl.get(t.url) ?? null,
    severity: t.severity,
    rule: t.rule,
    title: t.title,
    // URL ikut masuk ke detail, dan itu bukan duplikasi yang sia-sia: tabel
    // `findings` tidak punya kolom URL — ia diambil lewat `page_id`. Untuk
    // situs yang belum pernah dijelajah, `page_id` NULL dan URL-nya akan
    // hilang sepenuhnya dari temuan yang sudah tersimpan.
    detail: { ...t.detail, diukurDi: t.url },
  }))

  // Mode `tegas`, sama dengan kategori deterministik lain.
  //
  // Bukan `lunak` seperti geo/audit: seluruh temuan di sini berasal dari
  // `getComputedStyle` dan `getBoundingClientRect`, jadi jawabannya sama tiap
  // run selama situsnya tidak berubah. Mode lunak ada untuk menahan temuan
  // yang bergeser karena modelnya, dan di sini tidak ada model.
  reconcile(db, siteId, job.run_id, 'mobile', temuan)
}
