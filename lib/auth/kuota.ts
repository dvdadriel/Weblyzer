import type { DatabaseSync } from 'node:sqlite'
import type { Konteks } from './pemilik.ts'
import type { Kunci } from '../i18n/index.ts'

/**
 * Batas guest.
 *
 * Ada karena satu alasan yang tidak bisa dihindari: pemindaian menembak situs
 * pihak ketiga dari IP server ini. Tanpa batas, instance publik ini menjadi
 * crawler terbuka yang bisa dipakai siapa saja untuk memindai situs siapa
 * saja — dan yang muncul di log korban adalah IP pemilik instance, bukan IP
 * orang yang menekan tombolnya.
 */
export const MAKS_SITUS_GUEST = 1
export const MAKS_SCAN_GUEST = 3
export const JENDELA_JAM = 24

/**
 * Izin, dengan alasan sebagai KUNCI terjemahan alih-alih teks siap pakai.
 *
 * Berkas ini murni dan tidak boleh menyentuh `next/headers`, jadi ia tidak bisa
 * membaca locale pemakainya. Mengembalikan kunci membuat penerjemahannya jadi
 * urusan pemanggil — yang memang sudah punya penerjemah — dan membuat berkas
 * ini tetap bisa diuji tanpa lingkungan request.
 */
export type Izin =
  | { boleh: true }
  | { boleh: false; alasan: Kunci; params: Record<string, string | number> }

export function bolehTambahSitus(db: DatabaseSync, ctx: Konteks): Izin {
  if (ctx.jenis === 'user') return { boleh: true }

  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM sites WHERE guest_id = ?')
    .get(ctx.guestId) as { n: number }

  return n < MAKS_SITUS_GUEST
    ? { boleh: true }
    : { boleh: false, alasan: 'kuota.situs', params: { n: MAKS_SITUS_GUEST } }
}

/**
 * Dihitung dari `runs`, bukan dari penghitung tersimpan.
 *
 * Penghitung terpisah akan menyimpang dari kenyataan begitu ada run yang
 * gagal, dihapus, atau ditulis oleh proses pemindaian yang lepas — dan yang
 * dipercaya orang adalah `runs`. `started_at` sudah ada di sana.
 *
 * `sekarang` diinjeksikan supaya jendela 24 jam bisa diuji tanpa menunggu
 * sehari.
 */
export function bolehScan(db: DatabaseSync, ctx: Konteks, sekarang: number = Date.now()): Izin {
  if (ctx.jenis === 'user') return { boleh: true }

  // `started_at` disimpan UTC dalam bentuk `YYYY-MM-DD HH:MM:SS`, jadi
  // pembandingnya harus berbentuk sama — perbandingan string pada format itu
  // berurutan secara kronologis.
  const batas = new Date(sekarang - JENDELA_JAM * 3600_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)

  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM runs r
       JOIN sites s ON s.id = r.site_id
       WHERE s.guest_id = ? AND r.started_at IS NOT NULL AND r.started_at > ?`,
    )
    .get(ctx.guestId, batas) as { n: number }

  return n < MAKS_SCAN_GUEST
    ? { boleh: true }
    : {
        boleh: false,
        alasan: 'kuota.scan',
        params: { n: MAKS_SCAN_GUEST, jam: JENDELA_JAM },
      }
}
