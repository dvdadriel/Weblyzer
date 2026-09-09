'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getDb } from '../../lib/db.ts'
import { konteks } from '../../lib/auth/konteks.ts'
import { aturPreferensi } from '../../lib/auth/pengguna.ts'
import { temaSah, NAMA_COOKIE_TEMA, type Tema } from '../../lib/tema.ts'
import { localeSah, NAMA_COOKIE_LOCALE, type Locale } from '../../lib/i18n/index.ts'

const SETAHUN = 365 * 24 * 3600

/** Opsi cookie preferensi, dipakai tema dan locale. */
const OPSI = {
  // BUKAN httpOnly, berbeda dari cookie sesi dan cookie guest, dan
  // perbedaannya disengaja: ini preferensi tampilan, bukan kredensial. Tidak
  // ada yang bisa disalahgunakan dengan membacanya.
  httpOnly: false,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SETAHUN,
  path: '/',
} as const

/**
 * Menyimpan pilihan tema.
 *
 * Dua tempat penyimpanan karena ada dua jenis pemakai: `users.theme` untuk yang
 * masuk, cookie untuk guest. Guest tidak punya baris di tabel mana pun, jadi
 * cookie adalah satu-satunya tempat pilihannya bisa hidup.
 *
 * Cookie ikut ditulis untuk user yang masuk juga. Kelihatan berlebihan, tapi
 * ia yang menjaga temanya tidak berkedip di detik antara keluar dan halaman
 * berikutnya termuat: tanpa itu, `konteks()` sudah jatuh ke guest sementara
 * cookie temanya belum ada, dan layar melompat ke terang.
 */
export async function aturTema(nilai: string): Promise<void> {
  const tema: Tema = temaSah(nilai)
  const ctx = await konteks()

  if (ctx.jenis === 'user') {
    aturPreferensi(getDb(), ctx.user.id, { theme: tema })
  }

  ;(await cookies()).set(NAMA_COOKIE_TEMA, tema, OPSI)

  // Seluruh pohon, bukan satu halaman: temanya ada di `<html>` yang dirender
  // layout, jadi setiap halaman ikut berubah.
  revalidatePath('/', 'layout')
}

/** Menyimpan pilihan bahasa. Pola dan alasannya sama dengan `aturTema`. */
export async function aturLocale(nilai: string): Promise<void> {
  const locale: Locale = localeSah(nilai)
  const ctx = await konteks()

  if (ctx.jenis === 'user') {
    aturPreferensi(getDb(), ctx.user.id, { locale })
  }

  ;(await cookies()).set(NAMA_COOKIE_LOCALE, locale, OPSI)
  revalidatePath('/', 'layout')
}
