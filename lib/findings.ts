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

/** Urutan keparahan, paling parah lebih dulu. Dipakai untuk memilih pemenang duplikat. */
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

/**
 * Menggabungkan duplikat dalam satu batch: bila url+rule+key sama muncul lebih
 * dari sekali, yang dipertahankan adalah severity tertinggi — bukan yang pertama
 * datang. Urutan kedatangan hanyalah artefak urutan DOM/crawl, jadi hasilnya
 * tidak boleh bergantung padanya.
 */
function dedupeBySeverity(incoming: NewFinding[]): { fp: string; finding: NewFinding }[] {
  const best = new Map<string, { fp: string; finding: NewFinding }>()
  for (const f of incoming) {
    const fp = fingerprintOf(f.url, f.rule, f.key ?? '')
    const current = best.get(fp)
    const lebihParah =
      current === undefined || SEVERITY_RANK[f.severity] < SEVERITY_RANK[current.finding.severity]
    if (lebihParah) best.set(fp, { fp, finding: f })
  }
  return [...best.values()]
}

/**
 * Berapa kali sebuah temuan harus TIDAK dilaporkan sebelum ditandai beres,
 * pada kategori yang dinilai model.
 *
 * Ini mekanisme yang sama dengan Lighthouse yang diukur dua kali dan hanya
 * melaporkan audit yang gagal di kedua pengukuran (§2.1) — dipakai di arah
 * sebaliknya. Alasannya juga sama: satu pengukuran tidak cukup jadi dasar.
 *
 * Kenapa perlu, terukur: setelah audit disuruh berhenti melaporkan apa yang
 * sudah dilaporkan GEO, `reconcile` menandai enam temuan sebagai `fixed` —
 * `tanpa-heading-pertanyaan`, `product-schema-tanpa-penawaran`, dan empat
 * lainnya. Tidak ada satu pun yang diperbaiki; audit cuma berhenti
 * menyebutnya. `fixed` berubah arti menjadi "berhenti dilaporkan", dan itu
 * persis kebohongan yang §2.1 dibangun untuk mencegah.
 *
 * Dua kali berturut-turut bukan bukti sempurna, tapi jauh lebih kuat daripada
 * sekali — dan yang tertinggal satu kali tetap `open` serta disebut apa adanya
 * di layar: tidak dilaporkan pada analisis terakhir.
 */
export const AMBANG_HILANG = 2

export type ModeRekonsiliasi =
  /** Tidak dilaporkan = beres, seketika. Benar untuk aturan deterministik:
   *  `judul-hilang` yang tidak muncul lagi berarti judulnya benar-benar ada. */
  | 'tegas'
  /** Tidak dilaporkan = belum tentu beres. Untuk kategori yang dinilai model,
   *  di mana absennya sebuah temuan bisa berarti beres, bisa berarti model
   *  berubah pikiran, bisa berarti ia diminta tidak mengulang kategori lain. */
  | 'lunak'

/**
 * Menyelaraskan temuan tersimpan dengan hasil satu scan.
 *
 * Mode `tegas` (bawaan): tandai semua temuan open pada kategori ini sebagai
 * fixed lebih dulu, lalu buka kembali yang benar-benar dilaporkan. Ini
 * menghindari klausa `NOT IN (...)` yang akan menabrak batas jumlah parameter
 * SQLite pada situs besar.
 *
 * Mode `lunak`: temuan yang tidak dilaporkan TETAP `open`, dan hanya
 * `last_seen_run`-nya yang tertinggal. Ia baru ditandai `fixed` setelah tidak
 * dilaporkan `AMBANG_HILANG` analisis berturut-turut.
 *
 * Temuan berstatus `ignored` tidak pernah disentuh di kedua mode — keputusan
 * manual pengguna bersifat lengket.
 */
export function reconcile(
  db: DatabaseSync,
  siteId: number,
  runId: number,
  category: string,
  incoming: NewFinding[],
  mode: ModeRekonsiliasi = 'tegas',
): ReconcileResult {
  const result: ReconcileResult = { opened: 0, reopened: 0, stillOpen: 0, fixed: 0 }
  const deduped = dedupeBySeverity(incoming)

  // BEGIN IMMEDIATE, bukan BEGIN biasa: kunci tulis diambil sejak awal sehingga
  // pembacaan `prior` di bawah tidak bisa disusul penulisan koneksi lain.
  db.exec('BEGIN IMMEDIATE')
  try {
    const priorRows = db
      .prepare('SELECT fingerprint, status FROM findings WHERE site_id = ? AND category = ?')
      .all(siteId, category) as { fingerprint: string; status: FindingStatus }[]
    const prior = new Map(priorRows.map((r) => [r.fingerprint, r.status]))

    if (mode === 'tegas') {
      db.prepare(
        `UPDATE findings SET status = 'fixed'
         WHERE site_id = ? AND category = ? AND status = 'open'`,
      ).run(siteId, category)
    }

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
       WHERE site_id = ? AND category = ? AND fingerprint = ?`,
    )

    const seen = new Set<string>()
    for (const { fp, finding: f } of deduped) {
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
        refresh.run(f.pageId, f.severity, f.title, detail, runId, siteId, category, fp)
        if (previous === 'open') result.stillOpen += 1
        else if (previous === 'fixed') result.reopened += 1
      }
    }

    if (mode === 'tegas') {
      for (const [fp, status] of prior) {
        if (status === 'open' && !seen.has(fp)) result.fixed += 1
      }
    } else {
      // Mode lunak: yang tidak dilaporkan baru ditandai beres setelah
      // AMBANG_HILANG analisis berturut-turut melewatkannya.
      //
      // Dihitung dari jumlah RUN kategori ini yang lewat sejak temuan itu
      // terakhir dilaporkan, bukan dari selisih nomor run: nomor run global
      // dan naik karena situs lain juga dipindai, jadi selisihnya tidak
      // mengatakan apa pun tentang berapa kali kategori INI dianalisis.
      const hilang = db
        .prepare(
          `UPDATE findings SET status = 'fixed'
           WHERE site_id = ? AND category = ? AND status = 'open'
             AND (SELECT COUNT(*) FROM runs
                  WHERE runs.site_id = findings.site_id
                    AND runs.type = ?
                    AND runs.id > findings.last_seen_run
                    AND runs.id <= ?) >= ?
           RETURNING id`,
        )
        .all(siteId, category, category, runId, AMBANG_HILANG) as { id: number }[]
      result.fixed = hilang.length
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
