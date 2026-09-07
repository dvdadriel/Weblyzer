import type { DatabaseSync } from 'node:sqlite'
import type { Severity } from '../findings.ts'

/**
 * Tiga keadaan yang mudah tertukar dan wajib dibedakan di setiap layar berdata.
 * `bersih` dan `gagal` sama-sama menghasilkan nol temuan, tetapi artinya
 * berlawanan: yang satu berarti tidak ada yang rusak, yang lain berarti kita
 * tidak tahu. Menyamakannya adalah bug yang sudah tiga kali muncul di lapisan
 * data proyek ini.
 */
export type Keadaan = 'belum-dipindai' | 'bersih' | 'gagal' | 'ada-temuan'

export type RingkasanSitus = {
  id: number
  nama: string
  base_url: string
  keadaan: Keadaan
  totalTerbuka: number
  terbuka: Record<Severity, number>
  terakhirDipindai: string | null
  pesanGagal: string | null
}

export type BarisTemuan = {
  id: number
  category: string
  severity: Severity
  rule: string
  title: string
  detail_json: string
  status: string
  url: string | null
  first_seen_run: number
  last_seen_run: number
}

const NOL: Record<Severity, number> = {
  critical: 0, high: 0, medium: 0, low: 0, info: 0,
}

function runTerakhir(db: DatabaseSync, siteId: number) {
  return db
    .prepare(
      // `finished_at` disimpan UTC, jadi dikonversi ke jam pemakai di sini —
      // sama seperti `runAktif`. Tanpa ini kartu menulis "dipindai 06:34"
      // sementara baris "sedang berjalan" di halaman sebelahnya menulis 13:34
      // untuk pemindaian yang sama.
      //
      // Detik dibuang: pertanyaannya "kapan terakhir dipindai", dan presisi
      // detik cuma menambah dua angka yang tidak pernah dipakai.
      `SELECT status, error,
              strftime('%Y-%m-%d %H:%M', finished_at, 'localtime') AS finished_at
       FROM runs
       WHERE site_id = ? AND finished_at IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .get(siteId) as { status: string; error: string | null; finished_at: string } | undefined
}

export function ringkasanSitus(db: DatabaseSync): RingkasanSitus[] {
  const situs = db
    .prepare('SELECT id, name, base_url FROM sites ORDER BY id')
    .all() as { id: number; name: string; base_url: string }[]

  return situs.map((s) => {
    const hitungan = db
      .prepare(
        `SELECT severity, COUNT(*) AS n FROM findings
         WHERE site_id = ? AND status = 'open' GROUP BY severity`,
      )
      .all(s.id) as { severity: Severity; n: number }[]

    const terbuka = { ...NOL }
    for (const h of hitungan) terbuka[h.severity] = Number(h.n)
    const totalTerbuka = Object.values(terbuka).reduce((a, b) => a + b, 0)

    const run = runTerakhir(db, s.id)
    let keadaan: Keadaan
    if (run === undefined) keadaan = 'belum-dipindai'
    else if (run.status === 'failed') keadaan = 'gagal'
    else if (totalTerbuka > 0) keadaan = 'ada-temuan'
    else keadaan = 'bersih'

    return {
      id: s.id,
      nama: s.name,
      base_url: s.base_url,
      keadaan,
      totalTerbuka,
      terbuka,
      terakhirDipindai: run?.finished_at ?? null,
      pesanGagal: run?.status === 'failed' ? (run.error ?? 'Pemindaian gagal') : null,
    }
  }).sort(bandingkan)
}

/**
 * Urutan daftar situs: yang butuh perhatian dulu.
 *
 * Pertanyaan yang dijawab layar ini setiap pagi adalah "apa yang rusak
 * semalam?", jadi mengurutkan menurut `id` membuat situs bersih bisa duduk di
 * atas situs dengan delapan temuan critical. Dengan dua belas situs, itu
 * berarti memindai daftar untuk menemukan yang penting — melawan tujuan
 * layarnya.
 *
 * `gagal` di paling atas, di atas `ada-temuan`: pemindaian yang gagal membuat
 * seluruh angka situs itu tidak bisa dipercaya, bukan cuma menambah satu
 * masalah. Kita tidak tahu keadaannya, dan itu lebih mendesak daripada
 * masalah yang sudah diketahui.
 */
const PERINGKAT: Record<Keadaan, number> = {
  gagal: 0,
  'ada-temuan': 1,
  'belum-dipindai': 2,
  bersih: 3,
}

function bandingkan(a: RingkasanSitus, b: RingkasanSitus): number {
  const k = PERINGKAT[a.keadaan] - PERINGKAT[b.keadaan]
  if (k !== 0) return k
  // Dalam kelompok yang sama, yang paling parah dulu.
  for (const s of ['critical', 'high', 'medium', 'low'] as const) {
    const d = b.terbuka[s] - a.terbuka[s]
    if (d !== 0) return d
  }
  return a.nama.localeCompare(b.nama)
}

/** Urutan severity untuk ORDER BY. Paling parah dulu — itu urutan kerja. */
const URUTAN = `CASE f.severity
  WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
  WHEN 'low' THEN 3 ELSE 4 END`

/**
 * `node:sqlite` mengembalikan objek berprototipe null, dan React menolak
 * meneruskannya ke client component ("Only plain objects can be passed").
 * Disalin di sini, di sumbernya, supaya setiap pemakai mendapat objek biasa —
 * bukan di tiap halaman yang kebetulan menemuinya lebih dulu.
 */
function polos<T extends object>(baris: T[]): T[] {
  return baris.map((b) => ({ ...b }))
}

export function temuanKategori(
  db: DatabaseSync,
  siteId: number,
  category: string,
  status: 'open' | 'ignored' | 'fixed' = 'open',
): BarisTemuan[] {
  return polos(db
    .prepare(
      `SELECT f.id, f.category, f.severity, f.rule, f.title, f.detail_json, f.status,
              p.url AS url, f.first_seen_run, f.last_seen_run
       FROM findings f
       LEFT JOIN pages p ON p.id = f.page_id
       WHERE f.site_id = ? AND f.category = ? AND f.status = ?
       ORDER BY ${URUTAN}, f.rule, p.url`,
    )
    .all(siteId, category, status) as unknown as BarisTemuan[])
}

export function keadaanKategori(db: DatabaseSync, siteId: number, category: string): Keadaan {
  const run = runTerakhir(db, siteId)
  if (run === undefined) return 'belum-dipindai'
  if (run.status === 'failed') return 'gagal'

  const n = db
    .prepare(
      `SELECT COUNT(*) AS n FROM findings
       WHERE site_id = ? AND category = ? AND status = 'open'`,
    )
    .get(siteId, category) as { n: number }
  return Number(n.n) > 0 ? 'ada-temuan' : 'bersih'
}

export function skorSitus(db: DatabaseSync, siteId: number) {
  return db
    .prepare(
      `SELECT p.url, l.strategy, l.perf, l.a11y, l.best_practices, l.seo
       FROM lighthouse l JOIN pages p ON p.id = l.page_id
       WHERE p.site_id = ?
         AND l.id = (SELECT MAX(l2.id) FROM lighthouse l2
                     WHERE l2.page_id = l.page_id AND l2.strategy = l.strategy)
       ORDER BY p.url, l.strategy`,
    )
    .all(siteId) as unknown as {
    url: string
    strategy: string
    perf: number | null
    a11y: number | null
    best_practices: number | null
    seo: number | null
  }[]
}

export function situs(db: DatabaseSync, siteId: number) {
  return db
    .prepare('SELECT id, name, base_url FROM sites WHERE id = ?')
    .get(siteId) as { id: number; name: string; base_url: string } | undefined
}

/**
 * Run yang masih berjalan untuk sebuah situs, apa pun tipenya.
 *
 * Sengaja tidak menyaring per tipe: satu crawl memakai satu Chromium, jadi
 * tombol di tab mana pun harus mati selama ada scan berjalan. Kalau disaring
 * per kategori, menekan "bugs" lalu "security" menjalankan dua browser yang
 * berebut dan salah satunya kalah tanpa jejak.
 *
 * ponytail: run yang lebih tua dari AMBANG_MACET dianggap mati. Proses pekerja
 * yang di-kill -9 tidak pernah sempat menulis status akhirnya, dan tanpa batas
 * ini tombolnya mati selamanya. Naik kelasnya: simpan PID pekerja di tabel
 * `runs` lalu `process.kill(pid, 0)` — pasti, tapi butuh migrasi kolom.
 */
const AMBANG_MACET = '-30 minutes'

export function runAktif(db: DatabaseSync, siteId: number) {
  // Disalin jadi objek biasa di sini, sama seperti `polos` untuk baris tabel.
  // Hasilnya diteruskan ke client component, dan baris `node:sqlite` yang
  // berprototipe null membuat React melempar. Terbukti mahal: tanpa ini
  // halamannya 200 selama tidak ada pemindaian dan 500 tepat ketika ada —
  // jadi jalur yang rusak justru yang paling jarang diuji.
  const baris = db
    .prepare(
      // `mulai` dihitung SQLite, bukan JS: nilai di kolomnya UTC, sedangkan
      // yang ditanya pemakai adalah "sejak kapan" menurut jamnya sendiri.
      // Dikerjakan di server juga menghindari selisih hidrasi — jam server dan
      // jam browser tidak wajib sama.
      `SELECT id, strftime('%H:%M', started_at, 'localtime') AS mulai FROM runs
       WHERE site_id = ?
         AND status IN ('queued', 'running')
         AND started_at > datetime('now', ?)
       ORDER BY id DESC LIMIT 1`,
    )
    .get(siteId, AMBANG_MACET) as { id: number; mulai: string } | undefined
  return baris ? { ...baris } : undefined
}
