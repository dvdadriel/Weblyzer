import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { upsertPage } from '../lib/repos/pages.ts'
import { reconcile } from '../lib/findings.ts'
import { ringkasanSitus, temuanKategori, keadaanKategori } from '../lib/ui/queries.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
})

function situsDenganTemuan() {
  const site = createSite(db, { name: 'A', base_url: 'https://a.test' })
  const page = upsertPage(db, site.id, { url: 'https://a.test/x', statusCode: 500, loadMs: 10 })
  const run = createRun(db, site.id, 'full')
  reconcile(db, site.id, run.id, 'bugs', [
    { url: 'https://a.test/x', pageId: page.id, severity: 'critical', rule: 'http-error', title: 'HTTP 500' },
    { url: 'https://a.test/y', pageId: null, severity: 'low', rule: 'blank-page', title: 'Kosong' },
  ])
  finishRun(db, run.id, 'done')
  return { site, run }
}

test('ringkasan situs menghitung temuan terbuka per severity', () => {
  const { site } = situsDenganTemuan()
  const [r] = ringkasanSitus(db)
  expect(r!.id).toBe(site.id)
  expect(r!.terbuka.critical).toBe(1)
  expect(r!.terbuka.low).toBe(1)
  expect(r!.totalTerbuka).toBe(2)
})

test('temuan yang sudah fixed tidak ikut dihitung terbuka', () => {
  const { site } = situsDenganTemuan()
  const run2 = createRun(db, site.id, 'full')
  reconcile(db, site.id, run2.id, 'bugs', [])
  const [r] = ringkasanSitus(db)
  expect(r!.totalTerbuka).toBe(0)
})

test('situs tanpa run apa pun ditandai belum pernah dipindai', () => {
  createSite(db, { name: 'Baru', base_url: 'https://baru.test' })
  const [r] = ringkasanSitus(db)
  expect(r!.keadaan).toBe('belum-dipindai')
})

test('situs bersih dibedakan dari situs yang pemindaiannya gagal', () => {
  const bersih = createSite(db, { name: 'Bersih', base_url: 'https://bersih.test' })
  finishRun(db, createRun(db, bersih.id, 'full').id, 'done')

  const gagal = createSite(db, { name: 'Gagal', base_url: 'https://gagal.test' })
  finishRun(db, createRun(db, gagal.id, 'full').id, 'failed', 'Situs tidak terjangkau')

  const peta = new Map(ringkasanSitus(db).map((r) => [r.nama, r]))
  expect(peta.get('Bersih')!.keadaan).toBe('bersih')
  expect(peta.get('Gagal')!.keadaan).toBe('gagal')
  expect(peta.get('Gagal')!.pesanGagal).toContain('tidak terjangkau')
})

test('temuan diurutkan paling parah dulu', () => {
  const { site } = situsDenganTemuan()
  const baris = temuanKategori(db, site.id, 'bugs')
  expect(baris.map((b) => b.severity)).toEqual(['critical', 'low'])
})

test('temuan membawa URL halaman dan umurnya dalam run', () => {
  const { site, run } = situsDenganTemuan()
  const [b] = temuanKategori(db, site.id, 'bugs')
  expect(b!.url).toBe('https://a.test/x')
  expect(b!.first_seen_run).toBe(run.id)
})

test('temuan yang diabaikan tidak muncul di daftar terbuka tetapi bisa diminta', () => {
  const { site } = situsDenganTemuan()
  db.prepare("UPDATE findings SET status = 'ignored' WHERE rule = 'blank-page'").run()

  expect(temuanKategori(db, site.id, 'bugs').map((b) => b.rule)).toEqual(['http-error'])
  expect(temuanKategori(db, site.id, 'bugs', 'ignored').map((b) => b.rule)).toEqual(['blank-page'])
})

test('keadaan kategori membedakan belum-dipindai, bersih, dan gagal', () => {
  const site = createSite(db, { name: 'A', base_url: 'https://a.test' })
  expect(keadaanKategori(db, site.id, 'bugs')).toBe('belum-dipindai')

  finishRun(db, createRun(db, site.id, 'full').id, 'done')
  expect(keadaanKategori(db, site.id, 'bugs')).toBe('bersih')

  finishRun(db, createRun(db, site.id, 'full').id, 'failed', 'gagal')
  expect(keadaanKategori(db, site.id, 'bugs')).toBe('gagal')
})

test('daftar kosong tidak melempar', () => {
  expect(ringkasanSitus(db)).toEqual([])
})
