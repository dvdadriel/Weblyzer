'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '../../lib/db.ts'
import { bacaRahasia } from '../../lib/auth/rahasia.ts'
import { masukDenganPassword, userLewatEmail } from '../../lib/auth/pengguna.ts'
import { terbitkanSesi, NAMA_COOKIE_SESI, UMUR_SESI_MS } from '../../lib/auth/sesi.ts'
import { tServer } from '../../lib/i18n/server.ts'

/**
 * `email` ikut dikembalikan bersama galat, alasan yang sama dengan
 * `HasilAksi` di `app/actions.ts`: React mengosongkan input tak-terkontrol
 * setelah sebuah form action selesai, termasuk ketika actionnya gagal.
 * Password sengaja TIDAK dikembalikan — ia tidak boleh melewati batas ini dua
 * kali, dan mengetiknya ulang adalah harga yang wajar.
 */
export type HasilMasuk = { error: string; email?: string } | null

export async function masuk(_sebelum: HasilMasuk, form: FormData): Promise<HasilMasuk> {
  const t = await tServer()
  const email = String(form.get('email') ?? '').trim()
  const password = String(form.get('password') ?? '')
  if (!email || !password) return { error: t('masuk.kosong'), email }

  const user = masukDenganPassword(getDb(), email, password)
  if (!user) {
    // Satu pesan untuk "email tidak terdaftar" dan "password salah".
    // Membedakannya memberi tahu penyerang akun mana yang ada di instance ini.
    //
    // Satu pengecualian, dan ini bukan kebocoran yang sama: akun yang lahir
    // dari Google tidak punya password SAMA SEKALI, dan menyuruh orangnya
    // mencoba password lagi adalah jalan buntu yang tidak pernah berujung.
    // Yang dibocorkan cuma "akun ini memakai Google" kepada orang yang sudah
    // menebak alamatnya dengan benar.
    const ada = userLewatEmail(getDb(), email)
    if (ada && ada.password_hash === null) {
      return { error: t('masuk.lewatGoogle'), email }
    }
    return { error: t('masuk.salah'), email }
  }

  const jar = await cookies()
  jar.set(NAMA_COOKIE_SESI, terbitkanSesi(bacaRahasia(), user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: UMUR_SESI_MS / 1000,
    path: '/',
  })
  redirect('/')
}
