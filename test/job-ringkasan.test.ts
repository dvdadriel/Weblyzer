import { expect, test } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { reconcile } from '../lib/findings.ts'
import { ringkasanHandler, panggilBawaan } from '../lib/jobs/ringkasan.ts'
import type { PemanggilAi } from '../lib/jobs/ringkasan.ts'
import type { Hasil, Konfigurasi } from '../lib/ai/konfigurasi.ts'
import { ringkasanAi, statusAi } from '../lib/ui/queries.ts'

/**
 * Konfigurasi AI diberikan sebagai nilai, bukan lewat `process.env`.
 *
 * Versi sebelumnya menyimpan kunci di database dan menanam rahasianya di
 * `process.env`, dan itu membuat berkas ini lolos di mesin tanpa
 * `WEBLYZER_SECRET` lalu gagal di mesin yang punya. Menyerahkannya sebagai
 * argumen menghapus kopling itu sepenuhnya: yang diuji di sini adalah
 * perilaku handler-nya, bukan isi `.env` siapa pun.
 */
const SIAP: Hasil = {
  siap: true,
  konfigurasi: { jalur: 'anthropic', model: 'claude-opus-5', apiKey: 'sk-ant-uji-1234' },
}
const BELUM: Hasil = { siap: false, sebab: 'WEBLYZER_AI belum diisi.' }

/** Situs dengan satu temuan critical. */
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

const aiStatus = (db: ReturnType<typeof openDb>, runId: number) =>
  (db.prepare('SELECT ai_status FROM runs WHERE id = ?').get(runId) as { ai_status: string })
    .ai_status

/* ── Gerbang: kapan AI tidak jalan, dan itu bukan kegagalan ─────────────── */

test('tanpa konfigurasi, statusnya skipped bukan failed', async () => {
  // AI yang tidak dikonfigurasi adalah pilihan yang sah: pemindaiannya sendiri
  // tidak butuh AI sama sekali. Menandainya `failed` membuat lencana
  // peringatan di dashboard menyala untuk keadaan yang memang diinginkan.
  const { db, siteId, runId } = siap()
  await ringkasanHandler(job(runId, siteId), db, berhasil('x'), BELUM)
  expect(statusAi(db, siteId)).toBeNull() // run belum selesai
  expect(aiStatus(db, runId)).toBe('skipped')
})

test('tanpa konfigurasi, tidak ada laporan yang dibuat', async () => {
  const { db, siteId, runId } = siap()
  await ringkasanHandler(job(runId, siteId), db, berhasil('x'), BELUM)
  expect(ringkasanAi(db, siteId)).toBeNull()
})

test('tanpa konfigurasi, pemanggil AI tidak pernah disentuh', async () => {
  const { db, siteId, runId } = siap()
  let dipanggil = false
  await ringkasanHandler(
    job(runId, siteId),
    db,
    async () => {
      dipanggil = true
      return { ok: true, teks: 'tidak seharusnya sampai sini' }
    },
    BELUM,
  )
  expect(dipanggil).toBe(false)
})

/* ── Jalur gagal: temuan tidak boleh tergeser sedikit pun ───────────────── */

/**
 * Inti berkas ini. Ringkasan AI berubah tiap pemanggilan; temuan punya riwayat
 * open/fixed. Kalau keduanya pernah bersentuhan, riwayat temuan mulai
 * berbohong.
 */
test('AI yang gagal tidak menyentuh satu pun temuan', async () => {
  const { db, siteId, runId } = siap()
  const sebelum = temuanUtuh(db, siteId)
  await ringkasanHandler(job(runId, siteId), db, gagal('API key ditolak penyedianya'), SIAP)

  const status = db
    .prepare('SELECT ai_status, ai_error, ai_model FROM runs WHERE id = ?')
    .get(runId) as { ai_status: string; ai_error: string | null; ai_model: string | null }
  expect(status.ai_status).toBe('failed')
  expect(status.ai_model).toBe('claude-opus-5')
  expect(status.ai_error).toBeTruthy()

  expect(temuanUtuh(db, siteId)).toEqual(sebelum)
})

test('AI yang gagal tidak melempar, jadi pemindaian tetap dianggap berhasil', async () => {
  const { db, siteId, runId } = siap()
  await expect(
    ringkasanHandler(job(runId, siteId), db, gagal('meledak'), SIAP),
  ).resolves.toBeUndefined()
})

test('galat disimpan mentah, bukan diringkas jadi "gagal"', async () => {
  const { db, siteId, runId } = siap()
  await ringkasanHandler(
    job(runId, siteId),
    db,
    gagal('404: endpoint atau modelnya tidak ada. Periksa WEBLYZER_AI_BASE_URL.'),
    SIAP,
  )
  const { ai_error } = db.prepare('SELECT ai_error FROM runs WHERE id = ?').get(runId) as {
    ai_error: string
  }
  expect(ai_error).toMatch(/WEBLYZER_AI_BASE_URL/)
  expect(ai_error).not.toBe('gagal')
})

/* ── Jalur sukses ───────────────────────────────────────────────────────── */

test('ringkasan berhasil disimpan beserta model dan statusnya', async () => {
  const { db, siteId, runId } = siap()
  await ringkasanHandler(
    job(runId, siteId),
    db,
    berhasil('Enam HTTP 500 di satu direktori.'),
    SIAP,
  )

  const r = ringkasanAi(db, siteId)
  expect(r?.teks).toBe('Enam HTTP 500 di satu direktori.')
  expect(r?.model).toBe('claude-opus-5')
  expect(aiStatus(db, runId)).toBe('ok')
})

test('konfigurasi diteruskan utuh ke pemanggil', async () => {
  const { db, siteId, runId } = siap()
  let terima: Konfigurasi | null = null
  await ringkasanHandler(
    job(runId, siteId),
    db,
    async (cfg) => {
      terima = cfg
      return { ok: true, teks: 'x' }
    },
    SIAP,
  )
  expect(terima).toEqual(SIAP.siap && SIAP.konfigurasi)
})

test('jalur CLI dipakai apa adanya, tanpa API key', async () => {
  // Yang dijaga di sini: jalurnya ikut sampai ke pemanggil. Kalau hilang,
  // prompt dikirim ke Messages API tanpa kunci — dan gagalnya baru terlihat
  // pada pemindaian tengah malam yang tidak ada yang menonton.
  const { db, siteId, runId } = siap()
  const cfg: Hasil = {
    siap: true,
    konfigurasi: { jalur: 'cli', cli: 'agy', model: 'gemini-3.1-pro-high' },
  }
  let terima: Konfigurasi | null = null
  await ringkasanHandler(
    job(runId, siteId),
    db,
    async (c) => {
      terima = c
      return { ok: true, teks: 'ringkasan dari agy' }
    },
    cfg,
  )
  expect(terima).toEqual({ jalur: 'cli', cli: 'agy', model: 'gemini-3.1-pro-high' })
  expect(ringkasanAi(db, siteId)?.model).toBe('gemini-3.1-pro-high')
  expect(aiStatus(db, runId)).toBe('ok')
})

test('ringkasan yang berhasil pun tidak menyentuh temuan', async () => {
  const { db, siteId, runId } = siap()
  const sebelum = temuanUtuh(db, siteId)
  await ringkasanHandler(job(runId, siteId), db, berhasil('apa pun'), SIAP)
  expect(temuanUtuh(db, siteId)).toEqual(sebelum)
})

/**
 * Menekan tombol jalankan ulang dua kali harus menyisakan satu ringkasan,
 * bukan dua yang saling bertumpuk.
 */
test('menjalankan dua kali menyisakan satu baris laporan', async () => {
  const { db, siteId, runId } = siap()
  await ringkasanHandler(job(runId, siteId), db, berhasil('pertama'), SIAP)
  await ringkasanHandler(job(runId, siteId), db, berhasil('kedua'), SIAP)

  const n = db.prepare('SELECT COUNT(*) AS n FROM reports WHERE run_id = ?').get(runId) as {
    n: number
  }
  expect(n.n).toBe(1)
  expect(ringkasanAi(db, siteId)?.teks).toBe('kedua')
})

test('situs yang tidak ada melempar, karena itu memang bug pemanggil', async () => {
  const { db } = siap()
  await expect(ringkasanHandler(job(1, 9999), db, berhasil('x'), SIAP)).rejects.toThrow(/9999/)
})

/* ── Penyaluran jalur ───────────────────────────────────────────────────── */

/**
 * `panggilBawaan` diuji lewat jalur yang TIDAK menyentuh jaringan.
 *
 * Ketiga jalur sungguhannya sudah diuji terpisah — `tafsirkanGalat`,
 * `tafsirkanOpenai`, dan `tafsirkanAgy` masing-masing punya berkasnya sendiri.
 * Yang tersisa untuk diuji di sini cuma penyalurannya, dan satu-satunya cara
 * mengujinya tanpa jaringan adalah lewat jalur yang gagal cepat: base URL yang
 * tidak akan pernah menjawab.
 */
test('jalur openai memakai base URL dari konfigurasi', async () => {
  const hasil = await panggilBawaan(
    {
      jalur: 'openai',
      nama: 'uji',
      // Port 0 tidak bisa dihubungi; kegagalannya seketika dan tanpa jaringan
      // keluar.
      baseUrl: 'http://127.0.0.1:1/v1',
      apiKey: '',
      model: 'apa-pun',
    },
    'prompt',
  )
  expect(hasil.ok).toBe(false)
  // Alamatnya ikut disebut. Tanpa itu, pesan Node ("fetch failed") tidak
  // menyebut apa yang gagal dihubungi.
  expect(hasil.ok === false && hasil.galat).toMatch(/127\.0\.0\.1:1/)
})
