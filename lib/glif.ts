import type { Severity } from './findings.ts'

/**
 * Glif severity. Satu sumber, dipakai di empat tempat: lencana tabel, chip
 * hitungan di kartu situs, keterangan tab claude-seo, dan legenda.
 *
 * Sebelumnya nilainya ditulis ulang di masing-masing berkas, dan tiga di
 * antaranya memakai penanda konsol lama (`[!!]`, `[!]`) sementara satu sudah
 * berganti. Glif yang berbeda untuk severity yang sama adalah tepat jenis
 * ketidakcocokan yang tidak akan dilaporkan siapa pun, karena masing-masing
 * layar terlihat benar sendiri-sendiri.
 *
 * Bobot visualnya menurun berurutan — palang, segitiga padat, belah ketupat
 * padat, bulat padat, bulat kosong — jadi urutannya terbaca tanpa warna, saat
 * di-print, dan di screenshot hitam-putih. `docs/DESIGN.md` mewajibkan uji
 * greyscale diulang kalau glif ini diganti, dan `test/kontras.test.ts`
 * memastikan kelimanya tetap berbeda satu-satu.
 */
export const GLIF: Record<Severity, string> = {
  critical: '✖',
  high: '▲',
  medium: '◆',
  low: '●',
  info: '○',
}

/**
 * Penanda pemindaian yang sedang berjalan.
 *
 * Elipsis, bukan spinner, dan alasannya tidak berubah dari arah sebelumnya:
 * pemindaian berjalan di proses terpisah dan tidak mengirim satu pun angka
 * progres, jadi apa pun yang berputar di sana akan mengarang kemajuan yang
 * tidak diketahui. Elipsis terbaca sebagai "belum selesai" tanpa animasi,
 * lolos `prefers-reduced-motion` tanpa kasus khusus, dan tetap berarti di
 * screenshot statis.
 */
export const GLIF_BERJALAN = '…'
