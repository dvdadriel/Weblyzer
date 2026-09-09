import { test, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { reconcile, AMBANG_HILANG, type NewFinding } from '../lib/findings.ts'
import { temuanKategori } from '../lib/ui/queries.ts'

function siap() {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Uji', base_url: 'https://uji.test' })
  return { db, siteId: site.id }
}

const t = (rule: string): NewFinding => ({
  url: 'https://uji.test/',
  pageId: null,
  severity: 'medium',
  rule,
  title: `Judul untuk ${rule}`,
})

/** Menjalankan satu analisis kategori `geo` dan mengembalikan hasilnya. */
function analisis(db: ReturnType<typeof openDb>, siteId: number, temuan: NewFinding[]) {
  const run = createRun(db, siteId, 'geo')
  const hasil = reconcile(db, siteId, run.id, 'geo', temuan, 'lunak')
  finishRun(db, run.id, 'done')
  return hasil
}

const status = (db: ReturnType<typeof openDb>, siteId: number) =>
  Object.fromEntries(
    (
      db
        .prepare("SELECT rule, status FROM findings WHERE site_id = ? AND category = 'geo'")
        .all(siteId) as { rule: string; status: string }[]
    ).map((r) => [r.rule, r.status]),
  )

/* ── mode lunak: satu kali absen belum berarti beres ────────────────────── */

/**
 * Ini bug yang terukur dan yang memicu seluruh mode ini: setelah audit disuruh
 * berhenti melaporkan apa yang sudah dilaporkan GEO, `reconcile` menandai enam
 * temuan `fixed`. Tidak satu pun diperbaiki — audit cuma berhenti menyebutnya.
 */
test('temuan yang absen sekali TETAP terbuka', () => {
  const { db, siteId } = siap()
  analisis(db, siteId, [t('a'), t('b')])
  expect(status(db, siteId)).toEqual({ a: 'open', b: 'open' })

  analisis(db, siteId, [t('a')])
  expect(status(db, siteId)).toEqual({ a: 'open', b: 'open' })
  db.close()
})

test('temuan yang absen dua analisis berturut-turut baru ditandai beres', () => {
  const { db, siteId } = siap()
  analisis(db, siteId, [t('a'), t('b')])
  analisis(db, siteId, [t('a')])
  const h = analisis(db, siteId, [t('a')])

  expect(status(db, siteId)).toEqual({ a: 'open', b: 'fixed' })
  expect(h.fixed).toBe(1)
  db.close()
})

test('ambangnya dua, dan itu yang diuji — bukan angka yang kebetulan lolos', () => {
  expect(AMBANG_HILANG).toBe(2)
})

/**
 * Temuan yang muncul lagi sebelum ambang tercapai harus mengulang hitungannya
 * dari nol. Tanpa ini, temuan yang berkedip sekali akan tetap ditandai beres
 * pada analisis berikutnya walau model menyebutnya lagi.
 */
test('temuan yang muncul lagi mengulang hitungan dari nol', () => {
  const { db, siteId } = siap()
  analisis(db, siteId, [t('a'), t('b')])
  analisis(db, siteId, [t('a')])
  analisis(db, siteId, [t('a'), t('b')])
  expect(status(db, siteId)).toEqual({ a: 'open', b: 'open' })

  analisis(db, siteId, [t('a')])
  expect(status(db, siteId)).toEqual({ a: 'open', b: 'open' })
  db.close()
})

test('ignored tetap lengket dan tidak pernah ditandai beres', () => {
  // Keputusan manual pengguna tidak boleh dibatalkan oleh model yang berhenti
  // menyebutnya — itu akan menghapus "saya sudah putuskan ini tidak dikerjakan".
  const { db, siteId } = siap()
  analisis(db, siteId, [t('a'), t('b')])
  db.prepare("UPDATE findings SET status = 'ignored' WHERE rule = 'b'").run()

  analisis(db, siteId, [t('a')])
  analisis(db, siteId, [t('a')])
  analisis(db, siteId, [t('a')])
  expect(status(db, siteId)).toEqual({ a: 'open', b: 'ignored' })
  db.close()
})

test('analisis kategori LAIN tidak ikut menghitung', () => {
  // Nomor run global dan naik karena situs maupun kategori lain juga jalan.
  // Menghitung dari selisih nomor run akan menandai temuan geo beres hanya
  // karena ada beberapa scan bug di antaranya.
  const { db, siteId } = siap()
  analisis(db, siteId, [t('a'), t('b')])

  for (let i = 0; i < 5; i++) {
    const lain = createRun(db, siteId, 'bugs')
    finishRun(db, lain.id, 'done')
  }

  analisis(db, siteId, [t('a')])
  expect(status(db, siteId)).toEqual({ a: 'open', b: 'open' })
  db.close()
})

/* ── mode tegas tidak berubah ────────────────────────────────────────────── */

test('mode tegas tetap menandai beres seketika', () => {
  // Untuk aturan deterministik "tidak dilaporkan" memang berarti terukur
  // beres: `judul-hilang` yang tidak muncul lagi berarti judulnya ada.
  const { db, siteId } = siap()
  const r1 = createRun(db, siteId, 'seo')
  reconcile(db, siteId, r1.id, 'seo', [t('x'), t('y')])
  finishRun(db, r1.id, 'done')

  const r2 = createRun(db, siteId, 'seo')
  const h = reconcile(db, siteId, r2.id, 'seo', [t('x')])
  finishRun(db, r2.id, 'done')

  const st = Object.fromEntries(
    (
      db
        .prepare("SELECT rule, status FROM findings WHERE site_id = ? AND category = 'seo'")
        .all(siteId) as { rule: string; status: string }[]
    ).map((r) => [r.rule, r.status]),
  )
  expect(st).toEqual({ x: 'open', y: 'fixed' })
  expect(h.fixed).toBe(1)
  db.close()
})

/* ── UI melihat bedanya ──────────────────────────────────────────────────── */

/**
 * Dibiarkan terlihat sama dengan yang baru dikonfirmasi, temuan yang sudah
 * tidak disebut model menyuruh orang mengerjakan sesuatu yang mungkin sudah
 * tidak ada.
 */
test('UI bisa membedakan temuan yang masih disebut dari yang sudah tidak', () => {
  const { db, siteId } = siap()
  analisis(db, siteId, [t('a'), t('b')])
  analisis(db, siteId, [t('a')])

  const baris = temuanKategori(db, siteId, 'geo')
  const peta = Object.fromEntries(baris.map((x) => [x.rule, x.terlewat]))
  expect(peta.a).toBe(0)
  expect(peta.b).toBe(1)
  db.close()
})

test('terlewat kembali nol begitu temuannya disebut lagi', () => {
  const { db, siteId } = siap()
  analisis(db, siteId, [t('a')])
  analisis(db, siteId, [])
  expect(temuanKategori(db, siteId, 'geo')[0]!.terlewat).toBe(1)

  analisis(db, siteId, [t('a')])
  expect(temuanKategori(db, siteId, 'geo')[0]!.terlewat).toBe(0)
  db.close()
})
