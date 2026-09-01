const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
/** Posisi sumber `:baris:kolom`. Harus disamarkan sebagai satu kesatuan:
 *  kolom sering hanya dua digit, jadi aturan panjang angka di bawah tidak
 *  menjangkaunya, padahal baris dan kolom sama-sama bergeser setiap build. */
const POSISI_SUMBER = /:\d+:\d+/g
/** Empat digit atau lebih: timestamp, id permintaan, hash chunk, offset
 *  bundel. Tiga digit sengaja dibiarkan agar "HTTP 404" dan "HTTP 500" tetap
 *  menjadi dua temuan yang berbeda. */
const ANGKA_PANJANG = /\d{4,}/g

/**
 * Mengubah teks pesan menjadi kunci fingerprint yang stabil antar scan.
 *
 * Tanpa ini, pesan yang memuat timestamp atau id permintaan menghasilkan
 * fingerprint baru setiap kali dijalankan: temuan kemarin ditandai `fixed`
 * dan temuan yang identik dibuka sebagai baru, sehingga riwayat "sudah
 * diperbaiki atau belum" kehilangan artinya.
 */
export function stableKey(text: string): string {
  return text
    .replace(UUID, '#')
    .replace(POSISI_SUMBER, ':#:#')
    .replace(ANGKA_PANJANG, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}
