import { subKunci } from './rahasia.ts'
import { tandaTangani, bacaToken } from './token.ts'

export const NAMA_COOKIE_SESI = 'weblyzer_sesi'
export const UMUR_SESI_MS = 30 * 24 * 3600_000

/**
 * Session tanpa tabel: cookie bertanda tangan itulah session-nya.
 *
 * KONSEKUENSI YANG DISENGAJA DAN HARUS DIKETAHUI: tidak ada logout global.
 * Mengubah password TIDAK mencabut session yang sudah terbit di perangkat
 * lain, dan tidak ada daftar sesi aktif yang bisa dilihat atau dihapus.
 *
 * Untuk instance dengan segelintir user yang saling kenal, itu harga yang
 * wajar dibanding satu tabel plus pembersihannya. Kalau nanti tidak wajar,
 * jalan keluarnya sudah jelas: tambahkan `users.sesi_epoch`, ikut
 * tandatangani, dan naikkan nilainya saat password berubah — satu kolom,
 * bukan tabel. Halaman ganti password mengatakan batasan ini apa adanya
 * alih-alih membiarkan orang mengira dirinya sudah aman.
 */
export function terbitkanSesi(rahasia: string, userId: number, sekarang?: number): string {
  return tandaTangani(subKunci(rahasia, 'sesi'), { uid: userId }, UMUR_SESI_MS, sekarang)
}

export function bacaSesi(rahasia: string, token: string, sekarang?: number): number | null {
  const isi = bacaToken(subKunci(rahasia, 'sesi'), token, sekarang)
  const uid = isi?.uid
  // Payload bisa dikarang siapa pun yang punya kuncinya; tipenya tetap tidak
  // dipercaya begitu saja. `uid` yang berupa string akan mengalir sampai ke
  // kueri dan mencocokkan nol baris — gejalanya "user hilang", bukan
  // "cookie rusak".
  return typeof uid === 'number' && Number.isInteger(uid) && uid > 0 ? uid : null
}
