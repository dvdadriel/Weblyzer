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

test('CSP dengan frame-ancestors menggantikan X-Frame-Options', () => {
  const findings = analyzeSecurity(
    [
      pageVisit({
        responseHeaders: {
          ...HEADER_LENGKAP,
          'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
          'x-frame-options': undefined as unknown as string,
        },
      }),
    ],
    PROBE_BERSIH,
  )
  const keys = findings.filter((f) => f.rule === 'missing-security-header').map((f) => f.key)
  expect(keys).not.toContain('x-frame-options')
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

test('nilai cookie tidak pernah muncul di temuan', () => {
  const findings = analyzeSecurity(
    [pageVisit({ setCookies: ['sesi=RAHASIA_TOKEN_ABC123; Path=/'] })],
    PROBE_BERSIH,
  )
  const semua = JSON.stringify(findings)
  expect(semua).not.toContain('RAHASIA_TOKEN_ABC123')
  expect(semua).toContain('sesi')
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
