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
 * IMPOR-NYA DINAMIS DAN DIPAGARI `NEXT_RUNTIME`, dan itu bukan gaya.
 *
 * Next mengompilasi berkas ini untuk runtime Node DAN Edge. Edge tidak
 * mendukung `node:crypto`, jadi impor statis `./lib/auth/rahasia.ts` di
 * puncak berkas menggagalkan build Edge-nya pada setiap request — terlihat di
 * log dev sebagai "Ecmascript file had an error" sementara halamannya tetap
 * menjawab 200. Akibat sebenarnya: pemeriksaan ini tidak pernah jalan di jalur
 * itu, yaitu penjaga yang setengah mati sambil terlihat terpasang.
 *
 * Konsekuensi yang jujur: deploy apa pun butuh env ini, termasuk deploy yang
 * hanya menampilkan halaman `/demo`. Itu satu variabel, dan `README.md`
 * menyebutkannya.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { bacaRahasia } = await import('./lib/auth/rahasia.ts')
  bacaRahasia()
}
