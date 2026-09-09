import { timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '../../../../lib/db.ts'
import { bacaRahasia } from '../../../../lib/auth/rahasia.ts'
import {
  konfigurasiOauth,
  tukarCode,
  ambilJwks,
  verifikasiIdToken,
} from '../../../../lib/auth/oauth-google.ts'
import {
  userLewatEmail,
  userLewatOauth,
  tautkanOauth,
} from '../../../../lib/auth/pengguna.ts'
import { terbitkanSesi, NAMA_COOKIE_SESI, UMUR_SESI_MS } from '../../../../lib/auth/sesi.ts'
import { NAMA_COOKIE_STATE } from '../route.ts'

/**
 * Callback OAuth Google.
 *
 * Instance ini TIDAK menerima pendaftaran mandiri: akun Google yang emailnya
 * belum ada di `users` ditolak dengan alasan itu, bukan dibuatkan akun.
 * Pendaftaran terbuka berarti moderasi, verifikasi email, dan penyalahgunaan
 * kuota — tiga masalah yang belum ada di sini.
 */
export async function GET(req: Request) {
  const k = konfigurasiOauth()
  if (!k) redirect('/masuk?galat=oauth-mati')

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const jar = await cookies()
  const harapan = jar.get(NAMA_COOKIE_STATE)?.value
  // Dibuang segera, apa pun hasilnya: satu `state` untuk satu alur, dan
  // membiarkannya hidup berarti ia bisa dipakai ulang.
  jar.delete(NAMA_COOKIE_STATE)

  if (!code || !state || !harapan) redirect('/masuk?galat=state')
  const a = Buffer.from(state)
  const b = Buffer.from(harapan)
  if (a.length !== b.length || !timingSafeEqual(a, b)) redirect('/masuk?galat=state')

  const token = await tukarCode(k, code)
  if (!token.ok) redirect('/masuk?galat=tukar')

  const v = verifikasiIdToken(token.idToken, k.clientId, await ambilJwks())
  if (!v.ok) redirect('/masuk?galat=token')

  const db = getDb()
  let user = userLewatOauth(db, 'google', v.sub)

  if (!user) {
    // Penautan lewat email, dan itu aman HANYA karena `email_verified` sudah
    // diperiksa di `verifikasiIdToken`. Tanpa pemeriksaan itu, penautan lewat
    // email adalah pengambilalihan akun.
    const lewatEmail = userLewatEmail(db, v.email)
    if (!lewatEmail) redirect('/masuk?galat=tidak-terdaftar')
    user = lewatEmail
    tautkanOauth(db, 'google', v.sub, user.id)
  }

  jar.set(NAMA_COOKIE_SESI, terbitkanSesi(bacaRahasia(), user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: UMUR_SESI_MS / 1000,
    path: '/',
  })
  redirect('/')
}
