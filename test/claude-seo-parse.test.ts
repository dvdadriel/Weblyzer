import { test, expect } from 'vitest'
import { bacaTemuan, normalkanRule, cabutJson, BATAS_TEMUAN } from '../lib/claude-seo/parse.ts'
import { fingerprintOf } from '../lib/findings.ts'

const BASE = 'https://uji.test'
const HALAMAN = new Map([
  ['https://uji.test/', 1],
  ['https://uji.test/produk', 2],
])

const json = (temuan: unknown[]) => JSON.stringify({ temuan })

/* ── normalkanRule: di sinilah §2.1 berdiri atau jatuh ──────────────────── */

test('nama aturan yang variasinya wajar runtuh ke nilai yang sama', () => {
  const sama = ['llms-txt-hilang', 'LLMs-TXT-Hilang', 'llms_txt_hilang', 'llms txt hilang']
  const hasil = new Set(sama.map(normalkanRule))
  expect(hasil.size).toBe(1)
  expect([...hasil][0]).toBe('llms-txt-hilang')
})

/**
 * Model suka menyelipkan hitungan ke nama aturan. Hitungan itu berubah tiap
 * run sementara masalahnya sama — dan karena nama aturan masuk fingerprint,
 * temuan yang sama akan menandai dirinya beres lalu terbuka sebagai baru.
 */
test('angka dibuang dari nama aturan', () => {
  expect(normalkanRule('judul-pendek-12-halaman')).toBe('judul-pendek-halaman')
  expect(normalkanRule('judul-pendek-40-halaman')).toBe('judul-pendek-halaman')
  expect(normalkanRule('judul-pendek-12-halaman')).toBe(normalkanRule('judul-pendek-40-halaman'))
  expect(normalkanRule('csp-2026')).toBe('csp')
})

test('nama aturan tidak pernah berakhir atau berawal dengan tanda hubung', () => {
  expect(normalkanRule('--aneh--')).toBe('aneh')
  expect(normalkanRule('masalah-1')).toBe('masalah')
  expect(normalkanRule('  spasi  ')).toBe('spasi')
})

test('kalimat yang menyusup dipotong, tidak jadi identitas sepanjang paragraf', () => {
  const panjang = normalkanRule('a'.repeat(200))
  expect(panjang.length).toBeLessThanOrEqual(60)
})

test('nama aturan yang seluruhnya angka jadi kosong dan temuannya dilewati', () => {
  expect(normalkanRule('12345')).toBe('')
  const h = bacaTemuan(json([{ rule: '12345', severity: 'low', title: 'X' }]), HALAMAN, BASE)
  expect(h.ok && h.temuan).toHaveLength(0)
})

/**
 * Klaim inti fitur ini: judul dan detail adalah prosa model dan PASTI berbeda
 * antar run. Kalau keduanya ikut menentukan identitas, setiap analisis akan
 * menutup seluruh temuan lama dan membuka salinannya sebagai temuan baru.
 */
test('judul yang berubah TIDAK mengubah identitas temuan', () => {
  const run1 = bacaTemuan(
    json([{ rule: 'llms-txt-hilang', severity: 'low', title: 'Situs tidak punya llms.txt', url: `${BASE}/` }]),
    HALAMAN,
    BASE,
  )
  const run2 = bacaTemuan(
    json([{ rule: 'llms-txt-hilang', severity: 'medium', title: 'Berkas llms.txt tidak ditemukan di akar domain', url: `${BASE}/`, detail: 'lain sekali' }]),
    HALAMAN,
    BASE,
  )
  expect(run1.ok && run2.ok).toBe(true)
  if (!run1.ok || !run2.ok) return

  const fp = (t: (typeof run1.temuan)[number]) => fingerprintOf(t.url, t.rule, t.key ?? '')
  expect(fp(run1.temuan[0]!)).toBe(fp(run2.temuan[0]!))
})

/* ── cabutJson ──────────────────────────────────────────────────────────── */

test('JSON tetap terambil walau dibungkus prosa atau blok kode', () => {
  const isi = '{"temuan":[]}'
  for (const raw of [
    isi,
    `Berikut hasilnya:\n\`\`\`json\n${isi}\n\`\`\``,
    `\`\`\`\n${isi}\n\`\`\`\nSemoga membantu.`,
    `Baik.\n${isi}`,
  ]) {
    expect(cabutJson(raw)).toContain('"temuan"')
  }
})

test('keluaran tanpa kurung kurawal ditolak, bukan dianggap kosong', () => {
  // Nol temuan dan gagal membaca adalah dua hal berbeda (§2.2). Yang kedua
  // harus menggagalkan job supaya tidak ada yang direkonsiliasi.
  expect(cabutJson('Maaf, saya tidak bisa mengakses situs itu.')).toBeNull()
  const h = bacaTemuan('Maaf, saya tidak bisa mengakses situs itu.', HALAMAN, BASE)
  expect(h.ok).toBe(false)
})

/* ── bacaTemuan ─────────────────────────────────────────────────────────── */

test('array temuan kosong adalah keberhasilan, bukan kegagalan', () => {
  const h = bacaTemuan('{"temuan":[]}', HALAMAN, BASE)
  expect(h.ok).toBe(true)
  expect(h.ok && h.temuan).toEqual([])
})

test('keluaran kosong dan JSON tanpa array temuan sama-sama gagal', () => {
  expect(bacaTemuan('', HALAMAN, BASE).ok).toBe(false)
  expect(bacaTemuan('   ', HALAMAN, BASE).ok).toBe(false)
  expect(bacaTemuan('{"hasil":"bagus"}', HALAMAN, BASE).ok).toBe(false)
  expect(bacaTemuan('{rusak', HALAMAN, BASE).ok).toBe(false)
})

test('URL dicocokkan ke halaman tersimpan, termasuk beda garis miring', () => {
  const h = bacaTemuan(
    json([
      { rule: 'a', severity: 'low', title: 'A', url: `${BASE}/produk` },
      { rule: 'b', severity: 'low', title: 'B', url: `${BASE}/produk/` },
      { rule: 'c', severity: 'low', title: 'C', url: '/produk' },
    ]),
    HALAMAN,
    BASE,
  )
  expect(h.ok && h.temuan.map((t) => t.pageId)).toEqual([2, 2, 2])
})

test('temuan tanpa url jadi temuan tingkat situs, bukan dibuang', () => {
  const h = bacaTemuan(
    json([{ rule: 'entitas-lemah', severity: 'medium', title: 'X', url: null }]),
    HALAMAN,
    BASE,
  )
  expect(h.ok && h.temuan[0]!.pageId).toBeNull()
  // URL-nya base, bukan string kosong: fingerprint dihitung dari URL, dan
  // temuan tingkat situs harus tetap punya identitas yang stabil.
  expect(h.ok && h.temuan[0]!.url).toBe(BASE)
})

/**
 * Model memilih halaman CONTOH yang berbeda tiap analisis, dan halaman contoh
 * bukan identitas masalah. Terukur: `llms-txt-hilang` bergeser fingerprint
 * hanya karena run pertama menyebut `/llms.txt` dan run kedua menyebut akar
 * domain — masalah yang sama menandai dirinya sudah diperbaiki.
 */
test('URL yang tidak cocok ke halaman tersimpan tidak ikut jadi identitas', () => {
  const satu = bacaTemuan(
    json([{ rule: 'llms-txt-hilang', severity: 'info', title: 'A', url: `${BASE}/llms.txt` }]),
    HALAMAN,
    BASE,
  )
  const dua = bacaTemuan(
    json([{ rule: 'llms-txt-hilang', severity: 'info', title: 'A', url: `${BASE}/lain` }]),
    HALAMAN,
    BASE,
  )
  expect(satu.ok && satu.temuan[0]!.url).toBe(BASE)
  expect(dua.ok && dua.temuan[0]!.url).toBe(BASE)
  if (!satu.ok || !dua.ok) return
  const fp = (t: (typeof satu.temuan)[number]) => fingerprintOf(t.url, t.rule, t.key ?? '')
  expect(fp(satu.temuan[0]!)).toBe(fp(dua.temuan[0]!))
})

test('URL asli tetap tersimpan di detail walau tidak dipakai sebagai identitas', () => {
  // Audit bisa menyebut halaman di luar max_pages, dan itu informasi sah —
  // yang hilang hanya perannya sebagai identitas.
  const h = bacaTemuan(
    json([{ rule: 'a', severity: 'low', title: 'A', url: `${BASE}/jauh-sekali` }]),
    HALAMAN,
    BASE,
  )
  expect(h.ok && h.temuan[0]!.pageId).toBeNull()
  expect(h.ok && (h.temuan[0]!.detail as { urlAsli: string }).urlAsli).toBe(`${BASE}/jauh-sekali`)
})

test('severity tak dikenal jadi medium, bukan dibuang dan bukan info', () => {
  const h = bacaTemuan(
    json([
      { rule: 'a', severity: 'sangat-parah', title: 'A' },
      { rule: 'b', severity: 'CRITICAL', title: 'B' },
      { rule: 'c', title: 'C' },
    ]),
    HALAMAN,
    BASE,
  )
  expect(h.ok && h.temuan.map((t) => t.severity)).toEqual(['medium', 'critical', 'medium'])
})

test('temuan tanpa judul dilewati dan dihitung sebagai terpotong', () => {
  const h = bacaTemuan(
    json([
      { rule: 'a', severity: 'low', title: 'ada' },
      { rule: 'b', severity: 'low', title: '' },
      { rule: 'c', severity: 'low' },
      'bukan objek',
    ]),
    HALAMAN,
    BASE,
  )
  expect(h.ok && h.temuan).toHaveLength(1)
  expect(h.ok && h.terpotong).toBe(3)
})

test('judul sepanjang paragraf dipotong, tidak merusak satu baris tabel', () => {
  const h = bacaTemuan(
    json([{ rule: 'a', severity: 'low', title: 'x'.repeat(900) }]),
    HALAMAN,
    BASE,
  )
  expect(h.ok && h.temuan[0]!.title.length).toBeLessThanOrEqual(300)
  expect(h.ok && h.temuan[0]!.title.endsWith('…')).toBe(true)
})

test('judul multi-baris dijadikan satu baris', () => {
  const h = bacaTemuan(
    json([{ rule: 'a', severity: 'low', title: 'baris satu\nbaris dua\n\nbaris tiga' }]),
    HALAMAN,
    BASE,
  )
  expect(h.ok && h.temuan[0]!.title).toBe('baris satu baris dua baris tiga')
})

test('keluaran yang meledak dipotong dan jumlahnya dilaporkan', () => {
  // Jaring untuk model yang mengulang satu temuan ratusan kali. Yang terpotong
  // dilaporkan, tidak dibuang diam-diam.
  const banyak = Array.from({ length: BATAS_TEMUAN + 25 }, (_, i) => ({
    rule: `aturan-${String.fromCharCode(97 + (i % 26))}${i}`,
    severity: 'low',
    title: `T${i}`,
  }))
  const h = bacaTemuan(json(banyak), HALAMAN, BASE)
  expect(h.ok && h.temuan.length).toBeLessThanOrEqual(BATAS_TEMUAN)
  expect(h.ok && h.terpotong).toBeGreaterThanOrEqual(25)
})

test('detail menyimpan nilai asli dari model untuk ditelusuri', () => {
  const h = bacaTemuan(
    json([{ rule: 'LLMs-TXT-12', severity: 'low', title: 'A', url: '/produk', detail: 'penjelasan' }]),
    HALAMAN,
    BASE,
  )
  expect(h.ok).toBe(true)
  if (!h.ok) return
  const d = h.temuan[0]!.detail as Record<string, unknown>
  expect(d.sumber).toBe('claude-seo')
  expect(d.catatan).toBe('penjelasan')
  expect(d.ruleAsli).toBe('LLMs-TXT-12')
  expect(h.temuan[0]!.rule).toBe('llms-txt')
})
