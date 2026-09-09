import { cookies } from 'next/headers'
import { getDb } from '../db.ts'
import { bacaRahasia } from './rahasia.ts'
import { bacaSesi, NAMA_COOKIE_SESI } from './sesi.ts'
import {
  bacaGuest,
  terbitkanGuest,
  idGuestBaru,
  NAMA_COOKIE_GUEST,
  UMUR_GUEST_MS,
} from './guest.ts'
import { userLewatId } from './pengguna.ts'
import type { Konteks } from './pemilik.ts'

export type { Konteks }

/**
 * Satu-satunya berkas yang memanggil `cookies()` milik Next.
 *
 * Sisa `lib/auth/*` adalah fungsi murni yang menerima nilai dan mengembalikan
 * nilai, dan karena itu bisa diuji tanpa Next dan tanpa lingkungan request.
 * Membiarkan `cookies()` merembes ke sana berarti setiap test primitif auth
 * butuh request tiruan — dan test yang mahal disiapkan adalah test yang tidak
 * ditulis.
 */
export async function konteks(): Promise<Konteks> {
  const jar = await cookies()
  const rahasia = bacaRahasia()

  const sesi = jar.get(NAMA_COOKIE_SESI)?.value
  if (sesi) {
    const uid = bacaSesi(rahasia, sesi)
    if (uid !== null) {
      const user = userLewatId(getDb(), uid)
      // User yang dihapus sementara cookienya masih berlaku jatuh ke guest,
      // bukan menjadi 500 di setiap halaman.
      if (user) return { jenis: 'user', user }
    }
  }

  const guestCookie = jar.get(NAMA_COOKIE_GUEST)?.value
  const gid = guestCookie ? bacaGuest(rahasia, guestCookie) : null
  if (gid) return { jenis: 'guest', guestId: gid }

  // Belum punya cookie guest. Id sementara dikembalikan tanpa dituliskan,
  // karena `cookies().set()` hanya sah di Server Action dan Route Handler —
  // Server Component yang hanya membaca akan melempar kalau mencoba.
  //
  // Itu aman: id sementara ini tidak memiliki situs apa pun, jadi yang
  // terlihat adalah dashboard kosong. Situs baru hanya bisa dibuat lewat
  // Server Action, dan `pastikanGuest` di sana yang menuliskan cookie
  // sungguhannya.
  return { jenis: 'guest', guestId: idGuestBaru() }
}

/**
 * Dipakai Server Action sebelum membuat situs: memastikan cookie guest
 * benar-benar tertulis, dan mengembalikan id yang akan bertahan.
 */
export async function pastikanGuest(): Promise<string> {
  const jar = await cookies()
  const rahasia = bacaRahasia()

  const ada = jar.get(NAMA_COOKIE_GUEST)?.value
  const gid = ada ? bacaGuest(rahasia, ada) : null
  if (gid) return gid

  const baru = idGuestBaru()
  jar.set(NAMA_COOKIE_GUEST, terbitkanGuest(rahasia, baru), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: UMUR_GUEST_MS / 1000,
    path: '/',
  })
  return baru
}

/**
 * Konteks untuk Server Action yang membuat situs.
 *
 * Berbeda dari `konteks()`: kalau pemanggilnya guest, cookie-nya ditulis
 * sekarang. Tanpa ini, situs yang dibuat guest baru akan dipasangkan ke id
 * sementara yang menghilang bersama request-nya — dan situsnya menjadi milik
 * tidak seorang pun pada klik berikutnya.
 */
export async function konteksTulis(): Promise<Konteks> {
  const ctx = await konteks()
  if (ctx.jenis === 'user') return ctx
  return { jenis: 'guest', guestId: await pastikanGuest() }
}

export type KonteksUser = Extract<Konteks, { jenis: 'user' }>

export async function wajibUser(): Promise<KonteksUser> {
  const ctx = await konteks()
  if (ctx.jenis !== 'user') throw new Error('Aksi ini butuh akun. Masuk dulu.')
  return ctx
}

export async function wajibAdmin(): Promise<KonteksUser> {
  const ctx = await wajibUser()
  if (ctx.user.role !== 'admin') throw new Error('Aksi ini hanya untuk admin.')
  return ctx
}
