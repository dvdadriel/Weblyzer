import { expect, test } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { buatUser } from '../lib/auth/pengguna.ts'
import { bacaRahasia } from '../lib/auth/rahasia.ts'
import { simpanKunci, tandaiTerverifikasi } from '../lib/ai/kunci.ts'
import { reconcile } from '../lib/findings.ts'
import { ringkasanHandler } from '../lib/jobs/ringkasan.ts'
import type { PemanggilAi } from '../lib/jobs/ringkasan.ts'
import { ringkasanAi, statusAi } from '../lib/ui/queries.ts'

/**
 * Rahasia yang dipakai untuk menyimpan kunci HARUS yang sama dengan yang akan
 * dibaca `ringkasanHandler` lewat `bacaRahasia()`.
 *
 * Versi pertama berkas ini memasang rahasianya sendiri dengan `??=` lalu
 * memakai konstanta itu untuk `simpanKunci` — yang lolos di mesin tanpa
 * `WEBLYZER_SECRET` dan gagal dengan galat dekripsi di mesin yang punya.
 * Membacanya dari satu sumber menghapus kopling itu sepenuhnya.
 */
process.env.WEBLYZER_SECRET ??= 'rahasia-uji-'.repeat(3)
const RAHASIA = bacaRahasia()

/**
 * Situs milik seorang user, dengan satu temuan critical.
 *
 * `kunci` memilih keadaan konfigurasi AI pemiliknya, dan ketiganya adalah
 * keadaan yang benar-benar terjadi di produksi:
 * - `siap`     — kunci tersimpan dan sudah lolos validasi
 * - `mentah`   — kunci tersimpan tapi belum diuji (baru diganti, misalnya)
 * - `tanpa`    — belum pernah mengonfigurasi model
 */
function siap(kunci: 'siap' | 'mentah' | 'tanpa' = 'tanpa') {
  const db = openDb(':memory:')
  const user = buatUser(db, { email: 'a@x.com', password: 'rahasia1' })
  const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test', user_id: user.id })
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

  if (kunci !== 'tanpa') {
    simpanKunci(db, RAHASIA, user.id, {
      model: 'claude-opus-5',
      apiKey: 'sk-ant-uji-1234',
    })
    if (kunci === 'siap') tandaiTerverifikasi(db, user.id)
  }

  return { db, siteId: site.id, runId: run.id, userId: user.id }
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

const aiStatus = (db: ReturnType<typeof openDb>, runId: number) =>
  (db.prepare('SELECT ai_status FROM runs WHERE id = ?').get(runId) as { ai_status: string })
    .ai_status

/* ── Gerbang: kapan AI tidak jalan, dan itu bukan kegagalan ─────────────── */

test('tanpa kunci sama sekali, statusnya skipped bukan failed', async () => {
  const { db, siteId, runId } = siap('tanpa')
  await ringkasanHandler(job(runId, siteId), db)
  expect(statusAi(db, siteId)).toBeNull() // run belum selesai
  expect(aiStatus(db, runId)).toBe('skipped')
})

test('tanpa kunci, tidak ada laporan yang dibuat', async () => {
  const { db, siteId, runId } = siap('tanpa')
  await ringkasanHandler(job(runId, siteId), db)
  expect(ringkasanAi(db, siteId)).toBeNull()
})

test('kunci yang belum terverifikasi tidak pernah dipakai', async () => {
  // Inilah gerbang "harus konfigurasikan AI modelnya dulu, sudah oke baru
  // bisa gunakan". Kunci yang ada tapi belum lolos validasi harus diperlakukan
  // sama dengan tidak ada kunci — bukan dicoba lalu gagal, karena mencobanya
  // berarti satu permintaan berbayar untuk kunci yang sudah diketahui belum
  // terbukti.
  const { db, siteId, runId } = siap('mentah')
  let dipanggil = false
  await ringkasanHandler(job(runId, siteId), db, async () => {
    dipanggil = true
    return { ok: true, teks: 'tidak seharusnya sampai sini' }
  })
  expect(dipanggil).toBe(false)
  expect(aiStatus(db, runId)).toBe('skipped')
  expect(ringkasanAi(db, siteId)).toBeNull()
})

test('situs guest tidak pernah memakai AI', async () => {
  // Guest tidak punya akun, jadi tidak punya kunci — dan `user_id` NULL-nya
  // yang menyampaikan itu.
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'G', base_url: 'https://g.test', guest_id: 'g1' })
  const run = createRun(db, site.id, 'bugs')
  let dipanggil = false
  await ringkasanHandler(job(run.id, site.id), db, async () => {
    dipanggil = true
    return { ok: true, teks: 'x' }
  })
  expect(dipanggil).toBe(false)
  expect(aiStatus(db, run.id)).toBe('skipped')
})

test('kunci user lain tidak dipakai untuk situs ini', async () => {
  const { db, siteId, runId } = siap('tanpa')
  const lain = buatUser(db, { email: 'b@x.com', password: 'rahasia1' })
  simpanKunci(db, RAHASIA, lain.id, { model: 'claude-opus-5', apiKey: 'sk-ant-lain' })
  tandaiTerverifikasi(db, lain.id)

  let dipanggil = false
  await ringkasanHandler(job(runId, siteId), db, async () => {
    dipanggil = true
    return { ok: true, teks: 'x' }
  })
  expect(dipanggil).toBe(false)
  expect(aiStatus(db, runId)).toBe('skipped')
})

/* ── Jalur gagal: temuan tidak boleh tergeser sedikit pun ───────────────── */

/**
 * Inti berkas ini. Ringkasan AI berubah tiap pemanggilan; temuan punya riwayat
 * open/fixed. Kalau keduanya pernah bersentuhan, riwayat temuan mulai
 * berbohong.
 */
test('AI yang gagal tidak menyentuh satu pun temuan', async () => {
  const { db, siteId, runId } = siap('siap')
  const sebelum = temuanUtuh(db, siteId)
  await ringkasanHandler(job(runId, siteId), db, gagal('API key tidak berlaku lagi'))

  const status = db
    .prepare('SELECT ai_status, ai_error, ai_model FROM runs WHERE id = ?')
    .get(runId) as { ai_status: string; ai_error: string | null; ai_model: string | null }
  expect(status.ai_status).toBe('failed')
  // `ai_model` sekarang memuat id model, bukan nama CLI.
  expect(status.ai_model).toBe('claude-opus-5')
  expect(status.ai_error).toBeTruthy()

  expect(temuanUtuh(db, siteId)).toEqual(sebelum)
})

test('AI yang gagal tidak melempar, jadi pemindaian tetap dianggap berhasil', async () => {
  const { db, siteId, runId } = siap('siap')
  await expect(
    ringkasanHandler(job(runId, siteId), db, gagal('meledak')),
  ).resolves.toBeUndefined()
})

test('galat disimpan mentah, bukan diringkas jadi "gagal"', async () => {
  const { db, siteId, runId } = siap('siap')
  await ringkasanHandler(
    job(runId, siteId),
    db,
    gagal('API key tidak berlaku lagi. Simpan ulang kuncinya di halaman Model.'),
  )
  const { ai_error } = db.prepare('SELECT ai_error FROM runs WHERE id = ?').get(runId) as {
    ai_error: string
  }
  expect(ai_error).toMatch(/halaman Model/)
  expect(ai_error).not.toBe('gagal')
})

/* ── Jalur sukses ───────────────────────────────────────────────────────── */

test('ringkasan berhasil disimpan beserta model dan statusnya', async () => {
  const { db, siteId, runId } = siap('siap')
  await ringkasanHandler(job(runId, siteId), db, berhasil('Enam HTTP 500 di satu direktori.'))

  const r = ringkasanAi(db, siteId)
  expect(r?.teks).toBe('Enam HTTP 500 di satu direktori.')
  expect(r?.model).toBe('claude-opus-5')
  expect(aiStatus(db, runId)).toBe('ok')
})

test('kunci pemiliknya yang diteruskan ke pemanggil, bukan kunci lain', async () => {
  const { db, siteId, runId } = siap('siap')
  let terima: { apiKey: string; model: string } | null = null
  await ringkasanHandler(job(runId, siteId), db, async (apiKey, model) => {
    terima = { apiKey, model }
    return { ok: true, teks: 'x' }
  })
  expect(terima).toEqual({ apiKey: 'sk-ant-uji-1234', model: 'claude-opus-5' })
})

test('ringkasan yang berhasil pun tidak menyentuh temuan', async () => {
  const { db, siteId, runId } = siap('siap')
  const sebelum = temuanUtuh(db, siteId)
  await ringkasanHandler(job(runId, siteId), db, berhasil('apa pun'))
  expect(temuanUtuh(db, siteId)).toEqual(sebelum)
})

/**
 * Menekan tombol jalankan ulang dua kali harus menyisakan satu ringkasan,
 * bukan dua. Tanpa DELETE sebelum INSERT, panel ringkasan akan menampilkan
 * yang mana pun yang kebetulan terakhir — dan tabelnya tumbuh tiap klik.
 */
test('menjalankan ulang menimpa, tidak menumpuk', async () => {
  const { db, siteId, runId } = siap('siap')
  await ringkasanHandler(job(runId, siteId), db, berhasil('versi satu'))
  await ringkasanHandler(job(runId, siteId), db, berhasil('versi dua'))

  const n = db.prepare('SELECT COUNT(*) AS n FROM reports WHERE run_id = ?').get(runId) as {
    n: number
  }
  expect(n.n).toBe(1)
  expect(ringkasanAi(db, siteId)?.teks).toBe('versi dua')
})

test('tokens_est tercatat, jadi prompt yang membengkak terlihat', async () => {
  const { db, siteId, runId } = siap('siap')
  await ringkasanHandler(job(runId, siteId), db, berhasil('ringkas'))
  const { tokens_est } = db
    .prepare('SELECT tokens_est FROM reports WHERE run_id = ?')
    .get(runId) as { tokens_est: number }
  expect(tokens_est).toBeGreaterThan(0)
})

test('situs yang tidak ada tetap melempar', async () => {
  const { db, runId } = siap('siap')
  await expect(ringkasanHandler(job(runId, 999), db)).rejects.toThrow(/tidak ditemukan/)
})
