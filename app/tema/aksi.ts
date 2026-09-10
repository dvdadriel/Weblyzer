'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { temaSah, NAMA_COOKIE_TEMA, type Tema } from '../../lib/tema.ts'
import { localeSah, NAMA_COOKIE_LOCALE, type Locale } from '../../lib/i18n/index.ts'

const SETAHUN = 365 * 24 * 3600

/**
 * Opsi cookie preferensi, dipakai tema dan locale.
 *
 * BUKAN httpOnly, dan itu disengaja: ini preferensi tampilan, bukan
 * kredensial. Tidak ada yang bisa disalahgunakan dengan membacanya.
 */
const OPSI = {
  httpOnly: false,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SETAHUN,
  path: '/',
} as const

/**
 * Menyimpan pilihan tema di cookie.
 *
 * Satu tempat penyimpanan, bukan dua. Dulu ia juga menulis ke `users.theme`
 * untuk pemakai yang masuk; itu hilang bersama akunnya, dan yang tersisa
 * adalah jalur yang lebih sederhana dan tidak bisa berselisih dengan dirinya
 * sendiri.
 */
export async function aturTema(nilai: string): Promise<void> {
  const tema: Tema = temaSah(nilai)
  ;(await cookies()).set(NAMA_COOKIE_TEMA, tema, OPSI)

  // Seluruh pohon, bukan satu halaman: temanya ada di `<html>` yang dirender
  // layout, jadi setiap halaman ikut berubah.
  revalidatePath('/', 'layout')
}

/** Menyimpan pilihan bahasa. Pola dan alasannya sama dengan `aturTema`. */
export async function aturLocale(nilai: string): Promise<void> {
  const locale: Locale = localeSah(nilai)
  ;(await cookies()).set(NAMA_COOKIE_LOCALE, locale, OPSI)
  revalidatePath('/', 'layout')
}
