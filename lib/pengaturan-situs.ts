import type { LighthouseMode } from './repos/sites.ts'

/**
 * Validasi pengaturan situs, dipisah dari server action supaya bisa diuji.
 *
 * Empat kolom ini sudah ada di skema sejak awal dan sampai sekarang hanya bisa
 * diubah lewat SQL. `enabled` yang paling terasa: sejak scheduler ada, itulah
 * satu-satunya cara mengecualikan satu situs dari pemindaian tengah malam
 * tanpa menghapus riwayatnya — dan menuntut orang membuka sqlite3 untuk itu
 * bukan pengaturan, itu penghalang.
 */

export type Masukan = {
  maxPages: string
  mode: string
  sitemap: string
  enabled: boolean
}

export type Bersih = {
  max_pages: number
  lighthouse_mode: LighthouseMode
  sitemap_url: string | null
  enabled: number
}

export type HasilValidasi = { ok: true; nilai: Bersih } | { ok: false; galat: string }

/**
 * Batas atas `max_pages`.
 *
 * Bukan angka bulat yang enak dilihat: crawl Springair 141 halaman butuh ~3
 * menit, jadi 2000 halaman adalah sekitar 42 menit ditambah Lighthouse di
 * atasnya. Di atas itu pemindaian tidak lagi selesai dalam satu malam, dan
 * batas yang menahannya lebih baik daripada menemukannya pukul enam pagi.
 */
const MAX_PAGES_ATAS = 2000

const MODE: LighthouseMode[] = ['sample', 'full']

export function validasi(m: Masukan): HasilValidasi {
  const angka = m.maxPages.trim()
  // Sengaja bukan `Number()`: `Number('12abc')` adalah NaN yang tertangkap,
  // tapi `Number('')` adalah 0 dan `Number(' 12 ')` adalah 12 — yang pertama
  // akan menyimpan situs yang tidak pernah dijelajahi tanpa mengeluh.
  if (!/^\d+$/.test(angka)) {
    return { ok: false, galat: 'Jumlah halaman harus berupa angka bulat.' }
  }
  const maxPages = Number(angka)
  if (maxPages < 1) {
    // Nol halaman bukan "pindai sesukanya" — ia menghasilkan crawl kosong, dan
    // crawl kosong menandai seluruh temuan lama sudah diperbaiki (§2.2).
    return { ok: false, galat: 'Jumlah halaman minimal 1.' }
  }
  if (maxPages > MAX_PAGES_ATAS) {
    return {
      ok: false,
      galat: `Jumlah halaman maksimal ${MAX_PAGES_ATAS}. Di atas itu satu pemindaian tidak selesai dalam satu malam.`,
    }
  }

  if (!(MODE as string[]).includes(m.mode)) {
    return { ok: false, galat: `Mode Lighthouse tidak dikenal: ${m.mode}.` }
  }

  const sitemap = m.sitemap.trim()
  if (sitemap !== '') {
    // Divalidasi walau BELUM DIPAKAI. `sitemap_url` masih menunggu aturan
    // cakupan sitemap yang belum ditulis, tapi menyimpan nilai yang tidak sah
    // sekarang berarti fitur itu lahir dengan data rusak yang sudah tersimpan.
    if (!/^https?:\/\//i.test(sitemap)) {
      return { ok: false, galat: 'Alamat sitemap harus diawali http:// atau https://' }
    }
    try {
      new URL(sitemap)
    } catch {
      return { ok: false, galat: `Alamat sitemap tidak sah: ${sitemap}` }
    }
  }

  return {
    ok: true,
    nilai: {
      max_pages: maxPages,
      lighthouse_mode: m.mode as LighthouseMode,
      // Kosong disimpan sebagai NULL, bukan string kosong: kolomnya nullable
      // dan "belum diisi" berbeda dari "diisi kosong".
      sitemap_url: sitemap === '' ? null : sitemap,
      enabled: m.enabled ? 1 : 0,
    },
  }
}

/** Perkiraan lama satu pemindaian, untuk ditulis di sebelah kolomnya.
 *  Diturunkan dari ukuran nyata: Springair 141 halaman ≈ 3 menit crawl. */
export function perkiraanMenit(maxPages: number): number {
  return Math.max(1, Math.round((maxPages / 141) * 3))
}
