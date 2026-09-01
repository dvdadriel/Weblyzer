const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
/** Lima digit atau lebih: timestamp, id, offset bundel. Angka pendek seperti
 *  kode status HTTP justru bermakna dan tidak boleh ikut dikaburkan. */
const ANGKA_PANJANG = /\d{5,}/g

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
    .replace(ANGKA_PANJANG, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}
