import { id } from './id.ts'
import { en } from './en.ts'

export const LOCALE = ['id', 'en'] as const
export type Locale = (typeof LOCALE)[number]

export const NAMA_COOKIE_LOCALE = 'weblyzer_locale'

export type Kunci = keyof typeof id

const KAMUS: Record<Locale, Record<Kunci, string>> = { id, en }

export function localeSah(nilai: string | undefined): Locale {
  return LOCALE.includes(nilai as Locale) ? (nilai as Locale) : 'id'
}

/**
 * Menerjemahkan satu kunci, dengan penggantian `{nama}` opsional.
 *
 * Bukan `next-intl`, dan itu keputusan: `next-intl` berarti middleware,
 * routing `/[locale]/`, dan setiap URL yang sudah bisa di-bookmark berubah
 * bentuk. Untuk dua bahasa pada alat internal tanpa kebutuhan SEO, harganya
 * lebih besar daripada masalahnya.
 *
 * Kunci yang tidak ada mustahil lolos ke sini — tipe `Kunci` diturunkan dari
 * `id.ts`, jadi salah tulis adalah galat kompilasi. `?? kunci` di bawah hanya
 * untuk kasus di mana kamus dibaca dari data runtime.
 *
 * Placeholder yang tidak diberi nilai DIBIARKAN apa adanya, bukan dihapus:
 * `{n}` yang muncul di layar adalah bug yang terlihat dan langsung dilaporkan,
 * sedangkan teks yang mendadak kehilangan angkanya terbaca seperti kalimat yang
 * memang begitu.
 */
export function terjemah(
  locale: Locale,
  kunci: Kunci,
  params?: Record<string, string | number>,
): string {
  let teks = KAMUS[locale][kunci] ?? kunci
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      teks = teks.replaceAll(`{${k}}`, String(v))
    }
  }
  return teks
}

/**
 * Penerjemah yang sudah terikat ke satu locale.
 *
 * Dipakai sebagai `const t = penerjemah(locale)` lalu `t('dash.judul')`, supaya
 * locale-nya tidak diulang di setiap pemanggilan — dan supaya komponen klien
 * bisa menerima satu fungsi alih-alih seluruh kamus.
 */
export type T = (kunci: Kunci, params?: Record<string, string | number>) => string

export function penerjemah(locale: Locale): T {
  return (kunci, params) => terjemah(locale, kunci, params)
}
