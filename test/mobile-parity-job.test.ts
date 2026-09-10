import { test, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { upsertPage } from '../lib/repos/pages.ts'
import { mobileParityHandler, type Pengukur } from '../lib/jobs/mobile-parity.ts'
import type { UkuranHalaman, UkuranLebar, NamaLebar } from '../lib/scanners/mobile-parity.ts'

/**
 * Job diuji dengan pengukur palsu, tanpa Chromium.
 *
 * Yang diuji di sini adalah pemetaan: halaman mana yang dipilih, `page_id`
 * mana yang dipasang, dan bagaimana temuannya direkonsiliasi. Chromium-nya
 * sudah dibuktikan terpisah terhadap fixture yang cacatnya diketahui.
 */

const LEBAR_PIKSEL: Record<NamaLebar, number> = { mobile: 390, tablet: 820, desktop: 1440 }

function perLebar(lebar: NamaLebar, ubah: Partial<UkuranLebar> = {}): UkuranLebar {
  const viewport = LEBAR_PIKSEL[lebar]
  return {
    lebar,
    viewport,
    lebarDokumen: viewport,
    keluarViewport: [],
    terpotong: [],
    targetKecil: [],
    porsiTebal: 0.1,
    ukuranIsi: 16,
    ukuranJudul: 30,
    jarakMedian: 16,
    kolomMaks: lebar === 'mobile' ? 1 : 4,
    grid: [],
    hoverSaja: [],
    tangkapan: null,
    ...ubah,
  }
}

/** Halaman dengan satu cacat yang pasti menghasilkan tepat satu temuan. */
const rusak = (url: string): UkuranHalaman => ({
  url,
  metaViewport: null, // → mobile-viewport-meta-hilang, critical
  perLebar: [perLebar('mobile'), perLebar('tablet'), perLebar('desktop')],
})

const bersih = (url: string): UkuranHalaman => ({
  url,
  metaViewport: 'width=device-width, initial-scale=1',
  perLebar: [perLebar('mobile'), perLebar('tablet'), perLebar('desktop')],
})

const job = (runId: number, siteId: number) =>
  ({ id: 1, run_id: runId, type: 'mobile', payload: { siteId }, status: 'running' }) as never

function siap(pages: string[] = []) {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
  for (const url of pages) upsertPage(db, site.id, { url, statusCode: 200, loadMs: 10 })
  const run = createRun(db, site.id, 'mobile')
  return { db, siteId: site.id, runId: run.id }
}

const temuan = (db: ReturnType<typeof openDb>, siteId: number) =>
  db
    .prepare(
      `SELECT rule, severity, status, page_id, detail_json
       FROM findings WHERE site_id = ? AND category = 'mobile'`,
    )
    .all(siteId) as {
    rule: string
    severity: string
    status: string
    page_id: number | null
    detail_json: string
  }[]

test('temuan tersimpan di kategori mobile', async () => {
  const { db, siteId, runId } = siap(['https://uji.test/'])
  await mobileParityHandler(job(runId, siteId), db, async (urls) => urls.map(rusak))

  const t = temuan(db, siteId)
  expect(t.length).toBe(1)
  expect(t[0]!.rule).toBe('mobile-viewport-meta-hilang')
  expect(t[0]!.severity).toBe('critical')
  expect(t[0]!.status).toBe('open')
})

test('page_id dipasang dari halaman yang tersimpan', async () => {
  // Tanpa `page_id`, temuannya tidak bisa ditautkan ke halamannya di UI.
  const { db, siteId, runId } = siap(['https://uji.test/'])
  await mobileParityHandler(job(runId, siteId), db, async (urls) => urls.map(rusak))
  expect(temuan(db, siteId)[0]!.page_id).not.toBeNull()
})

test('situs yang belum pernah dijelajah tetap diukur — berandanya', async () => {
  // Inilah cara aspek ini bisa dipakai sebelum crawl penuh yang butuh
  // menit-menitan. Dan keluhan "mobile terabaikan" hampir selalu sudah
  // terlihat di beranda.
  const { db, siteId, runId } = siap([])
  let diminta: string[] = []
  await mobileParityHandler(job(runId, siteId), db, async (urls) => {
    diminta = urls
    return urls.map(rusak)
  })
  expect(diminta).toEqual(['https://uji.test'])
  // `page_id` null adalah keadaan yang sah di sini: halamannya belum ada di
  // tabel `pages` karena belum pernah dijelajah. URL-nya karena itu harus
  // terbawa di detail — kalau tidak, temuannya tidak menyebut halaman mana pun.
  const t = temuan(db, siteId)[0]!
  expect(t.page_id).toBeNull()
  expect(JSON.parse(t.detail_json).diukurDi).toBe('https://uji.test')
})

test('halaman dipilih dengan mesin yang sama dengan Lighthouse', async () => {
  // Cacat tata letak berulang PER TEMPLATE. Enam puluh halaman berita punya
  // satu tata letak, jadi mengukur keenam puluhnya menghasilkan enam puluh
  // salinan temuan yang sama dan menghabiskan sepuluh menit.
  const berita = Array.from({ length: 60 }, (_, i) => `https://uji.test/news/${i + 1}`)
  const { db, siteId, runId } = siap(['https://uji.test/', ...berita])

  let diminta: string[] = []
  await mobileParityHandler(job(runId, siteId), db, async (urls) => {
    diminta = urls
    return urls.map(bersih)
  })

  expect(diminta.length).toBeLessThan(30)
  // Berandanya tidak boleh ikut tersaring.
  expect(diminta).toContain('https://uji.test/')
})

test('temuan yang hilang ditandai beres — riwayatnya bisa dipercaya', async () => {
  // Mode `tegas`, bukan lunak: seluruh temuan aspek ini deterministik, jadi
  // hilangnya temuan berarti perbaikan — bukan model yang berubah pikiran.
  const { db, siteId, runId } = siap(['https://uji.test/'])
  await mobileParityHandler(job(runId, siteId), db, async (urls) => urls.map(rusak))
  expect(temuan(db, siteId)[0]!.status).toBe('open')

  const run2 = createRun(db, siteId, 'mobile')
  await mobileParityHandler(job(run2.id, siteId), db, async (urls) => urls.map(bersih))
  expect(temuan(db, siteId)[0]!.status).toBe('fixed')
})

test('temuan yang sama pada run berikutnya tetap satu baris', async () => {
  // Identitasnya url + rule, jadi run kedua harus mengenali temuan yang sama —
  // bukan membuka baris baru.
  const { db, siteId, runId } = siap(['https://uji.test/'])
  await mobileParityHandler(job(runId, siteId), db, async (urls) => urls.map(rusak))
  const run2 = createRun(db, siteId, 'mobile')
  await mobileParityHandler(job(run2.id, siteId), db, async (urls) => urls.map(rusak))
  expect(temuan(db, siteId).length).toBe(1)
})

test('halaman yang gagal diukur tidak menggagalkan sisanya', async () => {
  // Pengukur sungguhannya menelan galat per halaman; job ini harus tetap
  // menyimpan temuan dari halaman yang berhasil.
  const { db, siteId, runId } = siap(['https://uji.test/', 'https://uji.test/b'])
  await mobileParityHandler(job(runId, siteId), db, async (urls) =>
    // Hanya satu dari dua yang kembali — persis bentuk kegagalan sungguhannya.
    [rusak(urls[0]!)],
  )
  expect(temuan(db, siteId).length).toBe(1)
})

test('situs yang tidak ada melempar, karena itu bug pemanggil', async () => {
  const { db } = siap([])
  await expect(
    mobileParityHandler(job(1, 9999), db, async () => []),
  ).rejects.toThrow(/9999/)
})

test('temuan mobile tidak menyentuh kategori lain', async () => {
  // `reconcile` bekerja per kategori. Kalau argumen kategorinya salah, temuan
  // SEO milik situs ini akan ditandai beres oleh job ini.
  const { db, siteId, runId } = siap(['https://uji.test/'])
  db.prepare(
    `INSERT INTO findings (site_id, page_id, category, severity, rule, title, fingerprint,
                           first_seen_run, last_seen_run, status)
     VALUES (?, NULL, 'seo', 'medium', 'judul-hilang', 'Judul hilang', 'fp1', ?, ?, 'open')`,
  ).run(siteId, runId, runId)

  await mobileParityHandler(job(runId, siteId), db, async (urls) => urls.map(rusak))

  const seo = db
    .prepare("SELECT status FROM findings WHERE site_id = ? AND category = 'seo'")
    .get(siteId) as { status: string }
  expect(seo.status).toBe('open')
})
