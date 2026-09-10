import type { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { dirSitus, namaTangkapan } from '../tangkapan.ts'
import { LEBAR, type NamaLebar } from '../scanners/mobile-parity.ts'

export type StripHalaman = {
  url: string
  /** Nama berkas per lebar. Lebar yang gagal dipotret tidak muncul di peta. */
  berkas: Partial<Record<NamaLebar, string>>
}

/**
 * Tangkapan layar yang tersedia untuk satu situs, dikelompokkan per halaman.
 *
 * ============================================================================
 * KENAPA DICOCOKKAN, BUKAN DIDAFTAR
 * ============================================================================
 * Nama berkasnya adalah hash dari URL-nya (lihat `lib/tangkapan.ts`), jadi
 * membaca isi direktori hanya memberi hash — bukan URL. Yang dilakukan di sini
 * adalah arah sebaliknya: ambil URL halaman yang diketahui situs ini, hitung
 * hash-nya, lalu periksa berkasnya ada atau tidak.
 *
 * Untungnya dua: tidak ada tabel baru untuk memetakan hash ke URL, dan berkas
 * yatim (dari halaman yang sudah dihapus) tidak akan pernah muncul di layar.
 *
 * `base_url` ikut diperiksa karena situs yang belum pernah dijelajah diukur
 * pada berandanya, dan beranda itu belum ada di tabel `pages`.
 */
export function tangkapanSitus(db: DatabaseSync, siteId: number): StripHalaman[] {
  const situs = db.prepare('SELECT base_url FROM sites WHERE id = ?').get(siteId) as
    | { base_url: string }
    | undefined
  if (!situs) return []

  const halaman = db
    .prepare('SELECT url FROM pages WHERE site_id = ? ORDER BY id')
    .all(siteId) as { url: string }[]

  const dir = dirSitus(siteId)
  const urls = [situs.base_url, ...halaman.map((h) => h.url)]
  const hasil: StripHalaman[] = []
  const sudah = new Set<string>()

  for (const url of urls) {
    if (sudah.has(url)) continue
    sudah.add(url)

    const berkas: Partial<Record<NamaLebar, string>> = {}
    for (const l of LEBAR) {
      const nama = namaTangkapan(url, l.nama)
      if (existsSync(join(dir, nama))) berkas[l.nama] = nama
    }
    if (Object.keys(berkas).length > 0) hasil.push({ url, berkas })
  }

  return hasil
}
