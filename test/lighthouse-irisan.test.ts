import { test, expect } from 'vitest'
import { irisanAudit } from '../lib/jobs/lighthouse.ts'
import type { LighthouseResult } from '../lib/scanners/lighthouse.ts'

const audit = (id: string) => ({ id, title: `Judul ${id}`, score: 0, displayMode: 'binary' })

function hasil(patch: Partial<LighthouseResult> = {}): LighthouseResult {
  return {
    url: 'https://a.test/',
    strategy: 'mobile',
    scores: { perf: 50, a11y: 50, bestPractices: 50, seo: 50 },
    audits: [],
    ...patch,
  }
}

test('hanya audit yang gagal di kedua pengukuran yang bertahan', () => {
  // Persis yang terjadi di lapangan: landmark-one-main muncul di satu
  // pengukuran homepage dan tidak di berikutnya.
  const [r] = irisanAudit(
    [hasil({ audits: [audit('image-alt'), audit('landmark-one-main')] })],
    [hasil({ audits: [audit('image-alt')] })],
  )
  expect(r!.audits.map((a) => a.id)).toEqual(['image-alt'])
})

test('audit yang hanya muncul di pengukuran kedua juga dibuang', () => {
  const [r] = irisanAudit(
    [hasil({ audits: [audit('image-alt')] })],
    [hasil({ audits: [audit('image-alt'), audit('errors-in-console')] })],
  )
  expect(r!.audits.map((a) => a.id)).toEqual(['image-alt'])
})

test('skor diambil dari pengukuran kedua, bukan dirata-rata', () => {
  const [r] = irisanAudit(
    [hasil({ scores: { perf: 30, a11y: 30, bestPractices: 30, seo: 30 } })],
    [hasil({ scores: { perf: 70, a11y: 70, bestPractices: 70, seo: 70 } })],
  )
  expect(r!.scores.perf).toBe(70)
})

test('gagal di salah satu pengukuran berarti gagal', () => {
  const a = irisanAudit([hasil({ error: 'gagal' })], [hasil({ audits: [audit('x')] })])
  expect(a[0]!.error).toBeDefined()

  const b = irisanAudit([hasil({ audits: [audit('x')] })], [hasil({ error: 'gagal' })])
  expect(b[0]!.error).toBeDefined()
})

test('mobile dan desktop dipasangkan terpisah', () => {
  const hasilnya = irisanAudit(
    [
      hasil({ strategy: 'mobile', audits: [audit('a'), audit('b')] }),
      hasil({ strategy: 'desktop', audits: [audit('a')] }),
    ],
    [
      hasil({ strategy: 'mobile', audits: [audit('a')] }),
      hasil({ strategy: 'desktop', audits: [audit('a')] }),
    ],
  )
  expect(hasilnya.find((r) => r.strategy === 'mobile')!.audits.map((a) => a.id)).toEqual(['a'])
  expect(hasilnya.find((r) => r.strategy === 'desktop')!.audits.map((a) => a.id)).toEqual(['a'])
})

test('target yang tidak ada di pengukuran kedua dibiarkan apa adanya', () => {
  const [r] = irisanAudit([hasil({ audits: [audit('a')] })], [])
  expect(r!.audits.map((a) => a.id)).toEqual(['a'])
})
