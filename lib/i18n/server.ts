import { cookies } from 'next/headers'
import { konteks } from '../auth/konteks.ts'
import { localeSah, penerjemah, NAMA_COOKIE_LOCALE, type Locale, type T } from './index.ts'

/**
 * Locale untuk request yang sedang berjalan.
 *
 * Sumbernya sama dengan tema: `users.locale` untuk yang masuk, cookie untuk
 * guest. Guest tidak punya baris di tabel mana pun, jadi cookie adalah
 * satu-satunya tempat pilihannya bisa hidup.
 */
export async function localeSekarang(): Promise<Locale> {
  const ctx = await konteks()
  if (ctx.jenis === 'user') return localeSah(ctx.user.locale)
  return localeSah((await cookies()).get(NAMA_COOKIE_LOCALE)?.value)
}

/**
 * Penerjemah untuk Server Component dan Server Action.
 *
 * Ada supaya enam halaman tidak masing-masing mengulang empat baris pembacaan
 * locale yang sama. Boilerplate yang diulang adalah boilerplate yang cepat atau
 * lambat menyimpang: satu halaman akan lupa membaca `users.locale` dan hanya
 * membaca cookie, lalu bahasanya berbeda dari halaman sebelahnya untuk pemakai
 * yang sama.
 */
export async function tServer(): Promise<T> {
  return penerjemah(await localeSekarang())
}
