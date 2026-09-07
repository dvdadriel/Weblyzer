import { expect, test } from 'vitest'
import { susunPrompt, kelompokkan, type TemuanRingkas } from '../lib/ai/prompt.ts'
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
test('masalah paling parah tetap terkutip walau tenggelam di antara yang remeh', () => {
  const temuan = [
    ...Array.from({ length: 40 }, (_, i) => t('low', `remeh-${i}`)),
    t('critical', 'penting'),
  ]
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan })
  expect(p).toMatch(/bugs\/penting/)
})

/**
 * Klaim yang dipilih menggantikan pemotongan 25-terparah: SELURUH temuan
 * terwakili. Empat puluh temuan low yang identik dulu menyisakan 15 yang tak
 * pernah dilihat model; sekarang jadi satu baris berisi angka 40.
 */
test('temuan identik menyatu, dan seluruhnya terwakili', () => {
  const temuan = Array.from({ length: 40 }, () => t('low'))
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan })
  expect(p).toMatch(/mencakup seluruh temuan situs ini/)
  expect(p).toMatch(/40 halaman/)
  expect(p).not.toMatch(/tidak terwakili/)
})

test('daftar lengkap dinyatakan lengkap, beserta jumlah masalahnya', () => {
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan: [t('high')] })
  expect(p).toMatch(/1 masalah berbeda, dan semuanya ada di bawah ini/)
  expect(p).toMatch(/mencakup seluruh temuan situs ini/)
  expect(p).not.toMatch(/tidak dikutip/)
})

test('ratusan masalah BERBEDA tetap dibatasi, dan sisanya disebut', () => {
  // Judul berbeda tiap temuan, jadi tidak ada yang bisa digabung — kasus
  // terburuk yang membuat BATAS_KELOMPOK masih perlu ada.
  const temuan = Array.from({ length: 300 }, (_, i) => t('high', `aturan-${i}`))
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan })
  expect(p.split('\n').filter((l) => l.startsWith('- [')).length).toBe(40)
  expect(p).toMatch(/260 temuan tidak terwakili/)
  expect(p).toMatch(/jangan mengaku sudah melihat semuanya/)
})

/* ── kelompokkan ─────────────────────────────────────────────────────────── */

/** Jaminan paling penting: penggabungan tidak boleh menelan satu temuan pun. */
test('jumlah seluruh kelompok selalu sama dengan jumlah temuan', () => {
  const temuan = [
    ...Array.from({ length: 22 }, (_, i) => t('medium', 'lh', `${BASE}/h${i % 6}`)),
    ...Array.from({ length: 6 }, (_, i) => t('critical', 'http-error', `${BASE}/p${i}`)),
    t('high', 'cookie', null),
  ]
  const k = kelompokkan(temuan, BASE)
  expect(k.reduce((n, g) => n + g.jumlah, 0)).toBe(temuan.length)
})

/**
 * Inti `judulTanpaUrl`. Tanpa ini situs dengan 200 halaman rusak menghasilkan
 * 200 kelompok, dan pengelompokan tidak menyelesaikan apa pun.
 */
test('URL di dalam judul tidak memecah satu masalah jadi banyak', () => {
  const temuan = [
    { category: 'bugs', severity: 'critical' as const, rule: 'http-error',
      title: `HTTP 500 pada ${BASE}/divan`, url: `${BASE}/divan` },
    { category: 'bugs', severity: 'critical' as const, rule: 'http-error',
      title: `HTTP 500 pada ${BASE}/headboard`, url: `${BASE}/headboard` },
  ]
  const k = kelompokkan(temuan, BASE)
  expect(k).toHaveLength(1)
  expect(k[0]?.jumlah).toBe(2)
  expect(k[0]?.judul).toBe('HTTP 500')
  expect(k[0]?.contoh).toEqual(['/divan', '/headboard'])
})

test('contoh URL dibatasi tapi jumlahnya tetap jujur', () => {
  const temuan = Array.from({ length: 20 }, (_, i) => t('high', 'a', `${BASE}/x${i}`))
  const k = kelompokkan(temuan, BASE)
  expect(k[0]?.jumlah).toBe(20)
  expect(k[0]?.contoh).toHaveLength(6)
  const p = susunPrompt({ nama: 'Uji', baseUrl: BASE, temuan })
  expect(p).toMatch(/\+14 lagi/)
})

test('severity kelompok adalah yang terparah di dalamnya', () => {
  const k = kelompokkan(
    [t('low', 'a', `${BASE}/1`), t('critical', 'a', `${BASE}/2`), t('medium', 'a', `${BASE}/3`)],
    BASE,
  )
  expect(k).toHaveLength(1)
  expect(k[0]?.severity).toBe('critical')
})

test('kelompok diurutkan parah dulu, lalu terbanyak halaman', () => {
  const temuan = [
    ...Array.from({ length: 5 }, (_, i) => t('medium', 'banyak', `${BASE}/m${i}`)),
    t('medium', 'sedikit', `${BASE}/s`),
    t('critical', 'parah', `${BASE}/c`),
  ]
  const k = kelompokkan(temuan, BASE)
  expect(k.map((g) => g.rule)).toEqual(['parah', 'banyak', 'sedikit'])
})

test('URL yang sama tidak dicatat dua kali sebagai contoh', () => {
  const k = kelompokkan([t('high', 'a', `${BASE}/sama`), t('high', 'a', `${BASE}/sama`)], BASE)
  expect(k[0]?.jumlah).toBe(2)
  expect(k[0]?.contoh).toEqual(['/sama'])
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
