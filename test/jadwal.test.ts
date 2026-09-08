import { test, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite, updateSite } from '../lib/repos/sites.ts'
import { createRun, getRun } from '../lib/repos/runs.ts'
import { LANGKAH, situsTerjadwal, pemicuDari } from '../lib/jadwal.ts'

test('hanya situs enabled yang ikut jadwal', () => {
  const db = openDb(':memory:')
  createSite(db, { name: 'Springair', base_url: 'https://springair.test' })
  const comforta = createSite(db, { name: 'Comforta', base_url: 'https://comforta.test' })
  createSite(db, { name: 'iSleep', base_url: 'https://isleep.test' })

  expect(situsTerjadwal(db).map((s) => s.name)).toEqual(['Springair', 'Comforta', 'iSleep'])

  updateSite(db, comforta.id, { enabled: 0 })
  expect(situsTerjadwal(db).map((s) => s.name)).toEqual(['Springair', 'iSleep'])
  db.close()
})

test('situs yang dinonaktifkan tidak terhapus, hanya dilewati', () => {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'A', base_url: 'https://a.test', enabled: 0 })
  expect(situsTerjadwal(db)).toHaveLength(0)

  // Temuan lamanya harus tetap terbaca — menonaktifkan situs adalah keputusan
  // soal jadwal, bukan perintah melupakan riwayatnya.
  updateSite(db, site.id, { enabled: 1 })
  expect(situsTerjadwal(db).map((s) => s.id)).toEqual([site.id])
  db.close()
})

test('jadwal kosong dibedakan dari jadwal yang tidak menemukan apa-apa', () => {
  const db = openDb(':memory:')
  expect(situsTerjadwal(db)).toEqual([])
  db.close()
})

test('pemicu hanya scheduled bila env-nya tepat', () => {
  expect(pemicuDari({ WEBLYZER_TRIGGER: 'scheduled' })).toBe('scheduled')
  expect(pemicuDari({})).toBe('manual')
  expect(pemicuDari({ WEBLYZER_TRIGGER: '' })).toBe('manual')
  expect(pemicuDari({ WEBLYZER_TRIGGER: 'cron' })).toBe('manual')
  expect(pemicuDari({ WEBLYZER_TRIGGER: 'Scheduled' })).toBe('manual')
  expect(pemicuDari({ WEBLYZER_TRIGGER: '1' })).toBe('manual')
})

test('run bertanda scheduled tersimpan dan terbaca kembali', () => {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'A', base_url: 'https://a.test' })

  const manual = createRun(db, site.id, 'full')
  expect(getRun(db, manual.id)?.trigger).toBe('manual')

  const terjadwal = createRun(db, site.id, 'full', pemicuDari({ WEBLYZER_TRIGGER: 'scheduled' }))
  expect(getRun(db, terjadwal.id)?.trigger).toBe('scheduled')
  db.close()
})

test('tiap situs dipindai sekaligus diukur Lighthouse', () => {
  // Jadwal yang hanya menjalankan `scan` akan membuat tab Lighthouse basi
  // selamanya, dan kebasian itu justru yang ingin dihilangkan alat ini.
  expect(LANGKAH).toEqual(['scan', 'lighthouse'])
})
