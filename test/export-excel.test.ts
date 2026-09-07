import { expect, test } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { reconcile } from '../lib/findings.ts'
import { susunSheet, namaBerkas } from '../lib/export/excel.ts'

const WAKTU = '2026-09-07 16:00'

function siap() {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
  return { db, siteId: site.id }
}

const nama = (s: ReturnType<typeof susunSheet>) => s.map((x) => x.sheet)
const teks = (sel: { value: string | number } | null) => (sel === null ? null : String(sel.value))

test('setiap kategori punya sheet-nya, walau tanpa temuan', () => {
  const { db, siteId } = siap()
  const s = susunSheet(db, siteId, WAKTU)
  // Sheet kosong berarti "diperiksa, tidak ada apa-apa"; sheet yang tidak ada
  // berarti "tidak diketahui". Keduanya berbeda.
  expect(nama(s)).toEqual([
    'Ringkasan',
    'Bug',
    'Console',
    'Security',
    'SEO',
    'Lighthouse',
    'Skor Lighthouse',
  ])
})

test('sheet kosong tetap membawa baris judul kolom', () => {
  const { db, siteId } = siap()
  const bug = susunSheet(db, siteId, WAKTU).find((x) => x.sheet === 'Bug')!
  expect(bug.data).toHaveLength(1)
  expect(teks(bug.data[0]![0]!)).toBe('Severity')
  expect(bug.data[0]!.every((c) => c !== null && c.fontWeight === 'bold')).toBe(true)
})

/**
 * Berkas ini dipakai melapor dan menelusuri. "Apa yang sudah kami perbaiki
 * bulan ini" tidak bisa dijawab berkas yang cuma memuat yang masih terbuka.
 */
test('temuan yang beres dan diabaikan ikut diekspor, dibedakan kolom Status', () => {
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run.id, 'bugs', [
    { url: 'https://uji.test/a', pageId: null, severity: 'critical', rule: 'r1', title: 'A', detail: {} },
    { url: 'https://uji.test/b', pageId: null, severity: 'low', rule: 'r2', title: 'B', detail: {} },
  ])
  db.prepare("UPDATE findings SET status = 'ignored' WHERE rule = 'r2'").run()
  const run2 = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run2.id, 'bugs', [])

  const bug = susunSheet(db, siteId, WAKTU).find((x) => x.sheet === 'Bug')!
  const status = bug.data.slice(1).map((r) => teks(r[4]!))
  expect(status.sort()).toEqual(['fixed', 'ignored'])
})

test('yang terbuka diurutkan di atas yang sudah beres', () => {
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run.id, 'bugs', [
    { url: 'https://uji.test/lama', pageId: null, severity: 'low', rule: 'beres', title: 'x', detail: {} },
  ])
  const run2 = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run2.id, 'bugs', [
    { url: 'https://uji.test/baru', pageId: null, severity: 'low', rule: 'terbuka', title: 'y', detail: {} },
  ])
  const bug = susunSheet(db, siteId, WAKTU).find((x) => x.sheet === 'Bug')!
  expect(teks(bug.data[1]![4]!)).toBe('open')
})

test('temuan tanpa halaman disebut, bukan dibiarkan sel kosong', () => {
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'security')
  reconcile(db, siteId, run.id, 'security', [
    { url: 'https://uji.test/', pageId: null, severity: 'medium', rule: 'header', title: 'H', detail: {} },
  ])
  const sec = susunSheet(db, siteId, WAKTU).find((x) => x.sheet === 'Security')!
  expect(teks(sec.data[1]![2]!)).toBe('(seluruh situs)')
})

/* ── Ringkasan: kesegaran berkas setelah lepas dari aplikasi ─────────────── */

test('ringkasan memuat nama situs, alamat, dan waktu pembuatan', () => {
  const { db, siteId } = siap()
  const r = susunSheet(db, siteId, WAKTU)[0]!
  const isi = r.data.map((baris) => baris.map(teks))
  expect(isi).toContainEqual(['Situs', 'Uji'])
  expect(isi).toContainEqual(['Alamat', 'https://uji.test'])
  expect(isi).toContainEqual(['Berkas dibuat', WAKTU])
})

test('kategori yang belum pernah dipindai disebut begitu, bukan sel kosong', () => {
  const { db, siteId } = siap()
  const r = susunSheet(db, siteId, WAKTU)[0]!
  const bug = r.data.find((baris) => teks(baris[0]!) === 'Bug')!
  expect(teks(bug[2]!)).toBe('belum pernah')
})

test('waktu pemindaian per kategori ikut, bukan hanya waktu ekspor', () => {
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  finishRun(db, run.id, 'done')
  const r = susunSheet(db, siteId, WAKTU)[0]!
  const bug = r.data.find((baris) => teks(baris[0]!) === 'Bug')!
  expect(teks(bug[2]!)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
})

/* ── Skor ────────────────────────────────────────────────────────────────── */

/**
 * Pengukuran yang tidak terjadi bukan pengukuran bernilai nol. Nol di kolom
 * skor akan ikut terhitung dalam rata-rata siapa pun yang membuka berkas ini.
 */
test('skor yang tidak terukur jadi sel kosong, bukan nol', () => {
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'lighthouse')
  const page = db
    .prepare(
      `INSERT INTO pages (site_id, url, status_code, load_ms) VALUES (?, ?, 200, 10) RETURNING id`,
    )
    .get(siteId, 'https://uji.test/x') as { id: number }
  db.prepare(
    `INSERT INTO lighthouse (run_id, page_id, strategy, perf, a11y, best_practices, seo)
     VALUES (?, ?, 'mobile', NULL, 90, NULL, 100)`,
  ).run(run.id, page.id)

  const skor = susunSheet(db, siteId, WAKTU).find((x) => x.sheet === 'Skor Lighthouse')!
  const baris = skor.data[1]!
  expect(baris[2]).toBeNull()
  expect(teks(baris[3]!)).toBe('90')
  expect(baris[4]).toBeNull()
  expect(teks(baris[5]!)).toBe('100')
})

/* ── Nama berkas ─────────────────────────────────────────────────────────── */

test('nama berkas aman untuk header HTTP', () => {
  expect(namaBerkas('Springair', '2026-09-07')).toBe('weblyzer-springair-2026-09-07.xlsx')
  expect(namaBerkas('PT. Kasur "Enak" / Jaya', '2026-09-07')).toBe(
    'weblyzer-pt-kasur-enak-jaya-2026-09-07.xlsx',
  )
})

/** Nama yang seluruhnya karakter aneh tidak boleh menghasilkan nama kosong. */
test('nama yang habis disaring tetap menghasilkan nama berkas', () => {
  expect(namaBerkas('///', '2026-09-07')).toBe('weblyzer-situs-2026-09-07.xlsx')
})

test('kutip ganda tidak bisa keluar dari header Content-Disposition', () => {
  expect(namaBerkas('a"; drop', '2026-09-07')).not.toContain('"')
})
