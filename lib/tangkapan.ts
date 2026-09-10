import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * Tangkapan layar Mobile Parity: di mana disimpan, dan berapa banyak.
 *
 * ============================================================================
 * BAWAAN PLAYWRIGHT ADALAH JEBAKAN
 * ============================================================================
 * Terukur pada isleep.co.id (halaman ~6000 piksel), tiga lebar per halaman:
 *
 *   fullPage PNG pada device scale factor  18,5 MB   → 463 MB untuk 25 halaman
 *   fullPage JPEG kualitas 70 pada 1x       1,05 MB  →  26 MB
 *   viewport JPEG kualitas 70 pada 1x       0,22 MB  →   5 MB
 *   potongan satu elemen                    0,03 MB
 *
 * `page.screenshot()` tanpa argumen memberi yang pertama. Empat ratus enam
 * puluh tiga megabita per pemindaian, untuk aspek yang sebelumnya tidak
 * menulis satu berkas pun.
 *
 * Jadi: JPEG, kualitas 70, `scale: 'css'` (yaitu 1x, bukan 3x milik ponsel).
 * Bedanya 18× dan tidak ada yang hilang untuk keperluan ini — yang dilihat
 * orang adalah "kartunya terpotong", bukan ketajaman hurufnya.
 */
export const MUTU = 70

/**
 * Tinggi maksimum satu potongan elemen: 600 piksel.
 *
 * Tanpa batas, satu `<section>` setinggi 4000 piksel menghasilkan potongan
 * yang sama besarnya dengan tangkapan halaman penuh — dan gunanya justru
 * hilang, karena yang dicari mata adalah tepi yang terlewati.
 */
export const TINGGI_POTONGAN = 600

/** Berapa banyak elemen yang dipotong per lebar. */
export const MAKS_POTONGAN = 3

/**
 * Direktori tangkapan, di sebelah berkas database.
 *
 * Di sebelah `data.db` dan bukan di `public/`, dan itu disengaja: berkas di
 * `public/` disajikan Next kepada siapa pun tanpa melewati kode kita, dan
 * tangkapan layar situs orang bukan hal yang diserahkan ke penyajian statis.
 * Ia dilayani route handler yang memvalidasi namanya.
 */
export function akarTangkapan(): string {
  const dari = process.env.WEBLYZER_SHOT_DIR
  if (dari) return dari
  const db = process.env.DB_PATH ?? 'data.db'
  return join(dirname(db) || '.', 'weblyzer-tangkapan')
}

export function dirSitus(siteId: number): string {
  return join(akarTangkapan(), String(siteId))
}

/**
 * Nama berkas: turunan URL-nya, bukan urutan.
 *
 * Hash dari URL supaya nama berkasnya bisa dihitung ulang dari temuan yang
 * sudah tersimpan, tanpa menyimpan pemetaannya di tabel mana pun. Delapan
 * karakter cukup: yang dibedakan paling banyak dua puluh lima halaman per
 * situs, bukan dua puluh lima juta.
 */
export function namaTangkapan(url: string, lebar: string, potongan?: number): string {
  const h = createHash('sha256').update(url).digest('hex').slice(0, 8)
  return potongan === undefined ? `${h}-${lebar}.jpg` : `${h}-${lebar}-p${potongan}.jpg`
}

/**
 * Nama berkas yang boleh dilayani.
 *
 * Allowlist ketat, bukan pemeriksaan `..`. Nama yang dihasilkan
 * `namaTangkapan` hanya berisi heks, nama lebar, dan angka — jadi pola ini
 * menerima semua yang sah dan menolak segalanya yang lain, termasuk bentuk
 * traversal yang belum terpikirkan.
 */
const POLA_NAMA = /^[0-9a-f]{8}-(mobile|tablet|desktop)(-p[0-9])?\.jpg$/

export function namaSah(nama: string): boolean {
  return POLA_NAMA.test(nama)
}

/**
 * Menghapus tangkapan lama satu situs, lalu menyiapkan direktorinya.
 *
 * Hanya run TERAKHIR yang disimpan, dan itu bukan penghematan belaka: temuan
 * di Weblyzer adalah keadaan SEKARANG. Tangkapan dari run sebelumnya
 * menggambarkan cacat yang mungkin sudah diperbaiki, dan gambar yang
 * bertentangan dengan temuannya lebih buruk daripada tidak ada gambar.
 */
export function siapkanDir(siteId: number): string {
  const dir = dirSitus(siteId)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}
