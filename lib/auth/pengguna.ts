import type { DatabaseSync } from 'node:sqlite'
import { hashPassword, verifikasiPassword } from './password.ts'

export type Peran = 'user' | 'admin'
export type Locale = 'id' | 'en'
export type Tema = 'system' | 'light' | 'dark'

export type User = {
  id: number
  email: string
  password_hash: string | null
  role: Peran
  locale: Locale
  theme: Tema
  created_at: string
}

const KOLOM = 'id, email, password_hash, role, locale, theme, created_at'

/**
 * Email dinormalkan sebelum disimpan dan sebelum dicari.
 *
 * Bukan kosmetik: penautan akun OAuth mencocokkan lewat email, dan
 * "David@Gmail.com" dari Google yang tidak cocok dengan "david@gmail.com" di
 * database akan membuat akun kedua untuk orang yang sama — lalu situsnya
 * menghilang dari pandangannya tanpa satu pun galat.
 */
function normalkan(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Cukup untuk menolak yang jelas bukan email. Validasi sebenarnya adalah
 * apakah orangnya bisa menerima surat, dan itu di luar jangkauan di sini.
 */
const BENTUK_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function buatUser(
  db: DatabaseSync,
  input: { email: string; password: string | null; role?: Peran },
): User {
  const email = normalkan(input.email)
  if (!BENTUK_EMAIL.test(email)) throw new Error(`Bukan alamat email yang sah: ${input.email}`)
  if (userLewatEmail(db, email)) throw new Error(`Email ${email} sudah dipakai.`)

  const row = db
    .prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING ${KOLOM}`)
    .get(
      email,
      input.password === null ? null : hashPassword(input.password),
      input.role ?? 'user',
    )
  return row as unknown as User
}

export function userLewatEmail(db: DatabaseSync, email: string): User | undefined {
  const row = db.prepare(`SELECT ${KOLOM} FROM users WHERE email = ?`).get(normalkan(email))
  return row as unknown as User | undefined
}

export function userLewatId(db: DatabaseSync, id: number): User | undefined {
  const row = db.prepare(`SELECT ${KOLOM} FROM users WHERE id = ?`).get(id)
  return row as unknown as User | undefined
}

/**
 * `null` untuk email yang tidak ada DAN untuk password yang salah.
 *
 * Keduanya dibedakan hanya di dalam pemanggilnya, tidak pernah di pesan yang
 * keluar: "email tidak terdaftar" memberi tahu penyerang akun mana yang ada
 * di instance ini.
 */
export function masukDenganPassword(
  db: DatabaseSync,
  email: string,
  password: string,
): User | null {
  const u = userLewatEmail(db, email)
  // `password_hash === null` berarti akun OAuth. Tidak ada password untuk
  // dicocokkan, dan mencocokkan string kosong akan meloloskan siapa pun.
  if (!u || u.password_hash === null) return null
  return verifikasiPassword(password, u.password_hash) ? u : null
}

export function gantiPassword(db: DatabaseSync, userId: number, baru: string): void {
  const hasil = db
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hashPassword(baru), userId)
  if (hasil.changes === 0) throw new Error(`User ${userId} tidak ditemukan`)
}

export function tautkanOauth(
  db: DatabaseSync,
  provider: string,
  providerUserId: string,
  userId: number,
): void {
  db.prepare(
    `INSERT INTO oauth_akun (provider, provider_user_id, user_id) VALUES (?, ?, ?)
     ON CONFLICT(provider, provider_user_id) DO UPDATE SET user_id = excluded.user_id`,
  ).run(provider, providerUserId, userId)
}

export function userLewatOauth(
  db: DatabaseSync,
  provider: string,
  providerUserId: string,
): User | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.password_hash, u.role, u.locale, u.theme, u.created_at
       FROM oauth_akun o JOIN users u ON u.id = o.user_id
       WHERE o.provider = ? AND o.provider_user_id = ?`,
    )
    .get(provider, providerUserId)
  return (row as unknown as User | undefined) ?? null
}

export function daftarUser(db: DatabaseSync): User[] {
  return db.prepare(`SELECT ${KOLOM} FROM users ORDER BY id`).all() as unknown as User[]
}

export function aturPreferensi(
  db: DatabaseSync,
  userId: number,
  patch: { locale?: Locale; theme?: Tema },
): void {
  const sets: string[] = []
  const nilai: string[] = []
  if (patch.locale !== undefined) {
    sets.push('locale = ?')
    nilai.push(patch.locale)
  }
  if (patch.theme !== undefined) {
    sets.push('theme = ?')
    nilai.push(patch.theme)
  }
  if (sets.length === 0) return
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...nilai, userId)
}
