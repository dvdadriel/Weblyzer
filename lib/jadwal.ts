import type { DatabaseSync } from 'node:sqlite'
import { listSites, type Site } from './repos/sites.ts'

/** Perintah CLI yang dijalankan untuk tiap situs, berurutan. */
export const LANGKAH = ['scan', 'lighthouse'] as const

/**
 * Situs yang ikut jadwal tengah malam.
 *
 * `enabled` sudah ada di skema sejak awal dan sampai sekarang tidak ada yang
 * membacanya — inilah pembacanya. Satu-satunya cara mengecualikan situs dari
 * jadwal tanpa menghapusnya, jadi ini juga satu-satunya alasan kolom itu ada.
 */
export function situsTerjadwal(db: DatabaseSync): Site[] {
  return listSites(db).filter((s) => s.enabled === 1)
}

/**
 * Pemicu run diturunkan dari lingkungan, bukan dari argumen.
 *
 * `jadwal` men-spawn tiap pemindaian sebagai proses anak (lihat §2.4: proses
 * baru memuat kode baru), dan argumen perintah `scan` bersifat posisional —
 * `args[1]` sudah dipakai kategori. Env menembus batas proses tanpa menyerobot
 * posisi itu, dan anak mewarisinya sendiri.
 *
 * Nilai apa pun selain `scheduled` dibaca sebagai `manual`. Env yang salah
 * tulis harus jatuh ke arti yang jujur: run yang dipicu orang.
 */
export function pemicuDari(env: Record<string, string | undefined>): 'manual' | 'scheduled' {
  return env.WEBLYZER_TRIGGER === 'scheduled' ? 'scheduled' : 'manual'
}
