import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPairSync, createSign } from 'node:crypto'
import {
  urlAuthorize,
  verifikasiIdToken,
  konfigurasiOauth,
  redirectUri,
  type Jwks,
} from '../lib/auth/oauth-google.ts'

const ENV = {
  WEBLYZER_GOOGLE_CLIENT_ID: 'klien-123',
  WEBLYZER_GOOGLE_CLIENT_SECRET: 'rahasia-klien',
  WEBLYZER_BASE_URL: 'https://weblyzer.example.com',
}

let privateKey: string
let jwks: Jwks

/**
 * Menandatangani `id_token` sendiri, alih-alih memanggil Google.
 *
 * Yang perlu dijamin di sini adalah logika verifikasinya, dan itu murni.
 * Memanggil Google berarti test yang butuh jaringan, kredensial OAuth
 * sungguhan, dan seseorang yang menekan tombol persetujuan di browser.
 */
function idToken(klaim: Record<string, unknown>, kid = 'uji-1', alg = 'RS256'): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const isi = `${b64({ alg, typ: 'JWT', kid })}.${b64(klaim)}`
  const sig = createSign('RSA-SHA256').update(isi).sign(privateKey).toString('base64url')
  return `${isi}.${sig}`
}

beforeAll(() => {
  const pasangan = generateKeyPairSync('rsa', { modulusLength: 2048 })
  privateKey = pasangan.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
  jwks = {
    keys: [
      {
        ...(pasangan.publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
        kid: 'uji-1',
        alg: 'RS256',
        use: 'sig',
      },
    ],
  }
})

const SEKARANG = 1_757_000_000
const dasar = () => ({
  iss: 'https://accounts.google.com',
  aud: 'klien-123',
  sub: 'sub-abc',
  email: 'david@gmail.com',
  email_verified: true,
  exp: SEKARANG + 600,
  iat: SEKARANG,
})

describe('konfigurasiOauth', () => {
  it('null kalau kredensial tidak ada', () => {
    // Tanpa kredensial, tombol Google tidak ditampilkan — bukan ditampilkan
    // lalu gagal setelah diklik.
    expect(konfigurasiOauth({})).toBeNull()
  })

  it('null kalau salah satu saja yang hilang', () => {
    for (const kunci of Object.keys(ENV)) {
      const kurang = { ...ENV, [kunci]: undefined }
      expect(konfigurasiOauth(kurang), kunci).toBeNull()
    }
  })

  it('null kalau nilainya string kosong', () => {
    expect(konfigurasiOauth({ ...ENV, WEBLYZER_GOOGLE_CLIENT_ID: '' })).toBeNull()
  })

  it('terisi kalau ketiganya ada', () => {
    expect(konfigurasiOauth(ENV)?.clientId).toBe('klien-123')
  })

  it('membuang garis miring di akhir baseUrl', () => {
    // Kalau tidak, redirect_uri jadi ".../auth//google/callback" dan Google
    // menolaknya karena tidak cocok dengan yang terdaftar.
    const k = konfigurasiOauth({ ...ENV, WEBLYZER_BASE_URL: 'https://a.com///' })!
    expect(redirectUri(k)).toBe('https://a.com/auth/google/callback')
  })
})

describe('urlAuthorize', () => {
  it('memuat semua parameter yang diperlukan', () => {
    const u = new URL(urlAuthorize(konfigurasiOauth(ENV)!, 'state-xyz'))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('client_id')).toBe('klien-123')
    expect(u.searchParams.get('redirect_uri')).toBe(
      'https://weblyzer.example.com/auth/google/callback',
    )
    expect(u.searchParams.get('state')).toBe('state-xyz')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('scope')).toContain('email')
  })

  it('tidak pernah membawa client_secret', () => {
    // URL authorize berakhir di riwayat browser dan di log proxy.
    const u = urlAuthorize(konfigurasiOauth(ENV)!, 'state-xyz')
    expect(u).not.toContain('rahasia-klien')
  })
})

describe('verifikasiIdToken — token yang sah', () => {
  it('diterima, dan sub serta email dikembalikan', () => {
    const h = verifikasiIdToken(idToken(dasar()), 'klien-123', jwks, SEKARANG)
    expect(h.ok).toBe(true)
    expect(h.ok && h.sub).toBe('sub-abc')
    expect(h.ok && h.email).toBe('david@gmail.com')
  })

  it('menerima iss tanpa skema, yang juga dipakai Google', () => {
    const h = verifikasiIdToken(
      idToken({ ...dasar(), iss: 'accounts.google.com' }),
      'klien-123',
      jwks,
      SEKARANG,
    )
    expect(h.ok).toBe(true)
  })
})

describe('verifikasiIdToken — yang harus ditolak', () => {
  const tolak = (klaim: Record<string, unknown>, cocok?: RegExp) => {
    const h = verifikasiIdToken(idToken(klaim), 'klien-123', jwks, SEKARANG)
    expect(h.ok).toBe(false)
    if (cocok) expect(h.ok === false && h.pesan).toMatch(cocok)
  }

  it('aud yang salah', () => {
    tolak({ ...dasar(), aud: 'klien-lain' }, /aplikasi ini/)
  })

  it('iss yang salah', () => {
    tolak({ ...dasar(), iss: 'https://jahat.example.com' }, /bukan Google/)
  })

  it('token kedaluwarsa', () => {
    const h = verifikasiIdToken(idToken(dasar()), 'klien-123', jwks, SEKARANG + 601)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.pesan).toMatch(/kedaluwarsa/)
  })

  it('email_verified: false', () => {
    // INI pemeriksaan yang membuat penautan akun lewat email aman. Tanpanya,
    // siapa pun yang bisa membuat akun Google beralamat email orang lain bisa
    // mengambil alih akun Weblyzer orang itu.
    tolak({ ...dasar(), email_verified: false }, /terverifikasi/)
  })

  it('email_verified yang tidak ada sama sekali', () => {
    const { email_verified, ...tanpa } = dasar()
    tolak(tanpa, /terverifikasi/)
  })

  it('email_verified berupa string "true", bukan boolean', () => {
    // Perbandingannya `!== true`, bukan falsy — string "true" harus ditolak.
    tolak({ ...dasar(), email_verified: 'true' }, /terverifikasi/)
  })

  it('token tanpa email', () => {
    const { email, ...tanpa } = dasar()
    tolak(tanpa, /email/)
  })

  it('token tanpa sub', () => {
    const { sub, ...tanpa } = dasar()
    tolak(tanpa, /sub/)
  })

  it('tanda tangan yang tidak cocok', () => {
    const t = idToken(dasar())
    const rusak = `${t.slice(0, -4)}AAAA`
    const h = verifikasiIdToken(rusak, 'klien-123', jwks, SEKARANG)
    expect(h.ok).toBe(false)
  })

  it('payload yang diubah sesudah ditandatangani', () => {
    const asli = idToken(dasar())
    const [h64, , s64] = asli.split('.')
    const palsu = Buffer.from(JSON.stringify({ ...dasar(), sub: 'sub-penyerang' })).toString(
      'base64url',
    )
    const h = verifikasiIdToken(`${h64}.${palsu}.${s64}`, 'klien-123', jwks, SEKARANG)
    expect(h.ok).toBe(false)
  })

  it('kid yang tidak ada di JWKS', () => {
    const h = verifikasiIdToken(idToken(dasar(), 'kid-asing'), 'klien-123', jwks, SEKARANG)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.pesan).toMatch(/JWKS/)
  })

  it('alg none tanpa tanda tangan', () => {
    // Serangan JWT paling klasik yang ada.
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(dasar())}.`
    const h = verifikasiIdToken(t, 'klien-123', jwks, SEKARANG)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.pesan).toMatch(/alg/)
  })

  it('alg HS256, yang akan memakai kunci publik sebagai rahasia HMAC', () => {
    const h = verifikasiIdToken(idToken(dasar(), 'uji-1', 'HS256'), 'klien-123', jwks, SEKARANG)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.pesan).toMatch(/alg/)
  })

  it('bentuk yang bukan JWT sama sekali', () => {
    for (const s of ['', 'a', 'a.b', 'a.b.c.d', '...']) {
      const h = verifikasiIdToken(s, 'klien-123', jwks, SEKARANG)
      expect(h.ok, JSON.stringify(s)).toBe(false)
    }
  })

  it('JWKS kosong', () => {
    const h = verifikasiIdToken(idToken(dasar()), 'klien-123', { keys: [] }, SEKARANG)
    expect(h.ok).toBe(false)
  })
})
