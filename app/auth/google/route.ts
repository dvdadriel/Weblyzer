import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { konfigurasiOauth, urlAuthorize } from '../../../lib/auth/oauth-google.ts'

export const NAMA_COOKIE_STATE = 'weblyzer_oauth_state'

export async function GET() {
  const k = konfigurasiOauth()
  if (!k) redirect('/masuk?galat=oauth-mati')

  // `state` acak, disimpan di cookie pendek lalu dicocokkan di callback.
  // Tanpa ini, penyerang bisa memancing korban menyelesaikan alur OAuth milik
  // akun Google si penyerang — dan korban berakhir masuk ke akun yang bukan
  // miliknya tanpa sadar.
  const state = randomBytes(32).toString('base64url')
  const jar = await cookies()
  jar.set(NAMA_COOKIE_STATE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    // Sepuluh menit. Alur OAuth yang butuh lebih lama dari itu sudah
    // ditinggalkan orangnya.
    maxAge: 600,
    path: '/',
  })

  redirect(urlAuthorize(k, state))
}
