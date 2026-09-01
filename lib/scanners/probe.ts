import { connect, type PeerCertificate } from 'node:tls'

/**
 * Daftar tetap, sembilan entri, GET saja. Sengaja bukan wordlist yang bisa
 * tumbuh: alat ini melaporkan, bukan menembus. Menambah entri berarti menambah
 * satu permintaan ke situs produksi setiap malam, jadi setiap penambahan harus
 * dipertimbangkan, bukan disalin dari daftar orang lain.
 */
export const JALUR_SENSITIF = [
  '/.env',
  '/.env.local',
  '/.git/config',
  '/.git/HEAD',
  '/backup.sql',
  '/database.sql',
  '/wp-config.php.bak',
  '/.DS_Store',
  '/uploads/',
] as const

export type ExposedFile = {
  path: string
  status: number
  contentType: string
  snippet: string
}

export type TlsInfo = {
  validTo: string
  daysLeft: number
  issuer: string
}

export type ProbeResult = {
  exposed: ExposedFile[]
  directoryListing: string[]
  tls: TlsInfo | null
}

export type ProbeOptions = {
  timeoutMs?: number
  /** Jam saat pemeriksaan dianggap terjadi. Disuntikkan agar test deterministik. */
  now?: Date
}

const PENANDA_LISTING = [/<title>\s*Index of /i, /<h1>\s*Index of /i, /Directory listing for /i]

/**
 * Apakah respons ini benar-benar berisi file sensitif, atau cuma halaman HTML
 * biasa yang dibalas untuk path apa pun?
 *
 * Banyak SPA dan framework membalas 200 dengan index.html untuk rute yang tidak
 * dikenal. Tanpa pembedaan ini, setiap situs semacam itu menghasilkan sembilan
 * temuan critical palsu — dan temuan critical palsu adalah cara tercepat membuat
 * orang berhenti membuka tab Security.
 */
function benarBenarTerbuka(contentType: string, body: string): boolean {
  if (body.trim().length === 0) return false
  const html = contentType.includes('text/html') || /^\s*<!doctype html|^\s*<html/i.test(body)

  // HTML di jalur sensitif bukan file yang terbuka. File yang benar-benar
  // bocor (.env, .git/config, dump SQL) tidak pernah HTML, dan daftar direktori
  // sudah ditangani lewat PENANDA_LISTING sebelum sampai ke sini — jadi HTML di
  // sini artinya cuma halaman biasa yang dibalas untuk rute yang tidak dikenal.
  return !html
}

async function ambil(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; contentType: string; body: string } | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'web-audit-dashboard (pemeriksaan pasif situs sendiri)' },
    })
    const body = (await res.text()).slice(0, 4096)
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      body,
    }
  } catch {
    return null
  }
}

/**
 * Atribut nama X.509 boleh muncul berulang, jadi node mengetikkannya sebagai
 * `string | string[]`. Ambil yang pertama; untuk pelaporan itu sudah cukup.
 */
function satuNama(nilai: string | string[] | undefined): string | undefined {
  return Array.isArray(nilai) ? nilai[0] : nilai
}

async function periksaTls(host: string, timeoutMs: number, now: Date): Promise<TlsInfo | null> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host }, () => {
      const cert: PeerCertificate = socket.getPeerCertificate()
      socket.end()
      if (!cert.valid_to) {
        resolve(null)
        return
      }
      const validTo = new Date(cert.valid_to)
      resolve({
        validTo: cert.valid_to,
        daysLeft: Math.floor((validTo.getTime() - now.getTime()) / 86_400_000),
        issuer:
          satuNama(cert.issuer?.O) ?? satuNama(cert.issuer?.CN) ?? 'tidak diketahui',
      })
    })
    socket.setTimeout(timeoutMs, () => {
      socket.destroy()
      resolve(null)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(null)
    })
  })
}

/**
 * Permintaan langsung ke server, di luar browser. Mengumpulkan, tidak menilai —
 * `lib/analyzers/security.ts` yang menilai.
 *
 * Berurutan, bukan paralel: sembilan permintaan serentak ke situs produksi
 * sendiri tiap malam tidak perlu, dan berurutan membuat jejaknya sopan.
 */
export async function probeSite(baseUrl: string, opts: ProbeOptions = {}): Promise<ProbeResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000
  const now = opts.now ?? new Date()
  const base = new URL(baseUrl)

  const exposed: ExposedFile[] = []
  const directoryListing: string[] = []

  for (const path of JALUR_SENSITIF) {
    const hasil = await ambil(new URL(path, base).href, timeoutMs)
    if (!hasil) continue
    if (hasil.status < 200 || hasil.status >= 300) continue

    if (PENANDA_LISTING.some((p) => p.test(hasil.body))) {
      directoryListing.push(path)
      continue
    }
    if (benarBenarTerbuka(hasil.contentType, hasil.body)) {
      exposed.push({
        path,
        status: hasil.status,
        contentType: hasil.contentType,
        snippet: hasil.body.slice(0, 200),
      })
    }
  }

  const tls = base.protocol === 'https:' ? await periksaTls(base.hostname, timeoutMs, now) : null

  return { exposed, directoryListing, tls }
}
