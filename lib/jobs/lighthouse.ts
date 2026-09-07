import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { listPages } from '../repos/pages.ts'
import { reconcile, type NewFinding } from '../findings.ts'
import {
  runLighthouse,
  type LighthouseResult,
  type LighthouseTarget,
  type Strategy,
} from '../scanners/lighthouse.ts'
import { pilihHalaman } from '../lighthouse-budget.ts'
import { analyzeLighthouse } from '../analyzers/lighthouse.ts'
import { simpanSkor } from '../repos/lighthouse.ts'
import type { PageIdMap } from '../analyzers/bugs.ts'

/**
 * Menggabungkan dua pengukuran atas target yang sama, menyisakan hanya audit
 * yang gagal di keduanya.
 *
 * Skor diambil dari pengukuran kedua, bukan dirata-rata: skor adalah pengamatan
 * bertanggal, dan rata-rata dari dua angka yang berbeda bukan angka yang pernah
 * benar-benar terjadi.
 *
 * Sebuah target dianggap gagal bila salah satu pengukurannya gagal — kalau kita
 * tidak berhasil melihatnya dua kali, kita tidak tahu keadaannya.
 */
export function irisanAudit(
  pertama: LighthouseResult[],
  kedua: LighthouseResult[],
): LighthouseResult[] {
  const petaKedua = new Map(kedua.map((r) => [`${r.url}\n${r.strategy}`, r]))

  return pertama.map((a) => {
    const b = petaKedua.get(`${a.url}\n${a.strategy}`)
    if (b === undefined) return a
    if (a.error !== undefined) return a
    if (b.error !== undefined) return b

    const idKedua = new Set(b.audits.map((x) => x.id))
    return {
      ...b,
      audits: a.audits.filter((x) => idKedua.has(x.id)),
    }
  })
}

/**
 * Menyusun daftar pengukuran dari halaman terpilih dan setelan strategi situs.
 *
 * Dipisah supaya sakelar `both` bisa diuji tanpa menyalakan Chrome: inilah
 * satu-satunya tempat yang memutuskan desktop ikut diukur atau tidak, dan
 * kalau ia diam-diam kembali ke mobile saja, seluruh sub-tab Desktop menjadi
 * kosong tanpa satu pun galat.
 *
 * Nilai selain `both` diperlakukan sebagai mobile, bukan dilempar: kolomnya
 * TEXT bebas di SQLite dan bisa berisi apa saja. Mengukur mobile saja adalah
 * kegagalan yang aman; melempar akan menggagalkan seluruh pengukuran karena
 * satu setelan yang salah tulis.
 */
export function susunTargets(urls: string[], strategi: string): LighthouseTarget[] {
  const strategies: Strategy[] = strategi === 'both' ? ['mobile', 'desktop'] : ['mobile']
  const targets: LighthouseTarget[] = []
  for (const url of urls) {
    for (const strategy of strategies) targets.push({ url, strategy })
  }
  return targets
}

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

  const targets = susunTargets(dipilih.map((h) => h.url), site.lighthouse_strategy)

  // Port debugging dialokasikan runner itu sendiri: satu tempat, bukan dua.
  //
  // Diukur dua kali, dan hanya audit yang gagal di KEDUA pengukuran yang
  // dilaporkan. Alasannya terbukti di lapangan: homepage springair.co.id
  // melaporkan "tidak ada <main>" pada satu pengukuran dan tidak pada
  // berikutnya — audit itu struktural, tetapi strukturnya sendiri bergantung
  // waktu karena isinya dirender klien. Menambal per-audit tidak menutup
  // kelasnya; audit apa pun bisa berkedip di halaman semacam itu.
  //
  // Harganya dua kali lipat waktu (mode sample: ~2,2 menit, bukan 1,1). Itu
  // pertukaran yang benar: temuan yang berkedip menandai dirinya "sudah
  // diperbaiki" tanpa ada yang diperbaiki, dan itu satu-satunya hal yang
  // membuat alat ini lebih berguna daripada membuka DevTools sendiri.
  const [pertama, kedua] = [await runLighthouse(targets), await runLighthouse(targets)]
  const hasil = irisanAudit(pertama, kedua)

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
