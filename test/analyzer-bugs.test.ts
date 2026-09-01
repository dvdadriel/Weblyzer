import { test, expect } from 'vitest'
import { analyzeBugs } from '../lib/analyzers/bugs.ts'
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
    console: [],
    pageErrors: [],
    failedRequests: [],
    resources: [],
    responseHeaders: {},
    ...patch,
  }
}

test('halaman sehat tidak menghasilkan temuan', () => {
  expect(analyzeBugs([pageVisit()])).toEqual([])
})

test('status 404 menjadi temuan high', () => {
  const [f] = analyzeBugs([pageVisit({ statusCode: 404 })])
  expect(f?.rule).toBe('http-error')
  expect(f?.severity).toBe('high')
  expect(f?.url).toBe('https://a.test/x')
})

test('status 500 menjadi temuan critical', () => {
  const [f] = analyzeBugs([pageVisit({ statusCode: 500 })])
  expect(f?.rule).toBe('http-error')
  expect(f?.severity).toBe('critical')
})

test('redirect loop dikenali dari pesan error, bukan dari status', () => {
  const findings = analyzeBugs([
    pageVisit({ statusCode: 0, error: 'page.goto: net::ERR_TOO_MANY_REDIRECTS at ...' }),
  ])
  expect(findings.map((f) => f.rule)).toEqual(['redirect-loop'])
  expect(findings[0]!.severity).toBe('critical')
})

test('halaman gagal dimuat tanpa sebab redirect menjadi http-error critical', () => {
  const findings = analyzeBugs([
    pageVisit({ statusCode: 0, error: 'page.goto: net::ERR_CONNECTION_REFUSED at ...' }),
  ])
  expect(findings.map((f) => f.rule)).toEqual(['http-error'])
  expect(findings[0]!.severity).toBe('critical')
})

test('rantai redirect panjang dilaporkan sebagai low', () => {
  const findings = analyzeBugs([
    pageVisit({
      redirects: [
        { url: 'https://a.test/1', status: 301 },
        { url: 'https://a.test/2', status: 301 },
        { url: 'https://a.test/3', status: 302 },
      ],
    }),
  ])
  expect(findings.map((f) => f.rule)).toEqual(['redirect-chain'])
  expect(findings[0]!.severity).toBe('low')
})

test('satu redirect tunggal bukan temuan', () => {
  const findings = analyzeBugs([
    pageVisit({ redirects: [{ url: 'https://a.test/1', status: 301 }] }),
  ])
  expect(findings).toEqual([])
})

test('resource rusak menjadi satu temuan per resource', () => {
  const findings = analyzeBugs([
    pageVisit({
      resources: [
        { url: 'https://a.test/ok.png', status: 200, resourceType: 'image' },
        { url: 'https://a.test/hilang.png', status: 404, resourceType: 'image' },
        { url: 'https://a.test/rusak.js', status: 500, resourceType: 'script' },
      ],
    }),
  ])
  expect(findings).toHaveLength(2)
  expect(findings.every((f) => f.rule === 'broken-resource')).toBe(true)
  expect(new Set(findings.map((f) => f.key)).size).toBe(2)
})

test('halaman 200 yang nyaris tanpa teks dilaporkan sebagai blank-page', () => {
  const findings = analyzeBugs([pageVisit({ textLength: 3 })])
  expect(findings.map((f) => f.rule)).toEqual(['blank-page'])
  expect(findings[0]!.severity).toBe('high')
})

test('halaman error tidak ikut dilaporkan sebagai blank-page', () => {
  const findings = analyzeBugs([pageVisit({ statusCode: 404, textLength: 0 })])
  expect(findings.map((f) => f.rule)).toEqual(['http-error'])
})

test('setiap temuan membawa pageId bila dipetakan', () => {
  const findings = analyzeBugs([pageVisit({ statusCode: 404 })], {
    'https://a.test/x': 42,
  })
  expect(findings[0]!.pageId).toBe(42)
})
