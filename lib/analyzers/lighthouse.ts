import type { NewFinding } from '../findings.ts'
import type { LighthouseResult } from '../scanners/lighthouse.ts'
import type { PageIdMap } from './bugs.ts'

/**
 * Menilai hasil Lighthouse sebagai temuan. Fungsi murni: tidak menyentuh
 * browser maupun database.
 *
 * **Hanya audit `binary` yang menjadi temuan.** Audit `numeric` dan
 * `metricSavings` adalah pengukuran, dan terbukti berubah antar run tanpa apa
 * pun berubah di situs — pada satu halaman springair.co.id, `speed-index`
 * bergerak 0,43 → 0,70 dan `largest-contentful-paint` 0 → 0,23 di dua run
 * berurutan. Menjadikannya temuan berarti riwayat "sudah diperbaiki" penuh
 * kebohongan setiap malam. Skornya sendiri disimpan di tabel `lighthouse`,
 * tempat fluktuasi memang wajar karena itu pengukuran bertanggal.
 *
 * Ditambah satu pengecualian yang ditemukan dari pemakaian nyata: `binary` saja
 * tidak cukup, karena beberapa audit binary mengamati **perilaku runtime**
 * alih-alih struktur halaman. Lihat `DIAMATI_DI_TEMPAT_LAIN`.
 */
/**
 * Audit binary yang tetap dilewati, karena mengamati perilaku saat halaman
 * dimuat — bukan struktur halaman — sehingga hasilnya berubah antar muat.
 *
 * `errors-in-console`: terukur berkedip di pemakaian nyata (22 → 23 temuan di
 * dua pengukuran berurutan springair.co.id, tanpa apa pun berubah di situs).
 * Dan aturan ini duplikat: analyzer `console` sudah melaporkan error konsol
 * per pesan dengan kunci yang distabilkan, sedangkan Lighthouse hanya bilang
 * "ada error" tanpa menyebut isinya.
 *
 * Syarat masuk daftar ini: audit harus mengamati kejadian, bukan struktur, DAN
 * sudah terlihat berkedip atau sudah dilaporkan lebih baik di kategori lain.
 * Bukan tempat menyembunyikan audit yang merepotkan.
 */
const DIAMATI_DI_TEMPAT_LAIN = new Set(['errors-in-console'])

export function analyzeLighthouse(
  results: LighthouseResult[],
  pageIds: PageIdMap = {},
): NewFinding[] {
  const findings: NewFinding[] = []

  for (const r of results) {
    // Halaman yang gagal dimuat mengembalikan laporan penuh dengan nol audit
    // gagal. Menilainya berarti melaporkan "tidak ada masalah" untuk halaman
    // mati, dan itu akan menandai temuan lama sebagai sudah diperbaiki.
    if (r.error !== undefined) continue

    for (const audit of r.audits) {
      if (audit.displayMode !== 'binary') continue
      if (DIAMATI_DI_TEMPAT_LAIN.has(audit.id)) continue
      findings.push({
        url: r.url,
        pageId: pageIds[r.url] ?? null,
        // `strategy` wajib ada di key: tanpa itu hasil mobile dan desktop
        // punya fingerprint yang sama dan saling menimpa.
        key: `${r.strategy}\n${audit.id}`,
        severity: audit.score === 0 ? 'medium' : 'low',
        rule: 'lighthouse-audit',
        title: `[${r.strategy}] ${audit.title}`,
        detail: { auditId: audit.id, score: audit.score, strategy: r.strategy },
      })
    }
  }

  return findings
}
