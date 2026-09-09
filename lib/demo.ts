import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Severity } from './findings.ts'
import { KATEGORI, type Kategori } from './kategori.ts'

/**
 * Lapisan baca untuk halaman demo.
 *
 * SENGAJA TIDAK memakai `lib/db.ts` maupun `lib/ui/queries.ts`. Bukan karena
 * keduanya buruk, tapi karena demo punya satu syarat yang tidak boleh
 * dilanggar: ia tidak boleh bisa menulis ke mana pun, dan tidak boleh bisa
 * menyentuh `data.db`.
 *
 * `getDb()` di `lib/db.ts` menyimpan satu koneksi bersama ke `DB_PATH`, dan
 * berbagi jalur itu berarti satu kesalahan konfigurasi sudah cukup untuk
 * membuat halaman demo membaca — atau lebih buruk, menulis — data situs
 * sungguhan. Berkas ini membuka koneksinya sendiri dengan `readOnly: true`,
 * ke berkas yang namanya tidak bisa dikonfigurasi.
 *
 * Juga tidak ada `migrate()` dan tidak ada `PRAGMA journal_mode = WAL`:
 * keduanya menulis, dan di Vercel bundle-nya read-only.
 */

/** Nama berkasnya tetap, bukan dari env. Env yang bisa diubah berarti halaman
 *  demo yang bisa diarahkan ke `data.db` — dan seluruh alasan berkas ini ada
 *  adalah supaya itu tidak mungkin. */
const BERKAS = 'demo.db'

let koneksi: DatabaseSync | null = null

export function adaDemo(): boolean {
  return existsSync(join(process.cwd(), BERKAS))
}

function db(): DatabaseSync {
  if (!koneksi) {
    koneksi = new DatabaseSync(join(process.cwd(), BERKAS), { readOnly: true })
    koneksi.exec('PRAGMA busy_timeout = 5000')
  }
  return koneksi
}

export type SitusDemo = {
  id: number
  nama: string
  base_url: string
  terbuka: number
  waktu: string | null
}

export type TemuanDemo = {
  id: number
  category: string
  severity: Severity
  rule: string
  title: string
  detail_json: string
  url: string | null
  first_seen_run: number
  last_seen_run: number
}

export function situsDemo(): SitusDemo[] {
  return (
    db()
      .prepare(
        `SELECT s.id, s.name AS nama, s.base_url,
                (SELECT COUNT(*) FROM findings f
                 WHERE f.site_id = s.id AND f.status = 'open') AS terbuka,
                (SELECT strftime('%Y-%m-%d %H:%M', MAX(r.finished_at), 'localtime')
                 FROM runs r WHERE r.site_id = s.id AND r.status = 'done') AS waktu
         FROM sites s ORDER BY s.id`,
      )
      .all() as unknown as SitusDemo[]
  ).map((s) => ({ ...s }))
}

/** Urutan severity, sama dengan aplikasi sungguhan: paling parah dulu, karena
 *  itu urutan kerja. */
const URUTAN = `CASE f.severity
  WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
  WHEN 'low' THEN 3 ELSE 4 END`

export function temuanDemo(siteId: number, category: string): TemuanDemo[] {
  return (
    db()
      .prepare(
        `SELECT f.id, f.category, f.severity, f.rule, f.title, f.detail_json,
                p.url AS url, f.first_seen_run, f.last_seen_run
         FROM findings f LEFT JOIN pages p ON p.id = f.page_id
         WHERE f.site_id = ? AND f.category = ? AND f.status = 'open'
         ORDER BY ${URUTAN}, f.rule, p.url`,
      )
      .all(siteId, category) as unknown as TemuanDemo[]
  ).map((t) => ({ ...t }))
}

/** Hitungan per kategori, untuk menandai tab mana yang punya isi. */
export function hitungKategori(siteId: number): Record<string, number> {
  const baris = db()
    .prepare(
      `SELECT category, COUNT(*) AS n FROM findings
       WHERE site_id = ? AND status = 'open' GROUP BY category`,
    )
    .all(siteId) as { category: string; n: number }[]

  const peta: Record<string, number> = {}
  for (const k of KATEGORI) peta[k] = 0
  for (const b of baris) peta[b.category] = Number(b.n)
  return peta
}

export function skorDemo(siteId: number) {
  return (
    db()
      .prepare(
        `SELECT p.url, l.strategy, l.perf, l.a11y, l.best_practices, l.seo
         FROM lighthouse l JOIN pages p ON p.id = l.page_id
         WHERE p.site_id = ?
           AND l.id = (SELECT MAX(l2.id) FROM lighthouse l2
                       WHERE l2.page_id = l.page_id AND l2.strategy = l.strategy)
         ORDER BY l.strategy, p.url`,
      )
      .all(siteId) as unknown as {
      url: string
      strategy: string
      perf: number | null
      a11y: number | null
      best_practices: number | null
      seo: number | null
    }[]
  ).map((r) => ({ ...r }))
}

export function adalahKategori(k: string): k is Kategori {
  return (KATEGORI as readonly string[]).includes(k)
}
