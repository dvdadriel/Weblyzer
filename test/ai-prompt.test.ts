import { expect, test } from 'vitest'
import { susunPrompt, type TemuanRingkas } from '../lib/ai/prompt.ts'
import type { Severity } from '../lib/findings.ts'

const BASE = 'https://uji.test'
const t = (severity: Severity, rule = 'aturan', url: string | null = `${BASE}/hal`): TemuanRingkas =>
  ({ category: 'bugs', severity, rule, title: `judul ${rule}`, url })

test('situs bersih mendapat instruksi yang berbeda', () => {
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan: [] })
  expect(p).toMatch(/tidak ada satu pun temuan terbuka/)
  expect(p).toMatch(/jangan mengarang temuan/i)
  expect(p).not.toMatch(/paling parah/)
})

test('rekap severity memakai urutan keparahan, bukan urutan kemunculan', () => {
  const p = susunPrompt({
    nama: 'Uji',
    baseUrl: BASE,
    temuan: [t('low'), t('critical'), t('medium'), t('critical')],
  })
  expect(p).toMatch(/4 temuan terbuka: 2 critical, 1 medium, 1 low\./)
})

test('domain dibuang dari URL, hanya jalurnya yang dikirim', () => {
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan: [t('high', 'a', `${BASE}/x/y?q=1`)] })
  expect(p).toMatch(/\(\/x\/y\?q=1\)/)
  expect(p).not.toMatch(/https:\/\/uji\.test\/x/)
})

test('temuan tanpa halaman disebut sebagai seluruh situs', () => {
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan: [t('medium', 'header', null)] })
  expect(p).toMatch(/\(seluruh situs\)/)
})

/**
 * Yang terpotong harus selalu yang paling ringan. Kalau tidak, satu situs
 * dengan 200 temuan low bisa menyembunyikan critical-nya dari ringkasan hanya
 * karena critical itu kebetulan berada di akhir tabel.
 */
test('yang dikutip adalah yang paling parah, bukan yang paling awal', () => {
  const temuan = [
    ...Array.from({ length: 40 }, () => t('low', 'remeh')),
    t('critical', 'penting'),
  ]
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan })
  expect(p).toMatch(/bugs\/penting/)
})

test('jumlah yang tidak dikutip disebut, bukan disembunyikan', () => {
  const temuan = Array.from({ length: 40 }, () => t('low'))
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan })
  expect(p).toMatch(/15 temuan lain tidak dikutip/)
  expect(p).toMatch(/jangan mengaku sudah melihat semuanya/)
})

test('daftar yang lengkap dinyatakan lengkap', () => {
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan: [t('high')] })
  expect(p).toMatch(/Berikut seluruh temuannya/)
  expect(p).toMatch(/Daftar di atas lengkap/)
  expect(p).not.toMatch(/tidak dikutip/)
})

test('kutipan dibatasi 25 baris walau temuannya ratusan', () => {
  const temuan = Array.from({ length: 300 }, () => t('high'))
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan })
  expect(p.split('\n').filter((l) => l.startsWith('- [')).length).toBe(25)
})

test('URL raksasa dipotong', () => {
  const p = susunPrompt({
    nama: 'Uji',
    baseUrl: BASE,
    temuan: [t('high', 'a', `${BASE}/${'x'.repeat(400)}`)],
  })
  expect(p).toMatch(/…\)/)
  expect(p.length).toBeLessThan(2000)
})

test('larangan mengarang selalu ikut terkirim', () => {
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan: [t('high')] })
  expect(p).toMatch(/Jangan menyebut temuan yang tidak ada di daftar/)
  expect(p).toMatch(/Jangan mengarang URL/)
})
