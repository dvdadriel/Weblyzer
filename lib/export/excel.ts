import type { DatabaseSync } from 'node:sqlite'
import { kelompokkan, type TemuanRingkas } from '../ai/prompt.ts'
import { barisPrompt } from './prompt-perbaikan.ts'
import { KATEGORI, namaKategori, sumberKategori } from '../kategori.ts'

/**
 * Menyusun isi berkas Excel untuk satu situs.
 *
 * Dipisah dari penulisan berkasnya supaya bisa diuji tanpa menghasilkan zip:
 * yang perlu dijamin adalah kolom, urutan, dan kelengkapan barisnya — dan itu
 * data biasa. Menguji lewat berkas berarti membongkar XML di dalam zip untuk
 * memeriksa hal yang sudah bisa diperiksa di sini.
 */

/** Nama sheet yang dibaca manusia, bukan nama kategori internal. */

/** Urutan keparahan untuk ORDER BY — sama dengan urutan kerja di UI. */
const URUTAN = `CASE f.severity
  WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
  WHEN 'low' THEN 3 ELSE 4 END`

/**
 * Satu sel. `null` adalah sel utuh, bukan `{ value: null }` — pustakanya
 * menerima null sebagai Cell tapi tidak sebagai nilai di dalam CellObject,
 * dan itu justru pas: skor yang tidak terukur memang bukan nilai.
 */
export type Sel = {
  value: string | number
  fontWeight?: 'bold'
  /** Membungkus teks panjang. Dipakai kolom Prompt, yang isinya paragraf
   *  berbaris-baris — tanpa ini Excel menampilkannya sebagai satu garis
   *  panjang dan isinya cuma terbaca lewat formula bar. */
  wrap?: boolean
  alignVertical?: 'top'
} | null
export type Sheet = {
  /** Nama tab di Excel. Propertinya `sheet` di pustakanya, BUKAN `name` —
   *  versi pertama memakai `name` dan lolos compiler karena `.map()`
   *  mematikan pemeriksaan properti berlebih, lalu menghasilkan berkas
   *  berisi Sheet1..Sheet7. */
  sheet: string
  data: Sel[][]
  /** Lebar kolom, supaya URL dan judul tidak terpotong saat dibuka. */
  columns?: { width: number }[]
}

const KOLOM_TEMUAN = [
  'Severity',
  'Aturan',
  'Halaman',
  'Judul',
  'Status',
  'Pertama terlihat (run)',
  'Terakhir terlihat (run)',
  'Detail',
]

const KOLOM_SKOR = ['Halaman', 'Strategy', 'Performance', 'Accessibility', 'Best practices', 'SEO']

function judul(kolom: string[]): Sel[] {
  return kolom.map((value) => ({ value, fontWeight: 'bold' as const }))
}

/**
 * Semua temuan diekspor, termasuk yang `fixed` dan `ignored`.
 *
 * Berkas ini dipakai untuk melapor dan menelusuri, dan pertanyaan "apa yang
 * sudah kami perbaiki bulan ini" tidak bisa dijawab oleh berkas yang cuma
 * memuat yang masih terbuka. Kolom Status yang membedakannya.
 */
function sheetTemuan(db: DatabaseSync, siteId: number, category: string): Sheet {
  const baris = db
    .prepare(
      `SELECT f.severity, f.rule, p.url AS url, f.title, f.status,
              f.first_seen_run, f.last_seen_run, f.detail_json
       FROM findings f LEFT JOIN pages p ON p.id = f.page_id
       WHERE f.site_id = ? AND f.category = ?
       ORDER BY f.status = 'open' DESC, ${URUTAN}, f.rule, p.url`,
    )
    .all(siteId, category) as unknown as {
    severity: string
    rule: string
    url: string | null
    title: string
    status: string
    first_seen_run: number
    last_seen_run: number
    detail_json: string
  }[]

  return {
    sheet: namaKategori(category),
    // Lebar mengikuti isi: URL dan judul adalah kolom yang panjang, sedangkan
    // severity dan nomor run selalu pendek.
    columns: [
      { width: 10 },
      { width: 22 },
      { width: 52 },
      { width: 60 },
      { width: 10 },
      { width: 12 },
      { width: 12 },
      { width: 40 },
    ],
    data: [
      judul(KOLOM_TEMUAN),
      ...baris.map((b): Sel[] => [
        { value: b.severity },
        { value: b.rule },
        // Temuan tingkat situs tidak punya halaman, dan sel kosong akan
        // terbaca sebagai data yang hilang. Disebut apa adanya.
        { value: b.url ?? '(seluruh situs)' },
        { value: b.title },
        { value: b.status },
        { value: b.first_seen_run },
        { value: b.last_seen_run },
        { value: b.detail_json },
      ]),
    ],
  }
}

const KOLOM_PROMPT = [
  'Severity',
  'Kategori',
  'Sumber',
  'Aturan',
  'Masalah',
  'Halaman',
  'Prompt',
]

/**
 * Sheet prompt perbaikan: satu baris siap tempel per masalah.
 *
 * Hanya temuan `open`. Yang `ignored` sudah diputuskan untuk tidak dikerjakan
 * dan yang `fixed` sudah dikerjakan — memberi prompt untuk keduanya berarti
 * mengirim orang memperbaiki hal yang tidak perlu diperbaiki. Ini kebalikan
 * dari sheet temuan, yang justru memuat ketiganya karena tugasnya melapor,
 * bukan menyuruh.
 *
 * Dikelompokkan dengan `kelompokkan` yang sama seperti prompt ringkasan AI,
 * bukan satu baris per temuan. 216 temuan Comforta jadi belasan tugas, dan
 * enam HTTP 500 dari satu controller rusak jadi satu tugas — bukan enam
 * salinan prompt yang sama yang harus dikerjakan enam kali.
 */
function sheetPrompt(db: DatabaseSync, siteId: number): Sheet {
  const s = db
    .prepare('SELECT name, base_url FROM sites WHERE id = ?')
    .get(siteId) as { name: string; base_url: string } | undefined

  const temuan = db
    .prepare(
      `SELECT f.category, f.severity, f.rule, f.title, p.url AS url
       FROM findings f LEFT JOIN pages p ON p.id = f.page_id
       WHERE f.site_id = ? AND f.status = 'open'
       ORDER BY ${URUTAN}, f.rule, p.url`,
    )
    .all(siteId) as unknown as TemuanRingkas[]

  const baseUrl = s?.base_url ?? ''
  const baris = barisPrompt(kelompokkan(temuan, baseUrl), {
    nama: s?.name ?? '(tidak diketahui)',
    baseUrl,
  })

  return {
    sheet: 'Prompt Perbaikan',
    columns: [
      { width: 10 },
      { width: 12 },
      { width: 12 },
      { width: 24 },
      { width: 56 },
      { width: 10 },
      { width: 110 },
    ],
    data: [
      judul(KOLOM_PROMPT),
      // Sheet tanpa satu pun masalah terbuka tidak dibiarkan cuma berisi
      // header: header sendirian terbaca seperti data yang gagal dimuat.
      ...(baris.length === 0
        ? [
            [
              { value: 'Tidak ada temuan terbuka. Tidak ada yang perlu diperbaiki.' },
            ] as Sel[],
          ]
        : baris.map((b): Sel[] => [
            { value: b.severity },
            { value: b.kategori },
            // Di sheet INI sumbernya per baris, karena di sini kategori memang
            // bercampur dalam satu tabel — dan prompt untuk temuan claude-seo
            // layak dibaca dengan kewaspadaan yang berbeda.
            { value: sumberKategori(b.kategori) },
            { value: b.rule },
            { value: b.masalah },
            { value: b.jumlah },
            { value: b.prompt, wrap: true, alignVertical: 'top' },
          ])),
    ],
  }
}

function sheetSkor(db: DatabaseSync, siteId: number): Sheet {
  const baris = db
    .prepare(
      `SELECT p.url, l.strategy, l.perf, l.a11y, l.best_practices, l.seo
       FROM lighthouse l JOIN pages p ON p.id = l.page_id
       WHERE p.site_id = ?
         AND l.id = (SELECT MAX(l2.id) FROM lighthouse l2
                     WHERE l2.page_id = l.page_id AND l2.strategy = l.strategy)
       ORDER BY l.strategy, p.url`,
    )
    .all(siteId) as unknown as {
    url: string
    strategy: string
    perf: number | null
    a11y: number | null
    best_practices: number | null
    seo: number | null
  }[]

  return {
    sheet: 'Skor Lighthouse',
    columns: [{ width: 60 }, { width: 10 }, ...Array.from({ length: 4 }, () => ({ width: 14 }))],
    data: [
      judul(KOLOM_SKOR),
      ...baris.map((b): Sel[] => [
        { value: b.url },
        { value: b.strategy },
        // Sel dibiarkan KOSONG, tidak diisi 0: pengukuran yang tidak terjadi
        // bukan pengukuran bernilai nol, dan nol di kolom skor akan ikut
        // terhitung dalam rata-rata siapa pun yang membuka berkas ini.
        b.perf === null ? null : { value: b.perf },
        b.a11y === null ? null : { value: b.a11y },
        b.best_practices === null ? null : { value: b.best_practices },
        b.seo === null ? null : { value: b.seo },
      ]),
    ],
  }
}

/**
 * Sheet pertama: apa isi berkas ini dan sesegar apa.
 *
 * Bukan hiasan. Begitu berkas ini lepas dari aplikasi, tidak ada apa pun yang
 * bisa dipakai menilai kesegarannya — dan angka temuan tanpa tanggal adalah
 * angka yang bisa dipakai membela keadaan tiga bulan lalu. Karena itu waktu
 * pemindaian per kategori ikut, bukan hanya waktu ekspor.
 */
function sheetRingkasan(db: DatabaseSync, siteId: number, waktuEkspor: string): Sheet {
  const s = db
    .prepare('SELECT name, base_url FROM sites WHERE id = ?')
    .get(siteId) as { name: string; base_url: string } | undefined

  const data: Sel[][] = [
    judul(['Keterangan', 'Nilai']),
    [{ value: 'Situs' }, { value: s?.name ?? '(tidak diketahui)' }],
    [{ value: 'Alamat' }, { value: s?.base_url ?? '' }],
    [{ value: 'Berkas dibuat' }, { value: waktuEkspor }],
    [{ value: '' }, { value: '' }],
    judul(['Kategori', 'Sumber', 'Terbuka / Diabaikan / Beres', 'Terakhir dipindai']),
  ]

  for (const k of KATEGORI) {
    const h = db
      .prepare(
        `SELECT
           SUM(status = 'open') AS terbuka,
           SUM(status = 'ignored') AS diabaikan,
           SUM(status = 'fixed') AS beres
         FROM findings WHERE site_id = ? AND category = ?`,
      )
      .get(siteId, k) as { terbuka: number | null; diabaikan: number | null; beres: number | null }

    // `full` hanya berlaku untuk kategori yang memang disentuh `scan` tanpa
    // argumen. `geo` dan `audit` adalah subcommand tersendiri, jadi memasukkan
    // `full` di sana akan menuliskan tanggal dari crawl yang tidak pernah
    // memanggil claude-seo — kesegaran yang berbohong, tepat di sheet yang ada
    // justru untuk menjamin kesegaran.
    const waktu = db
      .prepare(
        sumberKategori(k) === 'claude-seo'
          ? `SELECT strftime('%Y-%m-%d %H:%M', finished_at, 'localtime') AS w FROM runs
             WHERE site_id = ? AND type = ? AND status = 'done' AND finished_at IS NOT NULL
             ORDER BY id DESC LIMIT 1`
          : `SELECT strftime('%Y-%m-%d %H:%M', finished_at, 'localtime') AS w FROM runs
             WHERE site_id = ? AND type IN (?, 'full') AND status = 'done' AND finished_at IS NOT NULL
             ORDER BY id DESC LIMIT 1`,
      )
      .get(siteId, k) as { w: string } | undefined

    data.push([
      { value: namaKategori(k) },
      // Sumber di sini, bukan per baris temuan: di sheet temuan setiap baris
      // nilainya sama dan namanya sudah ada di nama sheet-nya. Di sini ia
      // membedakan tujuh kategori yang berdampingan dalam satu tabel.
      { value: sumberKategori(k) },
      { value: `${Number(h.terbuka ?? 0)} / ${Number(h.diabaikan ?? 0)} / ${Number(h.beres ?? 0)}` },
      // "Belum pernah" dan tanggal kosong bukan hal yang sama, dan sel kosong
      // di Excel tidak bisa membedakannya.
      { value: waktu?.w ?? 'belum pernah' },
    ])
  }

  return {
    sheet: 'Ringkasan',
    columns: [{ width: 28 }, { width: 12 }, { width: 30 }, { width: 20 }],
    data,
  }
}

/**
 * Sheet yang siap ditulis. Kategori tanpa satu pun temuan tetap dibuatkan
 * sheet-nya: sheet kosong berarti "diperiksa, tidak ada apa-apa", sedangkan
 * sheet yang tidak ada berarti "tidak diketahui". Keduanya berbeda, dan itu
 * pembedaan yang sama yang dijaga di seluruh aplikasi ini.
 */
export function susunSheet(db: DatabaseSync, siteId: number, waktuEkspor: string): Sheet[] {
  return [
    sheetRingkasan(db, siteId, waktuEkspor),
    // Sheet kedua, bukan terakhir. Ringkasan menjawab "seberapa buruk", dan
    // pertanyaan berikutnya selalu "lalu saya kerjakan apa" — sheet temuan
    // adalah rujukan, bukan tempat memulai. Diletakkan di ujung, ia tidak
    // pernah ditemukan.
    sheetPrompt(db, siteId),
    ...KATEGORI.map((k) => sheetTemuan(db, siteId, k)),
    sheetSkor(db, siteId),
  ]
}

/** Nama berkas yang aman untuk header HTTP dan untuk sistem berkas. */
export function namaBerkas(nama: string, tanggal: string): string {
  const bersih = nama
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
  return `weblyzer-${bersih || 'situs'}-${tanggal}.xlsx`
}
