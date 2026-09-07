import { expect, test } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { reconcile, fingerprintOf } from '../lib/findings.ts'
import { recheck } from '../lib/recheck.ts'
import { startFixtureServer } from './fixture-server.ts'

function siap(baseUrl: string) {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Uji', base_url: baseUrl })
  const run = createRun(db, site.id, 'bugs')
  return { db, siteId: site.id, runId: run.id }
}

/** Menanam temuan yang fingerprint-nya cocok dengan cara reconcile menghitung. */
function tanam(
  db: ReturnType<typeof openDb>,
  siteId: number,
  runId: number,
  category: string,
  url: string,
  rule: string,
  key = '',
) {
  reconcile(db, siteId, runId, category, [
    { url, pageId: null, severity: 'critical', rule, title: `uji ${rule}`, key, detail: {} },
  ])
  const fp = fingerprintOf(url, rule, key)
  return (
    db.prepare('SELECT id FROM findings WHERE site_id = ? AND fingerprint = ?').get(siteId, fp) as {
      id: number
    }
  ).id
}

test('temuan yang sudah tidak muncul lagi ditandai beres', async () => {
  const server = await startFixtureServer('basic')
  try {
    const { db, siteId, runId } = siap(server.url)
    // `http-error` pada halaman yang sehat: analyzer tidak akan menghasilkannya lagi.
    const id = tanam(db, siteId, runId, 'bugs', server.url, 'http-error')
    expect(await recheck(db, id)).toEqual({ keadaan: 'beres' })
    expect(
      (db.prepare('SELECT status FROM findings WHERE id = ?').get(id) as { status: string }).status,
    ).toBe('fixed')
  } finally {
    await server.close()
  }
}, 60_000)

/**
 * Jaminan yang menjadi alasan `recheck` tidak memakai `reconcile`: satu
 * pemeriksaan tidak boleh menyentuh temuan lain di kategori yang sama.
 */
test('temuan lain di kategori yang sama tidak tersentuh', async () => {
  const server = await startFixtureServer('basic')
  try {
    const { db, siteId, runId } = siap(server.url)
    reconcile(db, siteId, runId, 'bugs', [
      { url: server.url, pageId: null, severity: 'critical', rule: 'http-error', title: 'a', detail: {} },
      { url: `${server.url}lain`, pageId: null, severity: 'high', rule: 'broken-image', title: 'b', detail: {} },
      { url: `${server.url}lain2`, pageId: null, severity: 'low', rule: 'blank-page', title: 'c', detail: {} },
    ])
    const id = (
      db.prepare('SELECT id FROM findings WHERE fingerprint = ?').get(
        fingerprintOf(server.url, 'http-error'),
      ) as { id: number }
    ).id

    expect(await recheck(db, id)).toEqual({ keadaan: 'beres' })

    const lain = db
      .prepare("SELECT rule, status FROM findings WHERE id != ? ORDER BY rule").all(id) as unknown as
      { rule: string; status: string }[]
    expect(lain).toEqual([
      { rule: 'blank-page', status: 'open' },
      { rule: 'broken-image', status: 'open' },
    ])
  } finally {
    await server.close()
  }
}, 60_000)

/**
 * Halaman tak terjangkau BUKAN halaman yang beres. Ini versi satu-baris dari
 * bug yang sudah tiga kali muncul di lapisan data proyek ini.
 */
test('halaman tak terjangkau tidak dianggap beres', async () => {
  // Port yang tidak ada yang mendengarkan.
  const { db, siteId, runId } = siap('http://127.0.0.1:9/')
  const id = tanam(db, siteId, runId, 'bugs', 'http://127.0.0.1:9/', 'http-error')
  const h = await recheck(db, id)
  expect(h.keadaan).toBe('tak-terjangkau')
  expect(
    (db.prepare('SELECT status FROM findings WHERE id = ?').get(id) as { status: string }).status,
  ).toBe('open')
}, 60_000)

test('kategori lighthouse ditolak dengan alasan, bukan diam', async () => {
  const { db, siteId, runId } = siap('http://127.0.0.1:9/')
  const id = tanam(db, siteId, runId, 'lighthouse', 'http://127.0.0.1:9/', 'lighthouse-audit')
  const h = await recheck(db, id)
  expect(h.keadaan).toBe('tak-didukung')
  expect(h.keadaan === 'tak-didukung' && h.pesan).toMatch(/lighthouse/i)
})

test('temuan yang tidak ada melempar', async () => {
  const { db } = siap('http://127.0.0.1:9/')
  await expect(recheck(db, 9999)).rejects.toThrow(/tidak ditemukan/)
})

/** `ignored` bersifat lengket di reconcile; recheck tidak boleh jadi pintu belakang. */
test('temuan yang diabaikan tidak diubah jadi fixed', async () => {
  const server = await startFixtureServer('basic')
  try {
    const { db, siteId, runId } = siap(server.url)
    const id = tanam(db, siteId, runId, 'bugs', server.url, 'http-error')
    db.prepare("UPDATE findings SET status = 'ignored' WHERE id = ?").run(id)
    await recheck(db, id)
    expect(
      (db.prepare('SELECT status FROM findings WHERE id = ?').get(id) as { status: string }).status,
    ).toBe('ignored')
  } finally {
    await server.close()
  }
}, 60_000)
