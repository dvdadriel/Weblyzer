import type { Severity } from '../findings.ts'

export type TemuanRingkas = {
  category: string
  severity: Severity
  rule: string
  title: string
  url: string | null
}

export type BahanPrompt = {
  nama: string
  baseUrl: string
  temuan: TemuanRingkas[]
}

const URUTAN: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

/**
 * Banyaknya temuan yang dikutip utuh. Springair menghasilkan 34 temuan
 * terbuka; situs yang lebih besar bisa ratusan. Mengirim semuanya membuat
 * prompt yang mahal dan jawaban yang mengambang, sedangkan yang dibutuhkan
 * pembaca dashboard pagi hari adalah yang paling parah.
 *
 * Yang tidak dikutip tidak disembunyikan: jumlahnya tetap disebut, jadi
 * ringkasannya tidak pernah mengaku telah melihat semuanya.
 */
const BATAS_KUTIP = 25

/** Satu URL bisa sepanjang 200 karakter dengan query. Dipotong di sini. */
const BATAS_URL = 120

function hitungSeverity(temuan: TemuanRingkas[]): Map<Severity, number> {
  const n = new Map<Severity, number>()
  for (const t of temuan) n.set(t.severity, (n.get(t.severity) ?? 0) + 1)
  return n
}

function jalur(url: string | null, baseUrl: string): string {
  if (url === null) return '(seluruh situs)'
  const j = url.startsWith(baseUrl) ? url.slice(baseUrl.length) || '/' : url
  return j.length > BATAS_URL ? `${j.slice(0, BATAS_URL)}…` : j
}

/**
 * Menyusun prompt ringkasan dari temuan satu situs.
 *
 * Instruksinya menuntut ringkasan, bukan daftar ulang: datanya sudah ada di
 * tabel di sebelahnya, dan mengulangnya dalam bentuk prosa hanya menambah
 * panjang tanpa menambah arti. Yang tidak bisa dilakukan tabel adalah
 * mengelompokkan sebab yang sama dan menyebutkan mana yang harus dikerjakan
 * lebih dulu.
 *
 * Model juga dilarang mengarang: temuan yang tidak ada di daftar tidak boleh
 * disebut. Ringkasan yang menambahkan masalah imajiner lebih buruk daripada
 * tidak ada ringkasan — pemakainya akan mencari sesuatu yang tidak ada.
 */
export function susunPrompt({ nama, baseUrl, temuan }: BahanPrompt): string {
  if (temuan.length === 0) {
    return [
      `Situs "${nama}" (${baseUrl}) baru dipindai dan tidak ada satu pun temuan terbuka.`,
      '',
      'Tulis satu kalimat bahasa Indonesia yang menyatakan situs ini bersih pada',
      'pemindaian terakhir. Jangan menambahkan saran, jangan mengarang temuan,',
      'jangan memakai heading atau daftar.',
    ].join('\n')
  }

  const hitung = hitungSeverity(temuan)
  const rekap = URUTAN.filter((s) => hitung.has(s))
    .map((s) => `${hitung.get(s)} ${s}`)
    .join(', ')

  // Diurutkan paling parah dulu supaya yang terpotong oleh BATAS_KUTIP selalu
  // yang paling ringan, bukan yang kebetulan berada di akhir tabel.
  const urut = [...temuan].sort(
    (a, b) => URUTAN.indexOf(a.severity) - URUTAN.indexOf(b.severity),
  )
  const dikutip = urut.slice(0, BATAS_KUTIP)

  const baris = dikutip.map(
    (t) => `- [${t.severity}] ${t.category}/${t.rule} — ${t.title} (${jalur(t.url, baseUrl)})`,
  )

  const sisa = temuan.length - dikutip.length

  return [
    `Situs "${nama}" (${baseUrl}) punya ${temuan.length} temuan terbuka: ${rekap}.`,
    '',
    sisa > 0
      ? `Berikut ${dikutip.length} temuan paling parah (${sisa} temuan lain tidak dikutip):`
      : 'Berikut seluruh temuannya:',
    ...baris,
    '',
    'Tulis ringkasan bahasa Indonesia, maksimal tiga paragraf pendek, untuk',
    'pemilik situs yang akan memperbaikinya sendiri. Kerjakan tiga hal:',
    '1. Sebutkan pola — temuan mana yang kemungkinan berasal dari satu sebab yang sama.',
    '2. Sebutkan mana yang harus dikerjakan lebih dulu, dan alasannya.',
    '3. Sebutkan yang bisa ditunda, bila ada.',
    '',
    'Aturan keras:',
    '- Jangan menyebut temuan yang tidak ada di daftar di atas. Jangan mengarang URL.',
    sisa > 0
      ? `- Daftar di atas tidak lengkap (${sisa} tidak dikutip), jadi jangan mengaku sudah melihat semuanya.`
      : '- Daftar di atas lengkap.',
    '- Jangan mengulang daftar itu apa adanya; tabelnya sudah ada di layar sebelah.',
    '- Tanpa heading, tanpa basa-basi pembuka, tanpa menawarkan bantuan lanjutan.',
  ].join('\n')
}
