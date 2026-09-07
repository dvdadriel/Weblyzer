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
 * Banyaknya KELOMPOK masalah yang dikutip, bukan banyaknya temuan.
 *
 * Versi pertama mengutip 25 temuan terparah satu per satu, dan itu membuang
 * data yang justru penting: 34 temuan Springair menyisakan 9 yang tak pernah
 * dilihat model, padahal 22 di antaranya cuma tujuh audit Lighthouse yang
 * sama berulang di enam halaman. Dikelompokkan, situs yang sama jadi sebelas
 * baris — seluruh temuan terwakili dengan sisa anggaran yang lega.
 *
 * Batas ini tetap ada sebagai jaring untuk situs yang punya ratusan masalah
 * yang benar-benar berbeda, dan yang terpotong selalu disebut jumlahnya.
 */
const BATAS_KELOMPOK = 40

/** Contoh URL per kelompok. Enam sudah cukup memperlihatkan polanya; sisanya
 *  diwakili angka. Semua URL untuk satu masalah bukan informasi, itu daftar. */
const BATAS_CONTOH = 6

/** Satu URL bisa sepanjang 200 karakter dengan query. Dipotong di sini. */
const BATAS_URL = 120

export type Kelompok = {
  category: string
  rule: string
  severity: Severity
  judul: string
  jumlah: number
  contoh: string[]
}

/**
 * Kata sambung dan tanda baca yang tertinggal menggantung setelah URL-nya
 * dibuang. Terikat pada bentuk judul yang analyzer kita sendiri hasilkan
 * (`HTTP 500 pada <url>`, `Permintaan gagal (...): <url>`), dan itu wajar:
 * judulnya kita yang menulis. Kalau kelak ada analyzer dengan bentuk lain,
 * yang terjadi cuma judul kelompok berakhir dengan satu kata menggantung —
 * bukan pengelompokan yang salah.
 */
const EKOR = /[\s:.,\-–—]*\b(pada|di|untuk|dari|on|at|for|in)?[\s:.,\-–—]*$/i

/**
 * Membuang URL absolut dari judul.
 *
 * Tanpa ini `HTTP 500 pada https://.../divan` dan `HTTP 500 pada
 * https://.../headboard` terhitung dua masalah berbeda, padahal satu — dan
 * situs dengan 200 halaman rusak akan menghasilkan 200 kelompok, mengalahkan
 * seluruh tujuan pengelompokan. URL-nya tidak hilang: ia pindah ke `contoh`,
 * tempat yang memang untuknya.
 */
function judulTanpaUrl(judul: string): string {
  return judul
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EKOR, '')
    .trim()
}

function jalur(url: string | null, baseUrl: string): string {
  if (url === null) return '(seluruh situs)'
  const j = url.startsWith(baseUrl) ? url.slice(baseUrl.length) || '/' : url
  return j.length > BATAS_URL ? `${j.slice(0, BATAS_URL)}…` : j
}

/**
 * Menggabungkan temuan yang sebenarnya satu masalah.
 *
 * Kuncinya kategori + aturan + judul-tanpa-URL. Severity ikut disimpan tapi
 * TIDAK masuk kunci: satu aturan yang sama pada severity berbeda tetap satu
 * masalah, dan memecahnya akan memisahkan hal yang perbaikannya sama.
 *
 * Diekspor karena diuji tersendiri — di sinilah klaim "seluruh temuan
 * terwakili" berdiri atau jatuh.
 */
export function kelompokkan(temuan: TemuanRingkas[], baseUrl: string): Kelompok[] {
  const peta = new Map<string, Kelompok>()

  for (const t of temuan) {
    const judul = judulTanpaUrl(t.title)
    const kunci = `${t.category}\n${t.rule}\n${judul}`
    const ada = peta.get(kunci)

    if (ada === undefined) {
      peta.set(kunci, {
        category: t.category,
        rule: t.rule,
        severity: t.severity,
        judul,
        jumlah: 1,
        contoh: [jalur(t.url, baseUrl)],
      })
      continue
    }

    ada.jumlah += 1
    // Severity paling parah yang menang, supaya urutan kelompok mencerminkan
    // hal terburuk di dalamnya — bukan yang kebetulan ditemui pertama.
    if (URUTAN.indexOf(t.severity) < URUTAN.indexOf(ada.severity)) ada.severity = t.severity
    const j = jalur(t.url, baseUrl)
    if (ada.contoh.length < BATAS_CONTOH && !ada.contoh.includes(j)) ada.contoh.push(j)
  }

  // Paling parah dulu, lalu yang paling banyak halaman terdampak. Kalau
  // BATAS_KELOMPOK memotong, yang hilang selalu yang paling ringan.
  return [...peta.values()].sort(
    (a, b) =>
      URUTAN.indexOf(a.severity) - URUTAN.indexOf(b.severity) || b.jumlah - a.jumlah,
  )
}

function hitungSeverity(temuan: TemuanRingkas[]): Map<Severity, number> {
  const n = new Map<Severity, number>()
  for (const t of temuan) n.set(t.severity, (n.get(t.severity) ?? 0) + 1)
  return n
}

function barisKelompok(k: Kelompok): string {
  const halaman =
    k.jumlah === 1
      ? k.contoh[0]
      : `${k.jumlah} halaman: ${k.contoh.join(', ')}${
          k.jumlah > k.contoh.length ? `, +${k.jumlah - k.contoh.length} lagi` : ''
        }`
  return `- [${k.severity}] ${k.category}/${k.rule} — ${k.judul} (${halaman})`
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

  const semua = kelompokkan(temuan, baseUrl)
  const dikutip = semua.slice(0, BATAS_KELOMPOK)
  const sisaKelompok = semua.length - dikutip.length
  const sisaTemuan = dikutip.reduce((n, k) => n - k.jumlah, temuan.length)

  return [
    `Situs "${nama}" (${baseUrl}) punya ${temuan.length} temuan terbuka: ${rekap}.`,
    '',
    // Pengelompokannya dijelaskan, bukan dibiarkan ditebak. Tanpa kalimat ini
    // model bisa membaca "22 halaman" sebagai satu temuan dan menyimpulkan
    // situsnya jauh lebih sehat daripada kenyataannya.
    `Temuan yang identik digabung menjadi satu baris beserta jumlah halaman terdampak.`,
    sisaKelompok > 0
      ? `Berikut ${dikutip.length} masalah paling parah dari ${semua.length} masalah berbeda (${sisaTemuan} temuan tidak terwakili):`
      : `${temuan.length} temuan itu berasal dari ${semua.length} masalah berbeda, dan semuanya ada di bawah ini:`,
    ...dikutip.map(barisKelompok),
    '',
    'Tulis ringkasan bahasa Indonesia, maksimal tiga paragraf pendek, untuk',
    'pemilik situs yang akan memperbaikinya sendiri. Kerjakan tiga hal:',
    '1. Sebutkan pola — masalah mana yang kemungkinan berasal dari satu sebab yang sama.',
    '2. Sebutkan mana yang harus dikerjakan lebih dulu, dan alasannya.',
    '3. Sebutkan yang bisa ditunda, bila ada.',
    '',
    'Aturan keras:',
    '- Jangan menyebut temuan yang tidak ada di daftar di atas. Jangan mengarang URL.',
    sisaKelompok > 0
      ? `- Daftar di atas tidak lengkap (${sisaKelompok} masalah tidak dikutip), jadi jangan mengaku sudah melihat semuanya.`
      : '- Daftar di atas mencakup seluruh temuan situs ini.',
    '- Jangan mengulang daftar itu apa adanya; tabelnya sudah ada di layar sebelah.',
    '- Tanpa heading, tanpa basa-basi pembuka, tanpa menawarkan bantuan lanjutan.',
  ].join('\n')
}
