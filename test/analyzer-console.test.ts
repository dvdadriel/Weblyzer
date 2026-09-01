import { test, expect } from 'vitest'
import { analyzeConsole } from '../lib/analyzers/console.ts'
import type { PageVisit } from '../lib/scanners/visit.ts'

function pageVisit(patch: Partial<PageVisit> = {}): PageVisit {
  return {
    url: 'https://a.test/x',
    finalUrl: 'https://a.test/x',
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
    responseHeaders: {},
    setCookies: [],
    ...patch,
  }
}

test('halaman bersih tidak menghasilkan temuan', () => {
  expect(analyzeConsole([pageVisit()])).toEqual([])
})

test('console.error menjadi temuan high', () => {
  const [f] = analyzeConsole([
    pageVisit({ console: [{ level: 'error', text: 'Gagal memuat modul' }] }),
  ])
  expect(f?.rule).toBe('console-error')
  expect(f?.severity).toBe('high')
  expect(f?.title).toContain('Gagal memuat modul')
})

test('console.warn menjadi temuan low', () => {
  const [f] = analyzeConsole([
    pageVisit({ console: [{ level: 'warning', text: 'Atribut usang' }] }),
  ])
  expect(f?.rule).toBe('console-warning')
  expect(f?.severity).toBe('low')
})

test('uncaught exception menjadi temuan critical', () => {
  const [f] = analyzeConsole([pageVisit({ pageErrors: ['TypeError: x is not a function'] })])
  expect(f?.rule).toBe('uncaught-exception')
  expect(f?.severity).toBe('critical')
})

test('request gagal menjadi temuan medium, satu per URL', () => {
  const findings = analyzeConsole([
    pageVisit({
      failedRequests: [
        { url: 'https://a.test/a.json', resourceType: 'fetch', failure: 'net::ERR_FAILED' },
        { url: 'https://a.test/b.json', resourceType: 'fetch', failure: 'net::ERR_FAILED' },
      ],
    }),
  ])
  expect(findings).toHaveLength(2)
  expect(findings.every((f) => f.rule === 'failed-request')).toBe(true)
  expect(new Set(findings.map((f) => f.key)).size).toBe(2)
})

test('pesan identik pada satu halaman tidak digandakan', () => {
  const findings = analyzeConsole([
    pageVisit({
      console: [
        { level: 'error', text: 'Gagal memuat modul' },
        { level: 'error', text: 'Gagal memuat modul' },
      ],
    }),
  ])
  expect(findings).toHaveLength(1)
})

test('pesan yang hanya berbeda pada timestamp dianggap sama', () => {
  const findings = analyzeConsole([
    pageVisit({
      console: [
        { level: 'error', text: 'Request 1738291047123 gagal' },
        { level: 'error', text: 'Request 1738299999999 gagal' },
      ],
    }),
  ])
  expect(findings).toHaveLength(1)
})

test('error dan warning dengan teks sama tetap dua temuan berbeda', () => {
  const findings = analyzeConsole([
    pageVisit({
      console: [
        { level: 'error', text: 'sama' },
        { level: 'warning', text: 'sama' },
      ],
    }),
  ])
  expect(findings.map((f) => f.rule).sort()).toEqual(['console-error', 'console-warning'])
})

test('halaman yang gagal dimuat tidak dilaporkan konsolnya', () => {
  const findings = analyzeConsole([
    pageVisit({ statusCode: 0, console: [{ level: 'error', text: 'apa pun' }] }),
  ])
  expect(findings).toEqual([])
})

test('gaung Chromium tentang resource gagal tidak diulang di tab konsol', () => {
  const findings = analyzeConsole([
    pageVisit({
      console: [
        {
          level: 'error',
          text: 'Failed to load resource: the server responded with a status of 500 ()',
        },
        { level: 'error', text: 'Kesalahan sungguhan dari situs' },
      ],
    }),
  ])
  expect(findings).toHaveLength(1)
  expect(findings[0]!.title).toContain('Kesalahan sungguhan')
})

test('permintaan pihak ketiga yang gagal tidak dilaporkan', () => {
  const findings = analyzeConsole([
    pageVisit({
      url: 'https://a.test/x',
      failedRequests: [
        {
          url: 'https://analytics.google.com/g/collect?v=2',
          resourceType: 'fetch',
          failure: 'net::ERR_ABORTED',
        },
        {
          url: 'https://connect.facebook.net/log/error',
          resourceType: 'fetch',
          failure: 'net::ERR_BLOCKED_BY_ORB',
        },
      ],
    }),
  ])
  expect(findings).toEqual([])
})

test('permintaan situs sendiri yang gagal tetap dilaporkan', () => {
  const findings = analyzeConsole([
    pageVisit({
      url: 'https://a.test/x',
      failedRequests: [
        { url: 'https://a.test/api/data.json', resourceType: 'fetch', failure: 'net::ERR_FAILED' },
      ],
    }),
  ])
  expect(findings.map((f) => f.rule)).toEqual(['failed-request'])
})

test('temuan membawa pageId bila dipetakan', () => {
  const findings = analyzeConsole([pageVisit({ pageErrors: ['boom'] })], {
    'https://a.test/x': 7,
  })
  expect(findings[0]!.pageId).toBe(7)
})

test('peringatan dari lingkungan headless tidak dilaporkan', () => {
  // Kemunculannya bergantung GPU mesin, jadi kalau dilaporkan temuannya
  // berkedip antar scan dan hitungan "sudah diperbaiki" jadi berbohong.
  const findings = analyzeConsole([
    pageVisit({
      console: [
        { level: 'warning', text: 'No available adapters.' },
        { level: 'warning', text: 'WebGL: CONTEXT_LOST_WEBGL' },
      ],
    }),
  ])
  expect(findings).toEqual([])
})

test('peringatan yang memang salah situsnya tetap dilaporkan', () => {
  const findings = analyzeConsole([
    pageVisit({ console: [{ level: 'warning', text: "Unrecognized feature: 'web-share'." }] }),
  ])
  expect(findings.map((f) => f.rule)).toEqual(['console-warning'])
})
