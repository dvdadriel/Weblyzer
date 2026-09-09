import { scryptSync } from 'node:crypto'

/**
 * Panjang minimum `WEBLYZER_SECRET`.
 *
 * 32 byte adalah lebar keluaran HMAC-SHA256; rahasia yang lebih pendek
 * mengurangi kekuatan tanda tangan tanpa memberi apa pun.
 */
const MIN = 32

/**
 * Membaca `WEBLYZER_SECRET`, atau melempar.
 *
 * TIDAK menghasilkan rahasia acak sebagai fallback, dan itu keputusan yang
 * paling penting di berkas ini. Rahasia yang dibuat saat start akan berubah
 * setiap restart, dan akibatnya dua hal: setiap deploy mengeluarkan semua
 * orang, dan setiap API key tersimpan tidak bisa didekripsi lagi — data hilang
 * tanpa satu pun galat. Gagal keras di detik pertama jauh lebih murah.
 */
export function bacaRahasia(env: Record<string, string | undefined> = process.env): string {
  const nilai = env.WEBLYZER_SECRET
  if (!nilai) {
    throw new Error(
      'WEBLYZER_SECRET belum diatur. Buat satu: `openssl rand -hex 32`, lalu simpan ' +
        'permanen — kehilangannya berarti kehilangan semua API key tersimpan.',
    )
  }
  if (nilai.length < MIN) {
    throw new Error(`WEBLYZER_SECRET terlalu pendek: ${nilai.length} karakter, minimal ${MIN}.`)
  }
  return nilai
}

/**
 * Menurunkan kunci 32 byte untuk satu tujuan.
 *
 * `tujuan` masuk sebagai garam, jadi kunci untuk menandatangani cookie dan
 * kunci untuk mengenkripsi API key tidak pernah bernilai sama walau lahir dari
 * satu rahasia. Bocornya salah satu tidak otomatis membocorkan yang lain.
 */
export function subKunci(rahasia: string, tujuan: string): Buffer {
  return scryptSync(rahasia, `weblyzer:${tujuan}`, 32)
}
