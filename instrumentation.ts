import { bacaRahasia } from './lib/auth/rahasia.ts'

/**
 * Dijalankan Next satu kali saat server start, sebelum request pertama.
 *
 * Gunanya satu: memastikan `WEBLYZER_SECRET` ada SEKARANG, bukan nanti.
 *
 * Tanpa berkas ini, instance yang lupa memasangnya tetap menyala dan terlihat
 * sehat — dashboard terbuka, situs terlihat, tombol pindai jalan — lalu gagal
 * pertama kali ada yang mencoba masuk. Kegagalan yang muncul di jam pertama
 * pemakaian nyata, pada orang lain, adalah kegagalan yang paling mahal
 * didiagnosis.
 *
 * Konsekuensinya jujur: deploy apa pun butuh env ini, termasuk deploy yang
 * hanya menampilkan halaman `/demo`. Itu satu variabel, dan `README.md`
 * menyebutkannya.
 */
export function register(): void {
  bacaRahasia()
}
