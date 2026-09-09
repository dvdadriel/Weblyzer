import type { NextConfig } from 'next'

const config: NextConfig = {
  // Next 16 menuliskan CLAUDE.md dan AGENTS.md ke root proyek setiap kali
  // `next dev` mulai. Keduanya wilayah konfigurasi pengguna, bukan keluaran
  // build, dan menulis ulang berkas milik orang lain tanpa diminta tidak sopan.
  agentRules: false,

  // Direktori build bisa dipindah lewat env, dan itu ada untuk satu alasan:
  // Next 16 MENOLAK menjalankan server dev kedua di direktori yang sama —
  // lock-nya di `<distDir>/dev/lock`. Tanpa ini, `test/ui.test.ts` gagal
  // seluruhnya begitu ada `npm run dev` yang sedang jalan, dengan pesan
  // "server dev tidak siap dalam 180 detik" yang tidak menyebut sebabnya
  // sama sekali.
  //
  // Terdiagnosis, bukan diduga: 21 test UI di-skip dan satu berkas gagal
  // dalam suite penuh, sementara `npm run dev` milik pemakai menempati
  // `.next/dev/lock`. Suite yang gagal karena pemakainya sedang bekerja di
  // repo yang sama adalah suite yang cepat atau lambat di-skip permanen.
  ...(process.env.WEBLYZER_DIST_DIR ? { distDir: process.env.WEBLYZER_DIST_DIR } : {}),
}

export default config
