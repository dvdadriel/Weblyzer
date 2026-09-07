import { expect, test } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { pilihPenyedia } from '../lib/ai/penyedia.ts'
import { reconcile } from '../lib/findings.ts'
import { ringkasanHandler } from '../lib/jobs/ringkasan.ts'
import type { PemanggilAi } from '../lib/jobs/ringkasan.ts'
import { ringkasanAi, statusAi } from '../lib/ui/queries.ts'

function siap() {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
  const run = createRun(db, site.id, 'bugs')
  reconcile(db, site.id, run.id, 'bugs', [
    {
      url: 'https://uji.test/a',
      pageId: null,
      severity: 'critical',
      rule: 'http-error',
      title: 'HTTP 500',
      detail: {},
    },
  ])
  return { db, siteId: site.id, runId: run.id }
}

const job = (runId: number, siteId: number) =>
  ({ id: 1, run_id: runId, type: 'ringkasan', payload: { siteId }, status: 'running' }) as never

/** Pemanggil AI palsu. Deterministik, seketika, dan tidak menyentuh jaringan. */
const gagal = (pesan: string): PemanggilAi => async () => ({ ok: false, galat: pesan })
const berhasil = (teks: string): PemanggilAi => async () => ({ ok: true, teks })

/** Temuan yang tidak boleh tersentuh apa pun yang terjadi pada AI. */
function temuanUtuh(db: ReturnType<typeof openDb>, siteId: number) {
  return db
    .prepare('SELECT status, last_seen_run FROM findings WHERE site_id = ?')
    .all(siteId) as unknown as { status: string; last_seen_run: number }[]
}

test('tanpa penyedia terpilih, statusnya skipped bukan failed', async () => {
  const { db, siteId, runId } = siap()
  await ringkasanHandler(job(runId, siteId), db)
  expect(statusAi(db, siteId)).toBeNull() // run belum selesai
  expect((db.prepare('SELECT ai_status FROM runs WHERE id = ?').get(runId) as { ai_status: string }).ai_status).toBe('skipped')
})

test('tanpa penyedia, tidak ada laporan yang dibuat', async () => {
  const { db, siteId, runId } = siap()
  await ringkasanHandler(job(runId, siteId), db)
  expect(ringkasanAi(db, siteId)).toBeNull()
})

/**
 * Inti berkas ini. Ringkasan AI berubah tiap pemanggilan; temuan punya riwayat
 * open/fixed. Kalau keduanya pernah bersentuhan, riwayat temuan mulai
 * berbohong. Diuji dengan penyedia yang PASTI gagal (tanpa GEMINI_API_KEY di
 * lingkungan test), lalu memastikan temuannya tidak bergeser sedikit pun.
 */
test('AI yang gagal tidak menyentuh satu pun temuan', async () => {
  const { db, siteId, runId } = siap()
  const sebelum = temuanUtuh(db, siteId)
  pilihPenyedia(db, 'gemini')
  await ringkasanHandler(job(runId, siteId), db, gagal('butuh GEMINI_API_KEY'))

  const status = db
    .prepare('SELECT ai_status, ai_error, ai_model FROM runs WHERE id = ?')
    .get(runId) as { ai_status: string; ai_error: string | null; ai_model: string | null }
  expect(status.ai_status).toBe('failed')
  expect(status.ai_model).toBe('gemini')
  expect(status.ai_error).toBeTruthy()

  expect(temuanUtuh(db, siteId)).toEqual(sebelum)
})

test('AI yang gagal tidak melempar, jadi pemindaian tetap dianggap berhasil', async () => {
  const { db, siteId, runId } = siap()
  pilihPenyedia(db, 'gemini')
  await expect(
    ringkasanHandler(job(runId, siteId), db, gagal('meledak')),
  ).resolves.toBeUndefined()
})

test('galat CLI disimpan mentah, bukan diringkas jadi "gagal"', async () => {
  const { db, siteId, runId } = siap()
  pilihPenyedia(db, 'gemini')
  await ringkasanHandler(
    job(runId, siteId),
    db,
    gagal('When using Gemini API, you must specify the GEMINI_API_KEY environment variable.'),
  )
  const { ai_error } = db
    .prepare('SELECT ai_error FROM runs WHERE id = ?')
    .get(runId) as { ai_error: string }
  expect(ai_error).toMatch(/GEMINI_API_KEY/)
  expect(ai_error).not.toBe('gagal')
})

/* ── Jalur sukses, yang sebelumnya tidak bisa diuji sama sekali ──────────── */

test('ringkasan berhasil disimpan beserta model dan statusnya', async () => {
  const { db, siteId, runId } = siap()
  pilihPenyedia(db, 'claude')
  await ringkasanHandler(job(runId, siteId), db, berhasil('Enam HTTP 500 di satu direktori.'))

  const r = ringkasanAi(db, siteId)
  expect(r?.teks).toBe('Enam HTTP 500 di satu direktori.')
  expect(r?.model).toBe('claude')
  expect(
    (db.prepare('SELECT ai_status FROM runs WHERE id = ?').get(runId) as { ai_status: string })
      .ai_status,
  ).toBe('ok')
})

test('ringkasan yang berhasil pun tidak menyentuh temuan', async () => {
  const { db, siteId, runId } = siap()
  const sebelum = temuanUtuh(db, siteId)
  pilihPenyedia(db, 'claude')
  await ringkasanHandler(job(runId, siteId), db, berhasil('apa pun'))
  expect(temuanUtuh(db, siteId)).toEqual(sebelum)
})

/**
 * Menekan tombol jalankan ulang dua kali harus menyisakan satu ringkasan,
 * bukan dua. Tanpa DELETE sebelum INSERT, panel ringkasan akan menampilkan
 * yang mana pun yang kebetulan terakhir — dan tabelnya tumbuh tiap klik.
 */
test('menjalankan ulang menimpa, tidak menumpuk', async () => {
  const { db, siteId, runId } = siap()
  pilihPenyedia(db, 'claude')
  await ringkasanHandler(job(runId, siteId), db, berhasil('versi satu'))
  await ringkasanHandler(job(runId, siteId), db, berhasil('versi dua'))

  const n = db.prepare('SELECT COUNT(*) AS n FROM reports WHERE run_id = ?').get(runId) as { n: number }
  expect(n.n).toBe(1)
  expect(ringkasanAi(db, siteId)?.teks).toBe('versi dua')
})

test('tokens_est tercatat, jadi prompt yang membengkak terlihat', async () => {
  const { db, siteId, runId } = siap()
  pilihPenyedia(db, 'claude')
  await ringkasanHandler(job(runId, siteId), db, berhasil('ringkas'))
  const { tokens_est } = db
    .prepare('SELECT tokens_est FROM reports WHERE run_id = ?')
    .get(runId) as { tokens_est: number }
  expect(tokens_est).toBeGreaterThan(0)
})

test('situs yang tidak ada tetap melempar', async () => {
  const { db, runId } = siap()
  await expect(ringkasanHandler(job(runId, 999), db)).rejects.toThrow(/tidak ditemukan/)
})
