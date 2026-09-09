import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NAMA_COOKIE_SESI } from '../../lib/auth/sesi.ts'

/**
 * POST, bukan GET, dan itu bukan formalitas.
 *
 * Tautan keluar yang bisa dipicu `GET` akan dijalankan prefetcher browser
 * maupun pemindai tautan — dan orang yang cuma mengarahkan kursor ke menu
 * mendadak keluar dari akunnya.
 *
 * Cookie guest TIDAK dihapus. Situs yang pernah dibuat seseorang sebagai guest
 * adalah miliknya, dan mencabut cookie itu berarti membuangnya ke tempat yang
 * tidak bisa dijangkau siapa pun lagi.
 */
export async function POST() {
  const jar = await cookies()
  jar.delete(NAMA_COOKIE_SESI)
  redirect('/masuk')
}
