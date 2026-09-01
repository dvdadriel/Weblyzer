# Scanner Security — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan kategori temuan `security` — header yang hilang, cookie tanpa flag, mixed content, file sensitif yang publik, dan sertifikat TLS yang hampir kedaluwarsa — semuanya lewat pemeriksaan pasif.

**Architecture:** Dua sumber data. Header dan resource sudah dikumpulkan `visit` pada Rencana 2, jadi gratis. Sisanya butuh permintaan langsung ke server, yang ditangani `lib/scanners/probe.ts` memakai `fetch` dan `node:tls` bawaan Node — tanpa browser. Penilaiannya tetap di analyzer murni, seperti `bugs` dan `console`.

**Tech Stack:** Node 26 (`fetch` dan `node:tls` bawaan), `node:sqlite`, Vitest. Nol dependensi baru.

**Rencana sebelumnya:** `2026-09-01-fondasi-dan-crawl.md`, `2026-09-01-scanner-bugs-dan-console.md` (keduanya selesai — 97 test)
**Spec:** `2026-09-01-web-audit-dashboard-design.md`

---

## Batasan: pasif saja

Spec menetapkan pemeriksaan pasif, dan rencana ini memegangnya secara ketat:

- **Hanya GET**, tanpa payload, tanpa fuzzing, tanpa brute force, tanpa percobaan login.
- **Daftar path tetap dan pendek** — sembilan path yang sudah ditentukan di kode, bukan wordlist yang bisa tumbuh.
- **Tanpa injeksi.** Tidak ada percobaan XSS, SQLi, atau path traversal. Menembakkan payload ke situs produksi sendiri berisiko merusak data nyata, dan mendeteksi kerentanan bukan tujuan alat ini — memberi laporan yang bisa ditindak adalah tujuannya.
- **Satu permintaan per path, berurutan**, dengan timeout. Sembilan permintaan tambahan per situs per scan.

Yang **tidak** dibangun di rencana ini, beserta alasannya:

- **Library JS rentan.** Butuh basis data versi→CVE yang harus diperbarui terus (retire.js atau setara). Itu dependensi baru plus data yang bisa basi tanpa terasa, dan laporan "jQuery 1.9 rentan" tanpa CVE yang benar justru menyesatkan. Ditunda sampai ada rencana tersendiri.
- **Pemindaian port, enumerasi subdomain, pengujian konfigurasi TLS (cipher, protokol).** Di luar cakupan alat audit halaman.

## Struktur File

| File | Tanggung jawab |
|---|---|
| `lib/scanners/probe.ts` | Permintaan langsung ke server: path sensitif dan sertifikat TLS. Tanpa browser, tanpa database. |
| `lib/analyzers/security.ts` | `PageVisit[]` + `ProbeResult` → temuan kategori `security` |
| `lib/scanners/visit.ts` | Ditambah `setCookies: string[]` per halaman |
| `lib/jobs/scan.ts` | Kategori ketiga, dengan probe dijalankan sekali per pemindaian |
| `scripts/scan.ts` | `scan <id> security` |

## Aturan yang dibangun

| Rule | Severity | Pemicu | Sumber |
|---|---|---|---|
| `exposed-file` | critical | Path sensitif membalas 2xx dengan isi yang masuk akal | probe |
| `directory-listing` | high | Respons memuat penanda daftar direktori | probe |
| `tls-expiring` | critical < 7 hari, high < 30 hari | Sertifikat hampir kedaluwarsa | probe |
| `mixed-content` | high | Halaman https memuat resource http | visit |
| `insecure-cookie` | high tanpa `Secure`, medium tanpa `HttpOnly`, low tanpa `SameSite` | Set-Cookie di halaman https | visit |
| `missing-security-header` | medium untuk CSP/HSTS/X-Frame-Options, low untuk X-Content-Type-Options/Referrer-Policy | Header tidak ada | visit |

### Cakupan pelaporan — bagian yang paling mudah bikin banjir

Header bersifat server-wide. Melaporkan "CSP hilang" pada 141 halaman berarti 141 temuan untuk satu masalah, dan tab Security langsung tidak terpakai.

Karena itu:

- **Header dan cookie dinilai hanya pada halaman akar** (`visits[0]`). Satu situs → paling banyak 5 temuan header. Konsekuensi yang diterima: bila satu subbagian punya header berbeda dari akar, itu tidak terlihat. Ditukar dengan tab yang bisa dibaca.
- **Mixed content dinilai per halaman**, karena setiap halaman memuat resource yang berbeda — di sinilah temuan per halaman memang bermakna. `key` berisi URL resource-nya.
- **Probe dijalankan sekali per pemindaian**, bukan per halaman.

---

## Task 1: Probe — permintaan langsung ke server

**Files:**
- Create: `lib/scanners/probe.ts`
- Test: `test/probe.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/probe.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { createServer } from 'node:http'
import { probeSite, JALUR_SENSITIF } from '../lib/scanners/probe.ts'

async function serverDengan(handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

test('daftar jalur sensitif tetap dan pendek', () => {
  expect(JALUR_SENSITIF.length).toBeLessThanOrEqual(12)
  expect(JALUR_SENSITIF).toContain('/.env')
  expect(JALUR_SENSITIF).toContain('/.git/config')
})

test('situs bersih tidak menghasilkan temuan probe', async () => {
  const server = await serverDengan((_req, res) => {
    res.writeHead(404, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>404</title>')
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.exposed).toEqual([])
    expect(hasil.directoryListing).toEqual([])
  } finally {
    await server.close()
  }
})

test('file .env yang terbuka terdeteksi beserta isinya yang dipotong', async () => {
  const server = await serverDengan((req, res) => {
    if (req.url === '/.env') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('DB_PASSWORD=rahasia\nAPI_KEY=abc123\n')
      return
    }
    res.writeHead(404).end()
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.exposed.map((e) => e.path)).toEqual(['/.env'])
    expect(hasil.exposed[0]!.snippet).toContain('DB_PASSWORD')
    expect(hasil.exposed[0]!.snippet.length).toBeLessThanOrEqual(200)
  } finally {
    await server.close()
  }
})

test('halaman HTML biasa di jalur sensitif tidak dianggap terbuka', async () => {
  // Banyak SPA membalas 200 dengan index.html untuk path apa pun. Kalau tidak
  // dibedakan, setiap situs semacam itu menghasilkan sembilan temuan critical palsu.
  const server = await serverDengan((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><html><head><title>Aplikasi</title></head><body><div id="root"></div></body></html>')
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.exposed).toEqual([])
  } finally {
    await server.close()
  }
})

test('daftar direktori terdeteksi dari penanda khasnya', async () => {
  const server = await serverDengan((req, res) => {
    if (req.url === '/uploads/') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><head><title>Index of /uploads</title></head><body><h1>Index of /uploads</h1><pre><a href="../">../</a></pre></body></html>')
      return
    }
    res.writeHead(404).end()
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.directoryListing).toEqual(['/uploads/'])
  } finally {
    await server.close()
  }
})

test('respons kosong pada jalur sensitif tidak dianggap terbuka', async () => {
  const server = await serverDengan((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('')
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.exposed).toEqual([])
  } finally {
    await server.close()
  }
})

test('server yang mati tidak melempar, hanya melaporkan tanpa temuan', async () => {
  const hasil = await probeSite('http://127.0.0.1:1', { timeoutMs: 500 })
  expect(hasil.exposed).toEqual([])
  expect(hasil.tls).toBeNull()
})

test('situs http tidak diperiksa sertifikatnya', async () => {
  const server = await serverDengan((_req, res) => {
    res.writeHead(404).end()
  })
  try {
    const hasil = await probeSite(server.url)
    expect(hasil.tls).toBeNull()
  } finally {
    await server.close()
  }
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/probe.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/scanners/probe.ts'`

- [ ] **Step 3: Tulis `lib/scanners/probe.ts`**

```typescript
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
  // HTML di jalur sensitif bukan file terbuka. Daftar direktori — satu-satunya
  // HTML yang memang bermakna di sini — sudah ditangkap PENANDA_LISTING sebelum
  // fungsi ini dipanggil. Terbukti hidup: springair.co.id membalas 200 dengan
  // homepage-nya untuk /.env dan /.DS_Store; tanpa pembedaan ini situs itu
  // menghasilkan dua temuan critical palsu setiap malam.
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
        issuer: cert.issuer?.O ?? cert.issuer?.CN ?? 'tidak diketahui',
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
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/probe.test.ts`
Diharapkan: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add lib/scanners/probe.ts test/probe.test.ts
git commit -m "Ask the server directly about nine specific paths

Headers and resources already come free from the browser pass, but exposed
files and the TLS certificate do not. Nine fixed GET requests, no payloads,
no wordlist — this tool reports, it does not break in. A page of HTML served
for every unknown route is not an exposed file, or every SPA would produce
nine fake criticals."
```

---

## Task 2: Kumpulkan Set-Cookie di kunjungan

**Files:**
- Modify: `lib/scanners/visit.ts`
- Test: `test/visit.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `test/visit.test.ts`:

```typescript
test('merekam header Set-Cookie apa adanya, termasuk bila ada beberapa', async () => {
  const { createServer } = await import('node:http')
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/html',
      'set-cookie': ['sesi=abc; Path=/', 'pilihan=gelap; Path=/; SameSite=Lax'],
    })
    res.end('<!doctype html><title>Kue</title><h1>Halaman dengan dua cookie di sini</h1>')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port

  try {
    const [page] = await visit(`http://127.0.0.1:${port}`, { maxPages: 1 })
    expect(page!.setCookies).toHaveLength(2)
    expect(page!.setCookies.some((c) => c.startsWith('sesi='))).toBe(true)
    expect(page!.setCookies.some((c) => c.includes('SameSite=Lax'))).toBe(true)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/visit.test.ts`
Diharapkan: FAIL pada test baru — `setCookies` undefined.

- [ ] **Step 3: Ubah `lib/scanners/visit.ts`**

Tambahkan field ke `PageVisit`, tepat setelah `responseHeaders`:

```typescript
  /** Header Set-Cookie apa adanya, satu entri per cookie. Diambil dari
   *  `headersArray()` karena `headers()` tidak memuat Set-Cookie sama sekali. */
  setCookies: string[]
```

Tambahkan deklarasi bersama `let` lainnya:

```typescript
      let setCookies: string[] = []
```

Di dalam blok `if (response)`, setelah `responseHeaders = response.headers()`:

```typescript
          setCookies = (await response.headersArray())
            .filter((h) => h.name.toLowerCase() === 'set-cookie')
            .map((h) => h.value)
```

Dan tambahkan `setCookies,` ke objek yang di-push ke `results`.

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/visit.test.ts`
Diharapkan: seluruh test lulus.

Catatan: `headersArray()` mungkin sinkron di versi Playwright yang terpasang. Bila `await` menghasilkan galat tipe, buang `await`-nya dan sesuaikan — laporkan mana yang benar.

- [ ] **Step 5: Perbarui helper test analyzer**

Tambahkan `setCookies: []` ke default `pageVisit()` di `test/analyzer-bugs.test.ts` dan `test/analyzer-console.test.ts`.

- [ ] **Step 6: Jalankan seluruh test dan typecheck, lalu commit**

```bash
npm test && npx tsc --noEmit
git add lib/scanners/visit.ts test/visit.test.ts test/analyzer-bugs.test.ts test/analyzer-console.test.ts
git commit -m "Keep Set-Cookie headers separate

The flat headers object joins several Set-Cookie values into one string, and
once joined you can no longer tell which cookie is missing which flag."
```

---

## Task 3: Analyzer security

**Files:**
- Create: `lib/analyzers/security.ts`
- Test: `test/analyzer-security.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/analyzer-security.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { analyzeSecurity } from '../lib/analyzers/security.ts'
import type { PageVisit } from '../lib/scanners/visit.ts'
import type { ProbeResult } from '../lib/scanners/probe.ts'

const HEADER_LENGKAP = {
  'content-security-policy': "default-src 'self'",
  'strict-transport-security': 'max-age=31536000',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

function pageVisit(patch: Partial<PageVisit> = {}): PageVisit {
  return {
    url: 'https://a.test/',
    finalUrl: 'https://a.test/',
    statusCode: 200,
    redirects: [],
    loadMs: 100,
    links: [],
    title: 'Judul',
    textLength: 500,
    mediaCount: 0,
    console: [],
    pageErrors: [],
    failedRequests: [],
    resources: [],
    responseHeaders: { ...HEADER_LENGKAP },
    setCookies: [],
    ...patch,
  }
}

const PROBE_BERSIH: ProbeResult = { exposed: [], directoryListing: [], tls: null }

test('situs dengan header lengkap dan probe bersih tidak menghasilkan temuan', () => {
  expect(analyzeSecurity([pageVisit()], PROBE_BERSIH)).toEqual([])
})

test('header keamanan yang hilang dilaporkan sekali per header', () => {
  const findings = analyzeSecurity([pageVisit({ responseHeaders: {} })], PROBE_BERSIH)
  const rules = findings.filter((f) => f.rule === 'missing-security-header')
  expect(rules).toHaveLength(5)
  expect(new Set(rules.map((f) => f.key)).size).toBe(5)
})

test('header dinilai hanya di halaman akar, bukan tiap halaman', () => {
  const findings = analyzeSecurity(
    [
      pageVisit({ url: 'https://a.test/', responseHeaders: {} }),
      pageVisit({ url: 'https://a.test/b', responseHeaders: {} }),
      pageVisit({ url: 'https://a.test/c', responseHeaders: {} }),
    ],
    PROBE_BERSIH,
  )
  expect(findings.filter((f) => f.rule === 'missing-security-header')).toHaveLength(5)
})

test('HSTS tidak dituntut pada situs http', () => {
  const findings = analyzeSecurity(
    [pageVisit({ url: 'http://a.test/', responseHeaders: {} })],
    PROBE_BERSIH,
  )
  const keys = findings.filter((f) => f.rule === 'missing-security-header').map((f) => f.key)
  expect(keys).not.toContain('strict-transport-security')
  expect(keys).toContain('content-security-policy')
})

test('cookie tanpa Secure di situs https dilaporkan high', () => {
  const findings = analyzeSecurity(
    [pageVisit({ setCookies: ['sesi=abc; Path=/; HttpOnly; SameSite=Lax'] })],
    PROBE_BERSIH,
  )
  const f = findings.find((x) => x.rule === 'insecure-cookie')
  expect(f?.severity).toBe('high')
  expect(f?.title).toContain('Secure')
})

test('cookie tanpa HttpOnly dilaporkan medium, tanpa SameSite low', () => {
  const findings = analyzeSecurity(
    [pageVisit({ setCookies: ['a=1; Secure; SameSite=Lax', 'b=2; Secure; HttpOnly'] })],
    PROBE_BERSIH,
  ).filter((f) => f.rule === 'insecure-cookie')
  const bySeverity = new Map(findings.map((f) => [f.severity, f]))
  expect(bySeverity.has('medium')).toBe(true)
  expect(bySeverity.has('low')).toBe(true)
})

test('cookie yang lengkap flagnya tidak dilaporkan', () => {
  const findings = analyzeSecurity(
    [pageVisit({ setCookies: ['a=1; Secure; HttpOnly; SameSite=Strict'] })],
    PROBE_BERSIH,
  )
  expect(findings).toEqual([])
})

test('mixed content dilaporkan per resource dan per halaman', () => {
  const findings = analyzeSecurity(
    [
      pageVisit({
        url: 'https://a.test/',
        resources: [
          { url: 'http://a.test/gambar.png', status: 200, resourceType: 'image' },
          { url: 'http://cdn.lain.test/skrip.js', status: 200, resourceType: 'script' },
          { url: 'https://a.test/aman.css', status: 200, resourceType: 'stylesheet' },
        ],
      }),
    ],
    PROBE_BERSIH,
  ).filter((f) => f.rule === 'mixed-content')
  expect(findings).toHaveLength(2)
  expect(findings.every((f) => f.severity === 'high')).toBe(true)
  expect(new Set(findings.map((f) => f.key)).size).toBe(2)
})

test('halaman http tidak dilaporkan mixed content', () => {
  const findings = analyzeSecurity(
    [
      pageVisit({
        url: 'http://a.test/',
        responseHeaders: { ...HEADER_LENGKAP },
        resources: [{ url: 'http://a.test/gambar.png', status: 200, resourceType: 'image' }],
      }),
    ],
    PROBE_BERSIH,
  )
  expect(findings.filter((f) => f.rule === 'mixed-content')).toEqual([])
})

test('file terbuka dilaporkan critical', () => {
  const findings = analyzeSecurity([pageVisit()], {
    exposed: [
      { path: '/.env', status: 200, contentType: 'text/plain', snippet: 'DB_PASSWORD=rahasia' },
    ],
    directoryListing: [],
    tls: null,
  })
  const f = findings.find((x) => x.rule === 'exposed-file')
  expect(f?.severity).toBe('critical')
  expect(f?.key).toBe('/.env')
})

test('isi file terbuka tidak ikut disimpan mentah di judul', () => {
  const findings = analyzeSecurity([pageVisit()], {
    exposed: [
      { path: '/.env', status: 200, contentType: 'text/plain', snippet: 'DB_PASSWORD=rahasia' },
    ],
    directoryListing: [],
    tls: null,
  })
  const f = findings.find((x) => x.rule === 'exposed-file')!
  expect(f.title).not.toContain('rahasia')
})

test('daftar direktori dilaporkan high', () => {
  const findings = analyzeSecurity([pageVisit()], {
    exposed: [],
    directoryListing: ['/uploads/'],
    tls: null,
  })
  const f = findings.find((x) => x.rule === 'directory-listing')
  expect(f?.severity).toBe('high')
})

test('sertifikat yang masih lama tidak dilaporkan', () => {
  const findings = analyzeSecurity([pageVisit()], {
    exposed: [],
    directoryListing: [],
    tls: { validTo: 'Nov 5 2026', daysLeft: 65, issuer: 'Let’s Encrypt' },
  })
  expect(findings.filter((f) => f.rule === 'tls-expiring')).toEqual([])
})

test('sertifikat kurang dari 30 hari high, kurang dari 7 hari critical', () => {
  const h = analyzeSecurity([pageVisit()], {
    exposed: [],
    directoryListing: [],
    tls: { validTo: 'x', daysLeft: 20, issuer: 'X' },
  }).find((f) => f.rule === 'tls-expiring')
  expect(h?.severity).toBe('high')

  const c = analyzeSecurity([pageVisit()], {
    exposed: [],
    directoryListing: [],
    tls: { validTo: 'x', daysLeft: 3, issuer: 'X' },
  }).find((f) => f.rule === 'tls-expiring')
  expect(c?.severity).toBe('critical')
})

test('kunjungan kosong tidak melempar', () => {
  expect(analyzeSecurity([], PROBE_BERSIH)).toEqual([])
})

test('temuan membawa pageId bila dipetakan', () => {
  const findings = analyzeSecurity([pageVisit({ responseHeaders: {} })], PROBE_BERSIH, {
    'https://a.test/': 9,
  })
  expect(findings[0]!.pageId).toBe(9)
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/analyzer-security.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/analyzers/security.ts'`

- [ ] **Step 3: Tulis `lib/analyzers/security.ts`**

```typescript
import type { NewFinding, Severity } from '../findings.ts'
import type { PageVisit } from '../scanners/visit.ts'
import type { ProbeResult } from '../scanners/probe.ts'
import type { PageIdMap } from './bugs.ts'

type AturanHeader = {
  nama: string
  severity: Severity
  /** Hanya bermakna pada https. */
  httpsSaja: boolean
  penjelasan: string
}

const HEADER: AturanHeader[] = [
  {
    nama: 'content-security-policy',
    severity: 'medium',
    httpsSaja: false,
    penjelasan: 'membatasi sumber skrip dan gaya yang boleh dimuat',
  },
  {
    nama: 'strict-transport-security',
    severity: 'medium',
    httpsSaja: true,
    penjelasan: 'memaksa browser tetap memakai https',
  },
  {
    nama: 'x-frame-options',
    severity: 'medium',
    httpsSaja: false,
    penjelasan: 'mencegah halaman disematkan di situs lain',
  },
  {
    nama: 'x-content-type-options',
    severity: 'low',
    httpsSaja: false,
    penjelasan: 'mencegah browser menebak tipe konten',
  },
  {
    nama: 'referrer-policy',
    severity: 'low',
    httpsSaja: false,
    penjelasan: 'membatasi URL yang dibocorkan ke situs tujuan',
  },
]

function punyaHeader(v: PageVisit, nama: string): boolean {
  if (v.responseHeaders[nama] !== undefined) return true
  // CSP dengan frame-ancestors menggantikan X-Frame-Options.
  if (nama === 'x-frame-options') {
    return (v.responseHeaders['content-security-policy'] ?? '').includes('frame-ancestors')
  }
  return false
}

/** Nama cookie saja, tanpa nilainya — nilai cookie itu kredensial. */
function namaCookie(setCookie: string): string {
  return setCookie.split('=')[0]?.trim() ?? '(tanpa nama)'
}

function punyaFlag(setCookie: string, flag: string): boolean {
  return setCookie
    .split(';')
    .some((bagian) => bagian.trim().toLowerCase().startsWith(flag.toLowerCase()))
}

/**
 * Menilai hasil kunjungan dan probe sebagai temuan keamanan pasif. Fungsi murni:
 * tidak menyentuh browser, jaringan, maupun database.
 *
 * Header dan cookie dinilai hanya pada halaman akar. Keduanya bersifat
 * server-wide, jadi menilainya per halaman berarti satu masalah menjadi 141
 * temuan dan tabnya langsung tidak terpakai. Mixed content sebaliknya dinilai
 * per halaman, karena setiap halaman memuat resource yang berbeda.
 */
export function analyzeSecurity(
  visits: PageVisit[],
  probe: ProbeResult,
  pageIds: PageIdMap = {},
): NewFinding[] {
  const findings: NewFinding[] = []
  const akar = visits[0]

  if (akar !== undefined) {
    const pageId = pageIds[akar.url] ?? null
    const https = akar.url.startsWith('https://')

    for (const aturan of HEADER) {
      if (aturan.httpsSaja && !https) continue
      if (punyaHeader(akar, aturan.nama)) continue
      findings.push({
        url: akar.url,
        pageId,
        key: aturan.nama,
        severity: aturan.severity,
        rule: 'missing-security-header',
        title: `Header ${aturan.nama} tidak ada — ${aturan.penjelasan}`,
        detail: { header: aturan.nama },
      })
    }

    for (const setCookie of akar.setCookies) {
      const nama = namaCookie(setCookie)
      const kurang: { flag: string; severity: Severity }[] = []
      if (https && !punyaFlag(setCookie, 'Secure')) {
        kurang.push({ flag: 'Secure', severity: 'high' })
      }
      if (!punyaFlag(setCookie, 'HttpOnly')) kurang.push({ flag: 'HttpOnly', severity: 'medium' })
      if (!punyaFlag(setCookie, 'SameSite')) kurang.push({ flag: 'SameSite', severity: 'low' })

      for (const k of kurang) {
        findings.push({
          url: akar.url,
          pageId,
          key: `${nama}\n${k.flag}`,
          severity: k.severity,
          rule: 'insecure-cookie',
          title: `Cookie ${nama} tanpa flag ${k.flag}`,
          // Nilai cookie sengaja tidak disimpan — itu kredensial.
          detail: { cookie: nama, flag: k.flag },
        })
      }
    }
  }

  for (const v of visits) {
    if (!v.url.startsWith('https://')) continue
    const pageId = pageIds[v.url] ?? null
    for (const r of v.resources) {
      if (!r.url.startsWith('http://')) continue
      findings.push({
        url: v.url,
        pageId,
        key: r.url,
        severity: 'high',
        rule: 'mixed-content',
        title: `Halaman https memuat ${r.resourceType} lewat http: ${r.url}`,
        detail: { resourceUrl: r.url, resourceType: r.resourceType },
      })
    }
  }

  const pageIdAkar = akar === undefined ? null : pageIds[akar.url] ?? null
  const urlAkar = akar?.url ?? ''

  for (const e of probe.exposed) {
    findings.push({
      url: urlAkar,
      pageId: pageIdAkar,
      key: e.path,
      severity: 'critical',
      rule: 'exposed-file',
      // Cuplikan isinya masuk ke detail, tidak ke judul: judul muncul di daftar,
      // email notifikasi, dan file Excel yang diekspor.
      title: `File sensitif dapat diakses publik: ${e.path}`,
      detail: { path: e.path, status: e.status, contentType: e.contentType, snippet: e.snippet },
    })
  }

  for (const path of probe.directoryListing) {
    findings.push({
      url: urlAkar,
      pageId: pageIdAkar,
      key: path,
      severity: 'high',
      rule: 'directory-listing',
      title: `Daftar isi direktori terbuka: ${path}`,
      detail: { path },
    })
  }

  if (probe.tls !== null && probe.tls.daysLeft < 30) {
    findings.push({
      url: urlAkar,
      pageId: pageIdAkar,
      severity: probe.tls.daysLeft < 7 ? 'critical' : 'high',
      rule: 'tls-expiring',
      title: `Sertifikat TLS kedaluwarsa dalam ${probe.tls.daysLeft} hari`,
      detail: probe.tls,
    })
  }

  return findings
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/analyzer-security.test.ts`
Diharapkan: PASS, 16 test.

Catatan: `Severity` sudah diekspor dari `lib/findings.ts:4` — impor dari sana, jangan menyalin definisinya.

- [ ] **Step 5: Commit**

```bash
git add lib/analyzers/security.ts test/analyzer-security.test.ts
git commit -m "Add the security analyzer

Missing headers, cookies without their flags, https pages loading http
resources, exposed files, and a certificate about to expire. Headers are
judged on the root page only: they are server-wide, so judging them per page
would turn one problem into 141 findings and nobody would open the tab.
Cookie values are never stored — those are credentials."
```

---

## Task 4: Kategori ketiga di job dan CLI

**Files:**
- Modify: `lib/jobs/scan.ts`
- Modify: `scripts/scan.ts`
- Test: `test/scan-job.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `test/scan-job.test.ts`:

```typescript
test('pemindaian penuh mengisi tiga kategori', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    const summary = await jalankan(site.id)
    expect(summary).toEqual({ done: 1, failed: 0 })

    const kategori = db
      .prepare('SELECT DISTINCT category FROM findings ORDER BY category')
      .all() as { category: string }[]
    expect(kategori.map((k) => k.category)).toEqual(['bugs', 'console', 'security'])
  } finally {
    await server.close()
  }
})

test('only=security hanya merekonsiliasi kategori security', async () => {
  const server = await startFixtureServer('rusak-konsol')
  try {
    const site = createSite(db, { name: 'Berisik', base_url: server.url, max_pages: 5 })
    await jalankan(site.id, 'security')

    const kategori = db
      .prepare('SELECT DISTINCT category FROM findings')
      .all() as { category: string }[]
    expect(kategori.map((k) => k.category)).toEqual(['security'])
  } finally {
    await server.close()
  }
})

test('probe tidak menyentuh jalur sensitif ketika security tidak diminta', async () => {
  // Server sendiri yang mencatat setiap path yang diminta. Memeriksa "tidak ada
  // temuan security" saja tidak membuktikan apa pun — itu benar bahkan bila
  // sembilan permintaan tetap ditembakkan.
  const { createServer } = await import('node:http')
  const diminta: string[] = []
  const server = createServer((req, res) => {
    diminta.push(req.url ?? '')
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Situs</title><h1>Halaman biasa dengan cukup teks di sini</h1>')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port

  try {
    const site = createSite(db, {
      name: 'Sederhana',
      base_url: `http://127.0.0.1:${port}`,
      max_pages: 2,
    })
    await jalankan(site.id, 'bugs')
    expect(diminta.some((p) => p.startsWith('/.env'))).toBe(false)
    expect(diminta.some((p) => p.startsWith('/.git'))).toBe(false)

    diminta.length = 0
    await jalankan(site.id, 'security')
    expect(diminta.some((p) => p.startsWith('/.env'))).toBe(true)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/scan-job.test.ts`
Diharapkan: FAIL — kategori `security` belum ada.

- [ ] **Step 3: Ubah `lib/jobs/scan.ts`**

Struktur `ANALYZERS` sekarang tidak cukup, karena `analyzeSecurity` butuh argumen ketiga (`ProbeResult`) yang dua analyzer lain tidak punya. Ganti pendekatannya menjadi daftar kategori dengan fungsi penilai yang seragam:

```typescript
import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { upsertPage } from '../repos/pages.ts'
import { reconcile, type NewFinding } from '../findings.ts'
import { visit, type PageVisit } from '../scanners/visit.ts'
import { probeSite, type ProbeResult } from '../scanners/probe.ts'
import { analyzeBugs, type PageIdMap } from '../analyzers/bugs.ts'
import { analyzeConsole } from '../analyzers/console.ts'
import { analyzeSecurity } from '../analyzers/security.ts'

/** Kategori yang butuh permintaan langsung ke server, di luar kunjungan browser. */
const BUTUH_PROBE = new Set(['security'])

const KATEGORI = ['bugs', 'console', 'security'] as const
export type ScanCategory = (typeof KATEGORI)[number]

function nilai(
  category: ScanCategory,
  visits: PageVisit[],
  pageIds: PageIdMap,
  probe: ProbeResult | null,
): NewFinding[] {
  switch (category) {
    case 'bugs':
      return analyzeBugs(visits, pageIds)
    case 'console':
      return analyzeConsole(visits, pageIds)
    case 'security':
      return analyzeSecurity(visits, probe ?? { exposed: [], directoryListing: [], tls: null }, pageIds)
  }
}

/**
 * Satu kunjungan browser, lalu setiap analyzer menilai data yang sama.
 * Menjalankan tiga kategori berarti tiga rekonsiliasi, bukan tiga penjelajahan.
 *
 * Probe hanya dijalankan bila kategori yang diminta memerlukannya — memindai
 * bug seharusnya tidak menembakkan sembilan permintaan tambahan ke situs.
 */
export async function scanHandler(job: Job, db: DatabaseSync): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const only = job.payload.only === undefined ? undefined : String(job.payload.only)
  if (only !== undefined && !KATEGORI.includes(only as ScanCategory)) {
    throw new Error(`Kategori tidak dikenal: ${only}`)
  }
  const categories: ScanCategory[] = only === undefined ? [...KATEGORI] : [only as ScanCategory]

  const visits = await visit(site.base_url, { maxPages: site.max_pages })

  // Situs yang tidak terjangkau menghasilkan kunjungan kosong. Merekonsiliasi
  // hasil itu akan menandai setiap temuan lama sebagai "sudah diperbaiki" —
  // jawaban percaya diri yang salah. Lebih baik menggagalkan job.
  const root = visits[0]
  if (!root || root.statusCode === 0) {
    throw new Error(
      `Situs tidak terjangkau: ${site.base_url} — pemindaian dibatalkan agar temuan lama ` +
        `tidak salah ditandai sudah diperbaiki`,
    )
  }

  const probe = categories.some((c) => BUTUH_PROBE.has(c)) ? await probeSite(site.base_url) : null

  const pageIds: PageIdMap = {}
  for (const v of visits) {
    const stored = upsertPage(db, siteId, {
      url: v.url,
      statusCode: v.statusCode,
      loadMs: v.loadMs,
    })
    pageIds[v.url] = stored.id
  }

  for (const category of categories) {
    reconcile(db, siteId, job.run_id, category, nilai(category, visits, pageIds, probe))
  }
}
```

- [ ] **Step 4: Ubah `scripts/scan.ts`**

Perbarui validasi kategori pada case `scan`:

```typescript
      const only = args[1]
      if (only !== undefined && only !== 'bugs' && only !== 'console' && only !== 'security') {
        console.error(`Kategori tidak dikenal: ${only}. Pilih bugs, console, atau security.`)
        return 1
      }
```

dan `USAGE`:

```
  npm run scan -- scan <site-id> [kategori]  Memindai situs (kategori: bugs|console|security)
```

- [ ] **Step 5: Jalankan seluruh test dan typecheck**

Run: `npm test` dan `npx tsc --noEmit`
Diharapkan: keduanya bersih.

- [ ] **Step 6: Verifikasi terhadap situs sungguhan**

```bash
export DB_PATH=/private/tmp/claude-502/-Users-david-Documents-SEO-Analyzer/84165c2e-6cf4-4ccb-848f-aec1fe8f9fe7/scratchpad/p3.db
rm -f "$DB_PATH"
npm run scan -- add-site Springair https://springair.co.id
npm run scan -- scan 1 security
npm run scan -- scan 1 security
npm run scan -- findings 1
```

Laporkan keluaran lengkap kedua scan dan apakah jumlahnya identik. Bila ada temuan yang berkedip, laporkan mana.

- [ ] **Step 7: Commit**

```bash
git add lib/jobs/scan.ts scripts/scan.ts test/scan-job.test.ts
git commit -m "Add security as a third category

The probe only runs when security is actually asked for — scanning for bugs
should not fire nine extra requests at the site."
```

---

## Definisi Selesai

- [ ] `npm test` lulus seluruhnya dan `npx tsc --noEmit` bersih
- [ ] `npm run scan -- scan <id> security` mengisi kategori `security`
- [ ] Header dilaporkan sekali per header, bukan sekali per halaman
- [ ] Memindai dua kali menghasilkan jumlah temuan yang identik
- [ ] Nilai cookie tidak pernah tersimpan di database — hanya namanya
- [ ] Isi file terbuka tidak pernah muncul di judul temuan
- [ ] `probeSite` hanya melakukan GET, hanya ke sembilan path tetap
- [ ] Probe tidak dijalankan bila kategori `security` tidak diminta
- [ ] `lib/analyzers/security.ts` tidak mengimpor Playwright, `node:tls`, `fetch`, maupun modul database — dibuktikan dengan `grep`

## Rencana Berikutnya

4. **Lighthouse** — runner paralel, penganggaran `sample`/`full`. `strategy` **wajib** masuk ke `key` fingerprint, kalau tidak hasil mobile dan desktop saling menimpa.
5. **Lapisan AI** — spawn CLI `claude`/`gemini`, file prompt, `ai_status` beserta tampilannya di tiga tempat.
6. **SEO** — integrasi plugin `claude-seo`.
7. **UI** — tema vintage terminal via `impeccable` + `frontend-design`.
8. **Export Excel, scheduler, notifikasi email, Docker.**

Ditunda dengan sengaja, tercatat agar tidak terlupakan:
- **Library JS rentan** — butuh basis data versi→CVE; rencana tersendiri.
- **Form tanpa token CSRF.** Ada di spec, tetapi rawan lapor palsu: token bisa
  dikirim lewat header, formulir GET tidak membutuhkannya, dan aplikasi satu
  halaman mengirim lewat `fetch` tanpa field tersembunyi sama sekali. Pelajaran
  Rencana 2 jelas — satu aturan yang berkedip atau salah lapor merusak
  kepercayaan pada seluruh tab. Butuh pengumpulan data bentuk formulir di
  `visit` lebih dulu, lalu aturan yang dirancang dengan gerbang yang benar.
- **`CrawledPage.finalUrl` sudah ada, tetapi aturan "halaman pindah"** (301 permanen yang masih ditautkan internal) belum dibangun. Datanya siap.
