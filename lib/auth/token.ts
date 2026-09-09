import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Token bertanda tangan: `base64url(payload).base64url(hmac)`.
 *
 * Dipakai dua kali — session user dan id guest — karena kebutuhannya identik:
 * satu nilai yang bisa dipercaya server tanpa menyimpan apa pun. Menulis dua
 * implementasi berarti dua tempat yang bisa salah membandingkan tanda tangan,
 * dan yang salah di antaranya tidak akan gagal sampai ada yang mencoba
 * memalsukannya.
 *
 * `sekarang` diinjeksikan alih-alih memanggil `Date.now()` di dalam, supaya
 * kedaluwarsa bisa diuji tanpa menunggu dan tanpa fake timer.
 */
export function tandaTangani(
  kunci: Buffer,
  payload: Record<string, unknown>,
  umurMs: number,
  sekarang: number = Date.now(),
): string {
  const isi = Buffer.from(JSON.stringify({ ...payload, exp: sekarang + umurMs })).toString(
    'base64url',
  )
  return `${isi}.${hmac(kunci, isi)}`
}

/**
 * Memverifikasi lalu membaca token. `null` untuk apa pun yang tidak sah.
 *
 * Tanda tangan diperiksa SEBELUM payload di-parse. Urutan itu penting: JSON
 * dari sumber yang belum terverifikasi tidak pernah disentuh parser.
 */
export function bacaToken(
  kunci: Buffer,
  token: string,
  sekarang: number = Date.now(),
): Record<string, unknown> | null {
  const titik = token.indexOf('.')
  if (titik <= 0 || titik === token.length - 1) return null
  const isi = token.slice(0, titik)
  const sig = token.slice(titik + 1)
  if (sig.includes('.')) return null

  const a = Buffer.from(sig)
  const b = Buffer.from(hmac(kunci, isi))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let data: unknown
  try {
    data = JSON.parse(Buffer.from(isi, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null

  const { exp, ...sisa } = data as Record<string, unknown>
  if (typeof exp !== 'number' || sekarang > exp) return null
  return sisa
}

function hmac(kunci: Buffer, isi: string): string {
  return createHmac('sha256', kunci).update(isi).digest('base64url')
}
