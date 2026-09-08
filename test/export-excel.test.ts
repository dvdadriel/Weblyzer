import { expect, test } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { upsertPage } from '../lib/repos/pages.ts'
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
    'Prompt Perbaikan',
    'Bug',
    'Console',
    'Security',
    'SEO',
    'GEO',
    'Audit',
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
  expect(teks(bug[1]!)).toBe('aturan')
  expect(teks(bug[3]!)).toBe('belum pernah')
})

test('waktu pemindaian per kategori ikut, bukan hanya waktu ekspor', () => {
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  finishRun(db, run.id, 'done')
  const r = susunSheet(db, siteId, WAKTU)[0]!
  const bug = r.data.find((baris) => teks(baris[0]!) === 'Bug')!
  expect(teks(bug[3]!)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
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

/* ── Prompt Perbaikan ───────────────────────────────────────────────────── */

const promptSheet = (db: ReturnType<typeof openDb>, siteId: number) =>
  susunSheet(db, siteId, WAKTU).find((x) => x.sheet === 'Prompt Perbaikan')!

/** Enam HTTP 500 dari satu controller rusak adalah SATU tugas. */
test('temuan identik jadi satu baris prompt, bukan satu baris per temuan', () => {
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  reconcile(
    db,
    siteId,
    run.id,
    'bugs',
    ['divan', 'headboard', 'bantal', 'guling', 'kasur', 'sofa'].map((p) => ({
      url: `https://uji.test/acc/${p}`,
      pageId: null,
      severity: 'critical' as const,
      rule: 'http-error',
      title: `HTTP 500 pada https://uji.test/acc/${p}`,
      detail: {},
    })),
  )

  const s = promptSheet(db, siteId)
  expect(s.data).toHaveLength(2)
  expect(teks(s.data[1]![5]!)).toBe('6')
  expect(teks(s.data[1]![3]!)).toBe('http-error')
})

test('hanya temuan terbuka yang dapat prompt', () => {
  // Yang `ignored` sudah diputuskan tidak dikerjakan dan yang `fixed` sudah
  // dikerjakan. Memberi prompt untuk keduanya mengirim orang memperbaiki hal
  // yang tidak perlu diperbaiki — kebalikan dari sheet temuan, yang memuat
  // ketiganya karena tugasnya melapor.
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run.id, 'bugs', [
    { url: 'https://uji.test/a', pageId: null, severity: 'critical', rule: 'http-error', title: 'HTTP 500 pada https://uji.test/a', detail: {} },
    { url: 'https://uji.test/b', pageId: null, severity: 'low', rule: 'noindex', title: 'Dikecualikan dari pencarian', detail: {} },
  ])
  db.prepare("UPDATE findings SET status = 'ignored' WHERE rule = 'noindex'").run()

  const aturan = promptSheet(db, siteId).data.slice(1).map((r) => teks(r[3]!))
  expect(aturan).toEqual(['http-error'])
})

test('prompt menyebut situs, aturan, dan halaman contoh', () => {
  const { db, siteId } = siap()
  // Halaman sungguhan, bukan `pageId: null`: URL contoh datang dari join ke
  // tabel pages, dan temuan tanpa halaman memang tidak punya URL untuk dikutip.
  const page = upsertPage(db, siteId, { url: 'https://uji.test/x', statusCode: 200, loadMs: 5 })
  const run = createRun(db, siteId, 'security')
  reconcile(db, siteId, run.id, 'security', [
    { url: 'https://uji.test/x', pageId: page.id, severity: 'high', rule: 'insecure-cookie', title: 'Cookie sesi tanpa flag Secure', detail: {} },
  ])

  const p = teks(promptSheet(db, siteId).data[1]![6]!)!
  expect(p).toContain('Uji')
  expect(p).toContain('https://uji.test')
  expect(p).toContain('security/insecure-cookie')
  expect(p).toContain('/x')
  // Petunjuk khas aturannya, bukan template kosong.
  expect(p).toContain('Secure')
})

test('prompt untuk aturan tak dikenal tetap terbentuk', () => {
  // Menambah analyzer baru tidak boleh menghasilkan sheet yang rusak — cuma
  // prompt yang lebih tumpul.
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run.id, 'bugs', [
    { url: 'https://uji.test/z', pageId: null, severity: 'medium', rule: 'aturan-yang-belum-ada', title: 'Sesuatu', detail: {} },
  ])

  const p = teks(promptSheet(db, siteId).data[1]![6]!)!
  expect(p).toContain('bugs/aturan-yang-belum-ada')
  expect(p).toContain('Tugas Anda')
})

test('prompt mengaku daftarnya lengkap hanya bila memang lengkap', () => {
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  // Sepuluh halaman dengan masalah yang sama; contoh yang dikutip dibatasi.
  reconcile(
    db,
    siteId,
    run.id,
    'bugs',
    Array.from({ length: 10 }, (_, i) => ({
      url: `https://uji.test/p${i}`,
      pageId: null,
      severity: 'high' as const,
      rule: 'http-error',
      title: `HTTP 500 pada https://uji.test/p${i}`,
      detail: {},
    })),
  )

  const banyak = teks(promptSheet(db, siteId).data[1]![6]!)!
  // Asisten yang mengira sudah melihat semuanya akan menyatakan selesai
  // terlalu cepat. Yang terpotong harus disebut jumlahnya.
  expect(banyak).toContain('hanya contoh')
  expect(banyak).toMatch(/Ada \d+ halaman lain/)
  expect(banyak).not.toContain('lengkap untuk masalah ini')

  const { db: db2, siteId: id2 } = siap()
  const r2 = createRun(db2, id2, 'bugs')
  reconcile(db2, id2, r2.id, 'bugs', [
    { url: 'https://uji.test/satu', pageId: null, severity: 'high', rule: 'http-error', title: 'HTTP 500 pada https://uji.test/satu', detail: {} },
  ])
  const sedikit = teks(promptSheet(db2, id2).data[1]![6]!)!
  expect(sedikit).toContain('lengkap')
  expect(sedikit).not.toContain('hanya contoh')
})

test('baris prompt diurutkan paling parah dulu', () => {
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run.id, 'bugs', [
    { url: 'https://uji.test/a', pageId: null, severity: 'low', rule: 'r-low', title: 'Rendah', detail: {} },
    { url: 'https://uji.test/b', pageId: null, severity: 'critical', rule: 'r-crit', title: 'Kritis', detail: {} },
    { url: 'https://uji.test/c', pageId: null, severity: 'medium', rule: 'r-med', title: 'Sedang', detail: {} },
  ])
  const sev = promptSheet(db, siteId).data.slice(1).map((r) => teks(r[0]!))
  expect(sev).toEqual(['critical', 'medium', 'low'])
})

test('situs tanpa temuan terbuka mendapat baris penjelas, bukan header sendirian', () => {
  // Header sendirian terbaca seperti data yang gagal dimuat.
  const { db, siteId } = siap()
  const s = promptSheet(db, siteId)
  expect(s.data).toHaveLength(2)
  expect(teks(s.data[1]![0]!)).toMatch(/tidak ada temuan terbuka/i)
})

test('kolom prompt membungkus teks', () => {
  // Isinya paragraf berbaris-baris; tanpa wrap Excel menampilkannya sebagai
  // satu garis panjang dan isinya cuma terbaca lewat formula bar.
  const { db, siteId } = siap()
  const run = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run.id, 'bugs', [
    { url: 'https://uji.test/a', pageId: null, severity: 'low', rule: 'http-error', title: 'HTTP 500 pada https://uji.test/a', detail: {} },
  ])
  expect(promptSheet(db, siteId).data[1]![6]!).toMatchObject({ wrap: true })
})

/**
 * Springair menghasilkan 46 kelompok `judul-kembar` yang perbaikannya satu dan
 * sama — template yang tidak menyisipkan nama halaman. Membaca 46 prompt
 * kembar bukan pekerjaan.
 */
test('aturan yang perbaikannya satu digabung jadi satu tugas', () => {
  const { db, siteId } = siap()
  const page = upsertPage(db, siteId, { url: 'https://uji.test/', statusCode: 200, loadMs: 5 })
  const run = createRun(db, siteId, 'seo')
  reconcile(
    db,
    siteId,
    run.id,
    'seo',
    ['European Collection', 'Urban Living', 'Hospitality'].map((t) => ({
      url: 'https://uji.test/',
      pageId: page.id,
      severity: 'medium' as const,
      rule: 'judul-kembar',
      // `key` membedakan temuan yang berbagi url + rule. Tanpa itu ketiganya
      // punya fingerprint yang sama dan reconcile menyimpan satu baris.
      key: t,
      title: `4 halaman memakai judul yang sama: "${t}"`,
      detail: {},
    })),
  )

  const b = promptSheet(db, siteId).data.slice(1)
  expect(b).toHaveLength(1)
  expect(teks(b[0]![4]!)).toBe('Judul halaman kembar antar halaman berbeda')

  // Yang hilang akibat penggabungan dikembalikan sebagai rincian — daftar
  // judul yang bertabrakan justru bahan utama untuk memperbaikinya.
  const p = teks(b[0]![6]!)!
  expect(p).toContain('European Collection')
  expect(p).toContain('Urban Living')
  expect(p).toContain('Hospitality')
  expect(p).toContain('Rincian (3)')
})

test('audit Lighthouse yang sama di mobile dan desktop adalah satu tugas', () => {
  const { db, siteId } = siap()
  const page = upsertPage(db, siteId, { url: 'https://uji.test/a', statusCode: 200, loadMs: 5 })
  const run = createRun(db, siteId, 'lighthouse')
  reconcile(db, siteId, run.id, 'lighthouse', [
    { url: 'https://uji.test/a', pageId: page.id, severity: 'medium', rule: 'lighthouse-audit', key: 'mobile:third-party-cookies', title: '[mobile] Uses third-party cookies', detail: {} },
    { url: 'https://uji.test/a', pageId: page.id, severity: 'medium', rule: 'lighthouse-audit', key: 'desktop:third-party-cookies', title: '[desktop] Uses third-party cookies', detail: {} },
    { url: 'https://uji.test/a', pageId: page.id, severity: 'medium', rule: 'lighthouse-audit', key: 'mobile:landmark-one-main', title: '[mobile] Document does not have a main landmark', detail: {} },
  ])

  const b = promptSheet(db, siteId).data.slice(1)
  // Dua audit berbeda tetap dua tugas; strategi yang berbeda tidak.
  expect(b).toHaveLength(2)
  expect(b.map((r) => teks(r[4]!))).toEqual([
    'Uses third-party cookies',
    'Document does not have a main landmark',
  ])
  expect(teks(b[0]![6]!)).toContain('[desktop]')
})

/** Audit Lighthouse yang berbeda perbaikannya berbeda — itu bukan satu tugas. */
test('masalah yang benar-benar berbeda tidak digabung', () => {
  const { db, siteId } = siap()
  const page = upsertPage(db, siteId, { url: 'https://uji.test/a', statusCode: 200, loadMs: 5 })
  const run = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run.id, 'bugs', [
    { url: 'https://uji.test/a', pageId: page.id, severity: 'critical', rule: 'http-error', title: 'HTTP 500 pada https://uji.test/a', detail: {} },
    { url: 'https://uji.test/b', pageId: page.id, severity: 'high', rule: 'http-error', title: 'HTTP 404 pada https://uji.test/b', detail: {} },
  ])
  // HTTP 500 dan HTTP 404 adalah dua pekerjaan berbeda walau aturannya sama.
  expect(promptSheet(db, siteId).data.slice(1)).toHaveLength(2)
})

test('tugas gabungan menghitung varian, bukan halaman', () => {
  // 46 temuan judul-kembar Springair semuanya menempel di halaman akar.
  // Menulis "46 halaman" sementara daftar contohnya cuma memuat "/" adalah
  // angka yang salah unit.
  const { db, siteId } = siap()
  const page = upsertPage(db, siteId, { url: 'https://uji.test/', statusCode: 200, loadMs: 5 })
  const run = createRun(db, siteId, 'seo')
  reconcile(db, siteId, run.id, 'seo', [
    { url: 'https://uji.test/', pageId: page.id, severity: 'medium', rule: 'judul-kembar', key: 'A', title: '2 halaman memakai judul yang sama: "A"', detail: {} },
    { url: 'https://uji.test/', pageId: page.id, severity: 'medium', rule: 'judul-kembar', key: 'B', title: '3 halaman memakai judul yang sama: "B"', detail: {} },
  ])
  const p = teks(promptSheet(db, siteId).data[1]![6]!)!
  expect(p).toContain('2 varian, 2 temuan')
  expect(p).not.toMatch(/Terdampak: \d+ halaman/)
})

/**
 * Temuan `aturan` diukur: `judul-hilang` berarti elemen `<title>` benar-benar
 * tidak ada. Temuan claude-seo adalah PENILAIAN, dan penilaian bisa keliru
 * dengan cara yang tidak bisa dilakukan pengukuran. Asisten yang tidak diberi
 * tahu bedanya akan memperlakukan keduanya sama yakinnya.
 */
test('prompt untuk temuan claude-seo menyuruh verifikasi dulu', () => {
  const { db, siteId } = siap()
  const page = upsertPage(db, siteId, { url: 'https://uji.test/', statusCode: 200, loadMs: 5 })
  const run = createRun(db, siteId, 'geo')
  reconcile(db, siteId, run.id, 'geo', [
    { url: 'https://uji.test/', pageId: page.id, severity: 'high', rule: 'entitas-brand-lemah', title: 'Sinyal entitas brand sempit', detail: {} },
  ])

  const p = teks(promptSheet(db, siteId).data[1]![6]!)!
  expect(p).toMatch(/VERIFIKASI DULU/)
  expect(p).toContain('penilaian, bukan pengukuran')
  expect(p).toContain('claude-seo')
  // Kolom Sumber-nya juga menyebutkannya, supaya terlihat tanpa membuka prompt.
  expect(teks(promptSheet(db, siteId).data[1]![2]!)).toBe('claude-seo')
})

test('prompt untuk temuan aturan TIDAK menyuruh verifikasi lebih dulu', () => {
  // Pembedaannya harus nyata di kedua arah. Kalau semua prompt berbunyi
  // "verifikasi dulu", peringatan itu berhenti berarti apa pun.
  const { db, siteId } = siap()
  const page = upsertPage(db, siteId, { url: 'https://uji.test/a', statusCode: 500, loadMs: 5 })
  const run = createRun(db, siteId, 'bugs')
  reconcile(db, siteId, run.id, 'bugs', [
    { url: 'https://uji.test/a', pageId: page.id, severity: 'critical', rule: 'http-error', title: 'HTTP 500 pada https://uji.test/a', detail: {} },
  ])

  const p = teks(promptSheet(db, siteId).data[1]![6]!)!
  expect(p).not.toMatch(/VERIFIKASI DULU/)
  expect(teks(promptSheet(db, siteId).data[1]![2]!)).toBe('aturan')
})
