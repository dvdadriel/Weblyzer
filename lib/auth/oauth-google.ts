import { createVerify, createPublicKey } from 'node:crypto'

export type KonfigOauth = { clientId: string; clientSecret: string; baseUrl: string }

/** Google menerbitkan `iss` dalam dua bentuk, dan keduanya sah. */
const ISS = ['https://accounts.google.com', 'accounts.google.com']
const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

/**
 * OAuth ditulis tangan, bukan lewat NextAuth.
 *
 * NextAuth berarti satu dependensi besar dengan tabel-tabelnya sendiri untuk
 * satu provider. Yang benar-benar penting di sini adalah `verifikasiIdToken` —
 * dan itu tidak didelegasikan, itu dibaca dan diuji. Lihat `test/oauth.test.ts`:
 * sebelas test menyerang verifikasinya, termasuk `alg: none`, `kid` asing, dan
 * `email_verified: false`.
 *
 * `null` kalau kredensialnya tidak lengkap. Halaman masuk memakai itu untuk
 * tidak menampilkan tombol Google sama sekali — bukan menampilkannya lalu
 * gagal setelah diklik.
 */
export function konfigurasiOauth(
  env: Record<string, string | undefined> = process.env,
): KonfigOauth | null {
  const clientId = env.WEBLYZER_GOOGLE_CLIENT_ID
  const clientSecret = env.WEBLYZER_GOOGLE_CLIENT_SECRET
  const baseUrl = env.WEBLYZER_BASE_URL
  if (!clientId || !clientSecret || !baseUrl) return null
  return { clientId, clientSecret, baseUrl: baseUrl.replace(/\/+$/, '') }
}

export function redirectUri(k: KonfigOauth): string {
  return `${k.baseUrl}/auth/google/callback`
}

export function urlAuthorize(k: KonfigOauth, state: string): string {
  const p = new URLSearchParams({
    client_id: k.clientId,
    redirect_uri: redirectUri(k),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // `select_account` supaya pemakai yang punya beberapa akun Google tidak
    // dipaksa memakai yang terakhir dipakai browsernya — dan lalu masuk ke
    // akun Weblyzer yang salah tanpa sadar.
    prompt: 'select_account',
  })
  return `${AUTHORIZE}?${p}`
}

export type HasilToken = { ok: true; idToken: string } | { ok: false; pesan: string }

export async function tukarCode(k: KonfigOauth, code: string): Promise<HasilToken> {
  try {
    const r = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: k.clientId,
        client_secret: k.clientSecret,
        redirect_uri: redirectUri(k),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await r.json()) as { id_token?: string; error_description?: string }
    if (!r.ok || !data.id_token) {
      return { ok: false, pesan: data.error_description ?? `Google mengembalikan ${r.status}.` }
    }
    return { ok: true, idToken: data.id_token }
  } catch (err) {
    return { ok: false, pesan: err instanceof Error ? err.message : String(err) }
  }
}

export type Jwks = { keys: Record<string, unknown>[] }

let cacheJwks: { data: Jwks; sampai: number } | null = null

/**
 * JWKS Google, di-cache satu jam.
 *
 * Google merotasi kuncinya, tapi tidak per menit. Mengambilnya pada setiap
 * login menambah satu permintaan jaringan yang bisa gagal ke jalur yang sudah
 * punya cukup titik gagal.
 */
export async function ambilJwks(sekarang: number = Date.now()): Promise<Jwks> {
  if (cacheJwks && sekarang < cacheJwks.sampai) return cacheJwks.data
  const r = await fetch(JWKS_URL, { signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`Gagal mengambil JWKS Google: ${r.status}`)
  const data = (await r.json()) as Jwks
  cacheJwks = { data, sampai: sekarang + 3600_000 }
  return data
}

export type HasilVerifikasi =
  | { ok: true; sub: string; email: string }
  | { ok: false; pesan: string }

/**
 * Memverifikasi `id_token` Google. Murni — JWKS masuk sebagai argumen.
 *
 * Urutan pemeriksaannya disengaja: bentuk, lalu algoritma, lalu tanda tangan,
 * baru klaim. Klaim dari token yang tanda tangannya belum terbukti tidak
 * pernah dipercaya, karena siapa pun bisa mengarangnya.
 */
export function verifikasiIdToken(
  token: string,
  clientId: string,
  jwks: Jwks,
  sekarangDetik: number = Math.floor(Date.now() / 1000),
): HasilVerifikasi {
  const bagian = token.split('.')
  if (bagian.length !== 3) return { ok: false, pesan: 'Bentuk id_token tidak dikenal.' }
  const h64 = bagian[0] ?? ''
  const p64 = bagian[1] ?? ''
  const s64 = bagian[2] ?? ''

  let header: { alg?: string; kid?: string }
  let klaim: Record<string, unknown>
  try {
    header = JSON.parse(Buffer.from(h64, 'base64url').toString('utf8'))
    klaim = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, pesan: 'id_token tidak bisa dibaca.' }
  }
  if (typeof klaim !== 'object' || klaim === null) {
    return { ok: false, pesan: 'Isi id_token bukan objek.' }
  }

  // `alg: none` ditolak di sini, sebelum apa pun yang lain. Menerimanya
  // berarti siapa pun bisa mengarang token tanpa kunci — serangan JWT paling
  // klasik yang ada.
  if (header.alg !== 'RS256') return { ok: false, pesan: `alg tidak didukung: ${header.alg}` }
  if (s64 === '') return { ok: false, pesan: 'id_token tanpa tanda tangan.' }

  const jwk = jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk) return { ok: false, pesan: 'Kunci penanda tangan tidak ada di JWKS Google.' }

  let sah = false
  try {
    const pub = createPublicKey({ key: jwk as never, format: 'jwk' })
    sah = createVerify('RSA-SHA256')
      .update(`${h64}.${p64}`)
      .verify(pub, Buffer.from(s64, 'base64url'))
  } catch {
    return { ok: false, pesan: 'Tanda tangan id_token tidak bisa diperiksa.' }
  }
  if (!sah) return { ok: false, pesan: 'Tanda tangan id_token tidak cocok.' }

  if (typeof klaim.iss !== 'string' || !ISS.includes(klaim.iss)) {
    return { ok: false, pesan: 'Penerbit id_token bukan Google.' }
  }
  if (klaim.aud !== clientId) return { ok: false, pesan: 'id_token bukan untuk aplikasi ini.' }
  if (typeof klaim.exp !== 'number' || sekarangDetik > klaim.exp) {
    return { ok: false, pesan: 'id_token sudah kedaluwarsa.' }
  }
  if (typeof klaim.sub !== 'string' || klaim.sub === '') {
    return { ok: false, pesan: 'id_token tanpa sub.' }
  }
  if (typeof klaim.email !== 'string' || klaim.email === '') {
    return { ok: false, pesan: 'Google tidak mengirim alamat email.' }
  }
  // INILAH pemeriksaan yang membuat penautan akun lewat email aman. Tanpanya,
  // siapa pun yang bisa membuat akun Google beralamat email orang lain bisa
  // mengambil alih akun Weblyzer orang itu — penautan lewat email berubah dari
  // kemudahan menjadi pengambilalihan akun.
  if (klaim.email_verified !== true) {
    return { ok: false, pesan: 'Email Google itu belum terverifikasi.' }
  }

  return { ok: true, sub: klaim.sub, email: klaim.email }
}
