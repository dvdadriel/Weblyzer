import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Parameter scrypt. N=16384 (2^14) memberi sekitar 100ms per hash di mesin
 * kelas laptop — cukup mahal untuk menyakiti penyerang, cukup murah untuk
 * halaman masuk.
 *
 * Ketiganya disimpan DI DALAM hash, bukan hanya di sini: menaikkan N nanti
 * tidak boleh membuat semua password lama mendadak tidak bisa diverifikasi.
 */
const N = 16384
const R = 8
const P = 1
const PANJANG = 64

/**
 * scrypt dari `node:crypto`, bukan bcrypt atau argon2.
 *
 * Keduanya dependensi native, dan proyek ini punya asas nol dependensi native
 * yang membuat scanner-nya berjalan tanpa build step. scrypt memenuhi syarat
 * yang sama dan sudah ada di dalam Node.
 */
export function hashPassword(password: string): string {
  if (password === '') throw new Error('Password tidak boleh kosong.')
  const garam = randomBytes(16)
  const hash = scryptSync(password, garam, PANJANG, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${garam.toString('base64')}$${hash.toString('base64')}`
}

/**
 * Memverifikasi password terhadap hash tersimpan.
 *
 * Mengembalikan `false` untuk hash yang rusak alih-alih melempar: pemanggilnya
 * adalah halaman masuk, dan satu baris rusak di database tidak boleh menjadi
 * 500 yang justru membocorkan bahwa akun itu ada.
 */
export function verifikasiPassword(password: string, tersimpan: string): boolean {
  const bagian = tersimpan.split('$')
  if (bagian.length !== 6) return false
  const [algo, n, r, p, garamB64, hashB64] = bagian
  if (algo !== 'scrypt') return false

  const N_ = Number(n)
  const R_ = Number(r)
  const P_ = Number(p)
  if (!Number.isInteger(N_) || !Number.isInteger(R_) || !Number.isInteger(P_)) return false
  if (N_ <= 1 || R_ < 1 || P_ < 1) return false

  const garam = Buffer.from(garamB64, 'base64')
  const harapan = Buffer.from(hashB64, 'base64')
  if (garam.length === 0 || harapan.length === 0) return false

  try {
    const hitung = scryptSync(password, garam, harapan.length, { N: N_, r: R_, p: P_ })
    // Panjangnya dijamin sama lewat argumen di atas, jadi `timingSafeEqual`
    // tidak akan melempar karena beda panjang.
    return timingSafeEqual(hitung, harapan)
  } catch {
    // Parameter scrypt di luar jangkauan (N bukan pangkat dua, memori
    // berlebih) melempar. Itu hash yang rusak, bukan password yang benar.
    return false
  }
}
