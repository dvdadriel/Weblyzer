import { getDb } from '../db.ts'

/**
 * Satu-satunya pintu database untuk UI. Server component memanggil ini
 * langsung — tanpa route handler di tengah.
 *
 * Aplikasi ini satu proses, satu pengguna, satu berkas. Menambah lapisan API
 * untuk membaca berarti menulis serializer, menangani kegagalan fetch, dan
 * memelihara satu tempat lagi yang bisa tidak sinkron, demi lapisan yang tidak
 * dilewati siapa pun.
 */
export function db() {
  return getDb()
}
