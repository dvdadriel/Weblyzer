import { cookies } from 'next/headers'
import { localeSah, penerjemah, NAMA_COOKIE_LOCALE, type Locale, type T } from './index.ts'

/**
 * Locale untuk request yang sedang berjalan.
 *
 * Cookie, dan hanya cookie. Dulu ia juga membaca `users.locale`, dan itu
 * hilang bersama akunnya — tanpa akun, cookie adalah satu-satunya tempat
 * pilihan ini bisa hidup.
 */
export async function localeSekarang(): Promise<Locale> {
  return localeSah((await cookies()).get(NAMA_COOKIE_LOCALE)?.value)
}

/**
 * Penerjemah untuk Server Component dan Server Action.
 *
 * Ada supaya enam halaman tidak masing-masing mengulang pembacaan locale yang
 * sama. Boilerplate yang diulang adalah boilerplate yang cepat atau lambat
 * menyimpang.
 */
export async function tServer(): Promise<T> {
  return penerjemah(await localeSekarang())
}
