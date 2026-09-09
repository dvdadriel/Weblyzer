import { randomUUID } from 'node:crypto'
import { subKunci } from './rahasia.ts'
import { tandaTangani, bacaToken } from './token.ts'

export const NAMA_COOKIE_GUEST = 'weblyzer_guest'
export const UMUR_GUEST_MS = 90 * 24 * 3600_000

/**
 * Guest BUKAN akun.
 *
 * Tidak ada halaman daftar untuk guest, tidak ada baris di tabel mana pun yang
 * mewakilinya, dan tidak ada tabel session. Yang ada cuma satu cookie
 * bertanda tangan — cookie itu identitasnya, dan server tidak menyimpan apa
 * pun tentangnya selain `sites.guest_id` pada situs yang dibuatnya.
 *
 * Cookie itu ada karena satu alasan yang tidak bisa dihindari: pemindaian
 * menembak situs pihak ketiga dari IP server ini. Tanpa pembeda antar guest,
 * instance publik ini menjadi crawler terbuka yang bisa dipakai siapa saja
 * untuk memindai situs siapa saja, dan yang muncul di log korban adalah IP
 * pemilik instance. Cookie memberi dua hal yang wajib: isolasi antar guest,
 * dan kuota yang bisa ditegakkan (lihat `lib/auth/kuota.ts`).
 */
export function idGuestBaru(): string {
  return randomUUID()
}

export function terbitkanGuest(rahasia: string, guestId: string, sekarang?: number): string {
  return tandaTangani(subKunci(rahasia, 'guest'), { gid: guestId }, UMUR_GUEST_MS, sekarang)
}

export function bacaGuest(rahasia: string, token: string, sekarang?: number): string | null {
  const isi = bacaToken(subKunci(rahasia, 'guest'), token, sekarang)
  const gid = isi?.gid
  return typeof gid === 'string' && gid !== '' ? gid : null
}
