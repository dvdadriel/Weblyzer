import type { DatabaseSync } from 'node:sqlite'
import { getDb } from '../lib/db.ts'
import { buatUser, daftarUser } from '../lib/auth/pengguna.ts'

const EMAIL = 'davidadrielalvyn@gmail.com'
const PASSWORD = 'david123'

export type HasilSeed = { dibuat: boolean; diadopsi: number }

/**
 * Akun admin awal, hanya untuk database yang belum punya user sama sekali.
 *
 * Hash-nya dibuat di sini, bukan di berkas migrasi: garam acak per password
 * berarti hash tidak bisa dituliskan sebagai SQL statis. Password ini memang
 * untuk diganti — halaman `/akun` menyediakan caranya sejak hari pertama.
 *
 * Idempoten. Database yang sudah punya user tidak disentuh sama sekali,
 * termasuk kalau usernya bukan akun ini — instance yang sudah dipakai orang
 * tidak boleh mendadak mendapat admin kedua yang tidak diminta.
 */
export function seedAkun(db: DatabaseSync = getDb()): HasilSeed {
  if (daftarUser(db).length > 0) return { dibuat: false, diadopsi: 0 }

  const admin = buatUser(db, { email: EMAIL, password: PASSWORD, role: 'admin' })

  // Situs yang sudah ada sebelum multi-user tidak punya pemilik. Diberikan ke
  // admin pertama, bukan dibiarkan menggantung: situs tanpa pemilik tidak
  // terlihat oleh siapa pun kecuali admin, sementara pemindaian terjadwalnya
  // tetap jalan tiap malam — dan hasilnya tidak pernah dibaca siapa-siapa.
  //
  // Situs guest dilewati: `guest_id`-nya sudah menyatakan pemiliknya.
  const hasil = db
    .prepare('UPDATE sites SET user_id = ? WHERE user_id IS NULL AND guest_id IS NULL')
    .run(admin.id)

  return { dibuat: true, diadopsi: Number(hasil.changes) }
}

// Dijalankan langsung lewat `npm run seed`.
if (process.argv[1]?.endsWith('seed-akun.ts')) {
  const hasil = seedAkun()
  if (!hasil.dibuat) {
    console.log('Sudah ada akun di database ini. Tidak ada yang diubah.')
  } else {
    console.log(`Akun admin dibuat: ${EMAIL}`)
    console.log('Password awal: david123 — ganti di halaman /akun.')
    if (hasil.diadopsi > 0) {
      console.log(`${hasil.diadopsi} situs tanpa pemilik dipasangkan ke akun itu.`)
    }
  }
}
