/**
 * Kategori temuan dan asalnya.
 *
 * Satu tempat, karena tiga lapisan membacanya: UI (tab dan lencana), ekspor
 * Excel (sheet), dan CLI. Sebelumnya daftar kategori disalin di tiga berkas dan
 * penambahan `geo` berarti tiga tempat yang bisa lupa.
 */

export const KATEGORI = ['bugs', 'console', 'security', 'seo', 'geo', 'audit', 'lighthouse'] as const
export type Kategori = (typeof KATEGORI)[number]

/** Nama yang dibaca manusia. Tunggal dan Inggris, sesuai aturan tulisan di
 *  DESIGN.md — kecuali GEO yang memang akronim. */
export const NAMA: Record<Kategori, string> = {
  bugs: 'Bug',
  console: 'Console',
  security: 'Security',
  seo: 'SEO',
  geo: 'GEO',
  audit: 'Audit',
  lighthouse: 'Lighthouse',
}

export type Sumber = 'aturan' | 'claude-seo'

/**
 * Asal temuan, diturunkan dari kategorinya.
 *
 * Sengaja TIDAK disimpan sebagai kolom di tabel `findings`: sumber sepenuhnya
 * ditentukan kategori, jadi kolomnya akan menjadi data turunan yang bisa
 * bertentangan dengan induknya. Kalau kelak ada satu kategori yang memuat
 * keduanya, kolom itu baru punya alasan — dan migrasinya bisa ditulis saat itu.
 *
 * Yang dijawab pembedaan ini: temuan `aturan` jawabannya sama tiap run dan
 * riwayat `open → fixed` bisa dipercaya penuh. Temuan `claude-seo` dinilai
 * model, jadi bisa bergeser tanpa situsnya berubah — dan pemakainya berhak
 * tahu yang mana sebelum mempercayai "sudah diperbaiki".
 */
export const SUMBER: Record<Kategori, Sumber> = {
  bugs: 'aturan',
  console: 'aturan',
  security: 'aturan',
  seo: 'aturan',
  geo: 'claude-seo',
  audit: 'claude-seo',
  lighthouse: 'aturan',
}

export function sumberKategori(category: string): Sumber {
  return SUMBER[category as Kategori] ?? 'aturan'
}

export function namaKategori(category: string): string {
  return NAMA[category as Kategori] ?? category
}

/**
 * Kategori yang bisa diperiksa ulang per temuan.
 *
 * Tinggal DI SINI, bukan di `lib/recheck.ts`, karena `TabelTemuan` adalah
 * client component — dan mengimpornya dari `recheck.ts` menarik seluruh graf
 * modulnya ke bundle browser, termasuk Playwright. TypeScript tidak
 * mengeluhkan itu; yang terjadi hanya bundle yang membengkak atau gagal saat
 * dijalankan. Berkas ini sengaja tanpa dependensi apa pun.
 *
 * Yang di luar daftar:
 * - `lighthouse` — pengukuran ulang yang jujur butuh ukur-dua-kali-lalu-iris,
 *   dan mesin itu sudah ada sebagai job penuh.
 * - `seo` — aturannya menilai seluruh situs sekaligus (judul kembar butuh
 *   semua judul), jadi satu halaman tidak cukup.
 * - `geo`, `audit` — dinilai claude-seo atas seluruh situs; memeriksa satu
 *   baris berarti menjalankan ulang seluruh analisisnya.
 */
export const BISA_RECHECK: ReadonlySet<string> = new Set(['bugs', 'console', 'security'])
