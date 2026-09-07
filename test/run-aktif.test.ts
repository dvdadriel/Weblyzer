import { expect, test } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { runAktif } from '../lib/ui/queries.ts'

function siap() {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
  return { db, siteId: site.id }
}

/** Menyisipkan run dengan `started_at` relatif terhadap sekarang. */
function run(db: ReturnType<typeof openDb>, siteId: number, status: string, geser: string) {
  db.prepare(
    `INSERT INTO runs (site_id, type, trigger, status, started_at)
     VALUES (?, 'full', 'manual', ?, datetime('now', ?))`,
  ).run(siteId, status, geser)
}

test('tidak ada run berarti tombol boleh muncul', () => {
  const { db, siteId } = siap()
  expect(runAktif(db, siteId)).toBeUndefined()
})

test('run queued yang baru terhitung aktif', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'queued', '-10 seconds')
  expect(runAktif(db, siteId)?.mulai).toMatch(/^\d{2}:\d{2}$/)
})

test('run running juga terhitung aktif', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'running', '-1 minute')
  expect(runAktif(db, siteId)).toBeDefined()
})

test('run yang sudah selesai tidak menahan tombol', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'done', '-10 seconds')
  run(db, siteId, 'failed', '-20 seconds')
  expect(runAktif(db, siteId)).toBeUndefined()
})

/**
 * Inti AMBANG_MACET. Pekerja yang di-kill -9 meninggalkan baris `queued`
 * selamanya; tanpa ambang ini tombol pindai mati permanen dan satu-satunya
 * jalan keluar adalah menyunting database.
 */
test('run queued yang macet lebih dari ambang dilepaskan', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'queued', '-31 minutes')
  expect(runAktif(db, siteId)).toBeUndefined()
})

test('run tepat di dalam ambang masih menahan tombol', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'queued', '-29 minutes')
  expect(runAktif(db, siteId)).toBeDefined()
})

test('run situs lain tidak menahan tombol situs ini', () => {
  const { db, siteId } = siap()
  const lain = createSite(db, { name: 'Lain', base_url: 'https://lain.test' })
  run(db, lain.id, 'queued', '-10 seconds')
  expect(runAktif(db, siteId)).toBeUndefined()
  expect(runAktif(db, lain.id)).toBeDefined()
})

/**
 * Baris `node:sqlite` berprototipe null dan React menolak meneruskannya ke
 * client component. Sudah terjadi: halaman 200 selama tidak ada pemindaian dan
 * 500 tepat ketika ada — jalur rusak yang paling jarang dilihat.
 */
test('hasilnya objek biasa, bukan prototipe null', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'queued', '-10 seconds')
  expect(Object.getPrototypeOf(runAktif(db, siteId)!)).toBe(Object.prototype)
})
