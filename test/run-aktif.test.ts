import { expect, test } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { runAktif, waktuScanKategori } from '../lib/ui/queries.ts'

function siap() {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
  return { db, siteId: site.id }
}

/** Menyisipkan run dengan `started_at` relatif terhadap sekarang. */
function run(
  db: ReturnType<typeof openDb>,
  siteId: number,
  status: string,
  geser: string,
  type = 'full',
  pemicu: 'manual' | 'scheduled' = 'manual',
) {
  // `finished_at` diisi hanya untuk run yang selesai, sama seperti finishRun.
  const selesai = status === 'done' ? "datetime('now', ?)" : 'NULL'
  const sql = `INSERT INTO runs (site_id, type, trigger, status, started_at, finished_at)
               VALUES (?, ?, ?, ?, datetime('now', ?), ${selesai})`
  const args: unknown[] = [siteId, type, pemicu, status, geser]
  if (status === 'done') args.push(geser)
  db.prepare(sql).run(...(args as never[]))
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

/* ── waktuScanKategori ──────────────────────────────────────────────────── */

test('kategori yang belum pernah dipindai tidak melaporkan waktu', () => {
  const { db, siteId } = siap()
  expect(waktuScanKategori(db, siteId, 'bugs')).toBeNull()
})

test('run yang belum selesai belum menghasilkan waktu', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'queued', '-1 minute', 'bugs')
  expect(waktuScanKategori(db, siteId, 'bugs')).toBeNull()
})

test('waktunya lokal dan tanpa detik', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'done', '-5 minutes', 'bugs')
  expect(waktuScanKategori(db, siteId, 'bugs')?.waktu).toMatch(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
  )
})

test('pemindaian manual tidak ditandai terjadwal', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'done', '-5 minutes', 'bugs')
  expect(waktuScanKategori(db, siteId, 'bugs')?.terjadwal).toBe(false)
})

test('pemindaian terjadwal ditandai terjadwal', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'done', '-5 minutes', 'bugs', 'scheduled')
  expect(waktuScanKategori(db, siteId, 'bugs')?.terjadwal).toBe(true)
})

test('penanda mengikuti run TERAKHIR, bukan run mana pun yang terjadwal', () => {
  // Kalau penandanya dibaca dengan EXISTS, satu pemindaian terjadwal di masa
  // lalu akan menandai selamanya — dan kaki tabel akan mengaku angkanya
  // datang dari semalam padahal baru saja ditekan orang.
  const { db, siteId } = siap()
  run(db, siteId, 'done', '-2 hours', 'bugs', 'scheduled')
  run(db, siteId, 'done', '-5 minutes', 'bugs', 'manual')
  expect(waktuScanKategori(db, siteId, 'bugs')?.terjadwal).toBe(false)
})

test('hasil waktuScanKategori adalah objek biasa, bukan baris node:sqlite', () => {
  // Diteruskan ke TabelTemuan yang client component; baris berprototipe null
  // membuat React melempar "Only plain objects can be passed".
  const { db, siteId } = siap()
  run(db, siteId, 'done', '-5 minutes', 'bugs')
  expect(Object.getPrototypeOf(waktuScanKategori(db, siteId, 'bugs')!)).toBe(Object.prototype)
})

/**
 * Pemindaian lewat CLI tanpa argumen kategori bertipe `full` dan memang
 * menyentuh kategori ini. Mengabaikannya akan melaporkan "belum pernah" untuk
 * data yang jelas ada di tabel.
 */
test('run full ikut dihitung sebagai pemindaian kategori', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'done', '-5 minutes', 'full')
  expect(waktuScanKategori(db, siteId, 'bugs')).not.toBeNull()
})

test('kategori lain tidak dianggap memindai kategori ini', () => {
  const { db, siteId } = siap()
  run(db, siteId, 'done', '-5 minutes', 'security')
  expect(waktuScanKategori(db, siteId, 'bugs')).toBeNull()
  expect(waktuScanKategori(db, siteId, 'security')).not.toBeNull()
})

test('run gagal tidak dilaporkan sebagai waktu pemindaian', () => {
  const { db, siteId } = siap()
  db.prepare(
    `INSERT INTO runs (site_id, type, trigger, status, started_at, finished_at)
     VALUES (?, 'bugs', 'manual', 'failed', datetime('now'), datetime('now'))`,
  ).run(siteId)
  expect(waktuScanKategori(db, siteId, 'bugs')).toBeNull()
})
