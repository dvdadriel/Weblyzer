import { test, expect } from 'vitest'
import { analyzeLighthouse } from '../lib/analyzers/lighthouse.ts'
import type { LighthouseResult } from '../lib/scanners/lighthouse.ts'

function hasil(patch: Partial<LighthouseResult> = {}): LighthouseResult {
  return {
    url: 'https://a.test/',
    strategy: 'mobile',
    scores: { perf: 90, a11y: 90, bestPractices: 90, seo: 90 },
    audits: [],
    ...patch,
  }
}

const binary = (id: string) => ({ id, title: `Judul ${id}`, score: 0, displayMode: 'binary' })

test('hasil tanpa audit gagal tidak menghasilkan temuan', () => {
  expect(analyzeLighthouse([hasil()])).toEqual([])
})

test('audit binary yang gagal menjadi temuan', () => {
  const findings = analyzeLighthouse([hasil({ audits: [binary('image-alt')] })])
  expect(findings).toHaveLength(1)
  expect(findings[0]!.rule).toBe('lighthouse-audit')
  expect(findings[0]!.key).toContain('image-alt')
})

test('audit pengukuran tidak pernah menjadi temuan', () => {
  // Terbukti berfluktuasi antar run tanpa apa pun berubah di situs: melaporkannya
  // berarti belasan temuan ditandai fixed lalu dibuka lagi setiap malam.
  const findings = analyzeLighthouse([
    hasil({
      audits: [
        { id: 'largest-contentful-paint', title: 'LCP', score: 0.23, displayMode: 'numeric' },
        { id: 'total-byte-weight', title: 'Berat', score: 0.5, displayMode: 'metricSavings' },
        { id: 'speed-index', title: 'SI', score: 0.43, displayMode: 'numeric' },
      ],
    }),
  ])
  expect(findings).toEqual([])
})

test('strategy masuk ke key sehingga mobile dan desktop tidak saling menimpa', () => {
  const findings = analyzeLighthouse([
    hasil({ strategy: 'mobile', audits: [binary('image-alt')] }),
    hasil({ strategy: 'desktop', audits: [binary('image-alt')] }),
  ])
  expect(findings).toHaveLength(2)
  expect(new Set(findings.map((f) => f.key)).size).toBe(2)
  expect(findings.some((f) => f.key?.includes('mobile'))).toBe(true)
  expect(findings.some((f) => f.key?.includes('desktop'))).toBe(true)
})

test('severity mengikuti skor audit', () => {
  const nol = analyzeLighthouse([
    hasil({ audits: [{ id: 'a', title: 'A', score: 0, displayMode: 'binary' }] }),
  ])
  expect(nol[0]!.severity).toBe('medium')

  const separuh = analyzeLighthouse([
    hasil({ audits: [{ id: 'b', title: 'B', score: 0.5, displayMode: 'binary' }] }),
  ])
  expect(separuh[0]!.severity).toBe('low')
})

test('hasil yang error tidak menghasilkan temuan audit', () => {
  // Lighthouse mengembalikan laporan penuh dengan nol audit gagal saat halaman
  // tidak terjangkau. Melaporkan "tidak ada masalah" untuk halaman mati akan
  // menandai temuan lama sebagai sudah diperbaiki.
  const findings = analyzeLighthouse([
    hasil({ error: 'Lighthouse was unable to reliably load the page', audits: [] }),
  ])
  expect(findings).toEqual([])
})

test('hasil error tetap dilewati meski audit gagalnya ada', () => {
  const findings = analyzeLighthouse([
    hasil({ error: 'gagal muat', audits: [binary('image-alt')] }),
  ])
  expect(findings).toEqual([])
})

test('judul temuan menyebut strategy agar terbaca di daftar', () => {
  const findings = analyzeLighthouse([
    hasil({ strategy: 'desktop', audits: [binary('image-alt')] }),
  ])
  expect(findings[0]!.title.toLowerCase()).toContain('desktop')
})

test('temuan membawa pageId bila dipetakan', () => {
  const findings = analyzeLighthouse([hasil({ audits: [binary('image-alt')] })], {
    'https://a.test/': 5,
  })
  expect(findings[0]!.pageId).toBe(5)
})

test('daftar kosong menghasilkan temuan kosong', () => {
  expect(analyzeLighthouse([])).toEqual([])
})
