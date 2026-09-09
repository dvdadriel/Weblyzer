import { test, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { upsertPage } from '../lib/repos/pages.ts'
import { reconcile } from '../lib/findings.ts'
import { keadaanKategori, runAktif } from '../lib/ui/queries.ts'
import { KATEGORI, SUMBER, sumberKategori, namaKategori, BISA_RECHECK } from '../lib/kategori.ts'
import { tafsirkan } from '../lib/claude-seo/jalankan.ts'
import { promptGeo, promptAudit } from '../lib/claude-seo/prompt.ts'

function siap() {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
  return { db, siteId: site.id }
}

/* ── peta kategori ──────────────────────────────────────────────────────── */

test('setiap kategori punya nama dan sumber', () => {
  for (const k of KATEGORI) {
    expect(namaKategori(k)).not.toBe('')
    expect(['aturan', 'claude-seo']).toContain(SUMBER[k])
  }
})

test('hanya geo dan audit yang bersumber claude-seo', () => {
  const ai = KATEGORI.filter((k) => SUMBER[k] === 'claude-seo')
  expect(ai).toEqual(['geo', 'audit'])
})

test('kategori tak dikenal dianggap aturan, bukan claude-seo', () => {
  // Default yang aman: kategori baru yang lupa didaftarkan tidak boleh
  // diam-diam mendapat keringanan "ini cuma penilaian AI".
  expect(sumberKategori('entah-apa')).toBe('aturan')
})

test('kategori claude-seo tidak bisa diperiksa ulang per temuan', () => {
  for (const k of KATEGORI) {
    if (SUMBER[k] === 'claude-seo') expect(BISA_RECHECK.has(k)).toBe(false)
  }
  expect([...BISA_RECHECK].sort()).toEqual(['bugs', 'console', 'security'])
})

/* ── keadaanKategori: §2.2 untuk tab yang baru ──────────────────────────── */

/**
 * Bug yang paling mudah terjadi saat menambah tab, dan bentuknya persis §2.2:
 * situs yang rajin dipindai tapi belum pernah dianalisis GEO akan melaporkan
 * tab GEO-nya "bersih" — artinya "sudah diperiksa, tidak ada apa-apa" —
 * padahal artinya "tidak tahu".
 */
test('kategori yang belum pernah dijalankan tetap belum-dipindai walau tab lain sudah', () => {
  const { db, siteId } = siap()
  const scan = createRun(db, siteId, 'full')
  finishRun(db, scan.id, 'done')

  expect(keadaanKategori(db, siteId, 'bugs')).toBe('bersih')
  expect(keadaanKategori(db, siteId, 'geo')).toBe('belum-dipindai')
  expect(keadaanKategori(db, siteId, 'audit')).toBe('belum-dipindai')
  db.close()
})

test('run full tidak pernah dianggap menganalisis geo atau audit', () => {
  // `full` menyentuh empat kategori deterministik. Memasukkannya ke geo/audit
  // berarti mengaku claude-seo sudah berjalan padahal tidak pernah dipanggil.
  const { db, siteId } = siap()
  const scan = createRun(db, siteId, 'full')
  finishRun(db, scan.id, 'done')
  expect(keadaanKategori(db, siteId, 'seo')).toBe('bersih')
  expect(keadaanKategori(db, siteId, 'geo')).toBe('belum-dipindai')
  db.close()
})

test('kegagalan satu kategori tidak menular ke kategori lain', () => {
  const { db, siteId } = siap()
  const bugs = createRun(db, siteId, 'bugs')
  finishRun(db, bugs.id, 'done')
  const geo = createRun(db, siteId, 'geo')
  finishRun(db, geo.id, 'failed', 'claude-seo geo gagal')

  expect(keadaanKategori(db, siteId, 'geo')).toBe('gagal')
  // Sebelum perbaikan ini, `keadaanKategori` membaca run TERAKHIR apa pun
  // tipenya — jadi geo yang gagal membuat tab Bug ikut mengaku gagal.
  expect(keadaanKategori(db, siteId, 'bugs')).toBe('bersih')
  db.close()
})

test('temuan geo membuat keadaannya ada-temuan', () => {
  const { db, siteId } = siap()
  const page = upsertPage(db, siteId, { url: 'https://uji.test/', statusCode: 200, loadMs: 5 })
  const geo = createRun(db, siteId, 'geo')
  reconcile(db, siteId, geo.id, 'geo', [
    { url: 'https://uji.test/', pageId: page.id, severity: 'medium', rule: 'llms-txt-hilang', title: 'Tidak ada llms.txt' },
  ])
  finishRun(db, geo.id, 'done')
  expect(keadaanKategori(db, siteId, 'geo')).toBe('ada-temuan')
  db.close()
})

/* ── ambang macet: audit full berjalan lebih lama dari 30 menit ─────────── */

/**
 * Audit full batas waktunya 90 menit. Dengan ambang macet 30 menit yang
 * berlaku untuk semua tipe, tombolnya muncul kembali di menit ke-31 atas audit
 * yang MASIH BERJALAN — ditekan, dan situs itu dapat dua audit yang saling
 * menimpa rekonsiliasinya.
 */
test('audit yang berjalan 45 menit masih terhitung aktif', () => {
  const { db, siteId } = siap()
  db.prepare(
    `INSERT INTO runs (site_id, type, trigger, status, started_at)
     VALUES (?, 'audit', 'manual', 'running', datetime('now', '-45 minutes'))`,
  ).run(siteId)
  expect(runAktif(db, siteId)?.type).toBe('audit')
  db.close()
})

test('scan biasa yang berjalan 45 menit tetap dianggap macet', () => {
  // Ambang panjangnya hanya untuk geo/audit. Menaikkannya untuk semua tipe
  // berarti pekerja scan yang di-kill -9 mematikan tombolnya dua jam.
  const { db, siteId } = siap()
  db.prepare(
    `INSERT INTO runs (site_id, type, trigger, status, started_at)
     VALUES (?, 'bugs', 'manual', 'running', datetime('now', '-45 minutes'))`,
  ).run(siteId)
  expect(runAktif(db, siteId)).toBeUndefined()
  db.close()
})

test('audit yang berjalan lebih dari dua jam akhirnya dibebaskan juga', () => {
  const { db, siteId } = siap()
  db.prepare(
    `INSERT INTO runs (site_id, type, trigger, status, started_at)
     VALUES (?, 'audit', 'manual', 'running', datetime('now', '-3 hours'))`,
  ).run(siteId)
  expect(runAktif(db, siteId)).toBeUndefined()
  db.close()
})

/* ── tafsirkan: pemetaan galat pemanggilan claude ───────────────────────── */

test('claude yang tidak ada di PATH disebut apa adanya', () => {
  const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })
  const h = tafsirkan(err, '', '', 60_000)
  expect(h.ok).toBe(false)
  expect(!h.ok && h.galat).toMatch(/tidak ditemukan di PATH/)
})

test('timeout dilaporkan dalam menit, bukan milidetik', () => {
  const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', killed: true })
  const h = tafsirkan(err, '', '', 90 * 60_000)
  expect(!h.ok && h.galat).toMatch(/90 menit/)
})

test('stderr dipakai sebagai pesan galat bila ada, apa adanya', () => {
  // Pesan mentah, bukan kalimat sopan: kegagalan yang diterjemahkan akan
  // menyembunyikan sebab yang sebenarnya bisa ditindaklanjuti.
  const err = Object.assign(new Error('Command failed'), { code: 1 })
  const h = tafsirkan(err, '', 'Credit balance too low', 60_000)
  expect(!h.ok && h.galat).toBe('Credit balance too low')
})

/**
 * Terjadi sungguhan pada audit pertama: `claude -p` keluar non-nol setelah
 * empat menit dengan stderr KOSONG, sementara skill-nya jelas sudah bekerja —
 * crawl.json, sitemap.xml, dan home-raw.html tertulis di direktori kerjanya.
 * Membuang hasil kerja sebanyak itu karena satu angka exit adalah kerugian
 * yang tidak perlu.
 */
test('exit non-nol dengan keluaran tetap dipakai keluarannya', () => {
  const err = Object.assign(new Error('Command failed'), { code: 1 })
  const h = tafsirkan(err, '{"temuan":[{"rule":"a"}]}', '', 60_000)
  expect(h.ok).toBe(true)
  expect(h.ok && h.teks).toContain('temuan')
})

test('timeout tidak boleh diselamatkan keluaran separuh', () => {
  // Keluaran dari proses yang DIBUNUH bisa terpotong di tengah JSON. Yang
  // separuh lebih berbahaya daripada yang tidak ada: `bacaTemuan` bisa saja
  // berhasil membaca sebagiannya, dan sisanya direkonsiliasi sebagai "sudah
  // diperbaiki" padahal cuma tidak sempat dilaporkan.
  const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', killed: true })
  const h = tafsirkan(err, '{"temuan":[{"rule":"a"}', '', 60_000)
  expect(h.ok).toBe(false)
})

test('exit non-nol tanpa keluaran menyebutkan exit code-nya', () => {
  const err = Object.assign(new Error('Command failed: claude -p --allowedTools ...'), { code: 143 })
  const h = tafsirkan(err, '', '', 60_000)
  expect(h.ok).toBe(false)
  expect(!h.ok && h.galat).toMatch(/kode 143/)
})

test('keluaran kosong tanpa error tetap kegagalan', () => {
  // Nol keluaran bukan nol temuan. Kalau ini dianggap berhasil, `reconcile`
  // akan menandai seluruh temuan geo lama sebagai sudah diperbaiki.
  const h = tafsirkan(null, '   ', '', 60_000)
  expect(h.ok).toBe(false)
})

test('keluaran yang ada diteruskan utuh', () => {
  const h = tafsirkan(null, '{"temuan":[]}', 'peringatan yang tidak penting', 60_000)
  expect(h.ok).toBe(true)
  expect(h.ok && h.teks).toBe('{"temuan":[]}')
})

/* ── prompt: menghindari duplikasi lintas kategori ──────────────────────── */

/**
 * Dedup lewat prompt DIBATALKAN, dan test ini yang menjaganya tetap begitu.
 *
 * Menyuruh audit tidak mengulang temuan GEO bertentangan dengan `reconcile`
 * secara struktural: temuan yang sengaja tidak dilaporkan akhirnya ditandai
 * `fixed` walau tidak ada yang memperbaikinya. Terukur — enam temuan audit
 * ditandai beres semata karena dedup mulai bekerja.
 */
test('tidak ada prompt yang menyuruh menyembunyikan temuan kategori lain', () => {
  for (const p of [
    promptGeo('Uji', 'https://uji.test', []),
    promptAudit('Uji', 'https://uji.test', 50, []),
  ]) {
    expect(p).not.toMatch(/Jangan melaporkannya lagi/)
    expect(p).not.toMatch(/SUDAH dilaporkan oleh analisis GEO/)
  }
})

test('kedua prompt tetap menyuruh memakai ulang nama aturannya sendiri', () => {
  // Yang dibatalkan hanya dedup LINTAS kategori. Kontinuitas identitas di
  // dalam satu kategori adalah yang menjaga §2.1 dan tetap berlaku.
  const p = promptGeo('Uji', 'https://uji.test', [
    { rule: 'llms-txt-hilang', title: 'Tidak ada llms.txt' },
  ])
  expect(p).toContain('llms-txt-hilang')
  expect(p).toMatch(/PAKAI ULANG/)
})

test('kedua prompt menyuruh menulis berkas hasil', () => {
  for (const p of [
    promptGeo('Uji', 'https://uji.test', []),
    promptAudit('Uji', 'https://uji.test', 50, []),
  ]) {
    expect(p).toContain('weblyzer-temuan.json')
  }
})
