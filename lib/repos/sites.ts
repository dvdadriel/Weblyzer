import type { DatabaseSync } from 'node:sqlite'

export type LighthouseMode = 'sample' | 'full'
export type LighthouseStrategy = 'mobile' | 'both'

export type Site = {
  id: number
  name: string
  base_url: string
  sitemap_url: string | null
  max_pages: number
  lighthouse_mode: LighthouseMode
  lighthouse_strategy: LighthouseStrategy
  enabled: number
  created_at: string
  /**
   * Pemilik situs. Tepat satu dari keduanya terisi pada situs baru.
   *
   * Keduanya bisa NULL pada situs warisan — yang dibuat sebelum multi-user
   * ada. `scripts/seed-akun.ts` memberikannya ke admin pertama; sampai itu
   * jalan, situs itu tidak terlihat oleh siapa pun kecuali admin (lihat
   * `filterPemilik`).
   */
  user_id: number | null
  guest_id: string | null
}

export type SiteInput = {
  name: string
  base_url: string
  sitemap_url?: string | null
  max_pages?: number
  lighthouse_mode?: LighthouseMode
  lighthouse_strategy?: LighthouseStrategy
  enabled?: number
  user_id?: number | null
  guest_id?: string | null
}

/**
 * Menyeragamkan base_url agar satu situs tidak tersimpan dua kali hanya karena
 * beda garis miring atau kapitalisasi host.
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`base_url harus diawali http:// atau https:// — diterima: ${raw}`)
  }
  const url = new URL(trimmed)
  url.hash = ''
  url.search = ''
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.protocol}//${url.host.toLowerCase()}${path}`
}

const COLUMNS = `id, name, base_url, sitemap_url, max_pages,
                 lighthouse_mode, lighthouse_strategy, enabled, created_at,
                 user_id, guest_id`

export function createSite(db: DatabaseSync, input: SiteInput): Site {
  // Dua pemilik sekaligus berarti pemanggil salah memasang konteks, dan
  // akibatnya situs yang muncul di dua tempat dengan dua aturan kuota.
  // Ditolak di sini karena SQLite tidak bisa menahannya: baris warisan
  // punya kedua kolom NULL, jadi CHECK "tepat satu" akan menggagalkan
  // migrasi 002 sebelum seed sempat jalan.
  if (input.user_id != null && input.guest_id != null) {
    throw new Error('Situs tidak boleh dimiliki user dan guest sekaligus.')
  }

  const row = db
    .prepare(
      `INSERT INTO sites (name, base_url, sitemap_url, max_pages,
                          lighthouse_mode, lighthouse_strategy, enabled,
                          user_id, guest_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING ${COLUMNS}`,
    )
    .get(
      input.name,
      normalizeBaseUrl(input.base_url),
      input.sitemap_url ?? null,
      input.max_pages ?? 200,
      input.lighthouse_mode ?? 'sample',
      input.lighthouse_strategy ?? 'mobile',
      input.enabled ?? 1,
      input.user_id ?? null,
      input.guest_id ?? null,
    )
  return row as unknown as Site
}

/**
 * Seluruh situs, tanpa penyaring pemilik.
 *
 * Dipakai penjadwal dan CLI, yang memang harus melihat semuanya — pemindaian
 * tengah malam tidak punya session. UI TIDAK memakai ini: lihat
 * `ringkasanSitus` di `lib/ui/queries.ts`, yang lewat `filterPemilik`.
 */
export function listSites(db: DatabaseSync): Site[] {
  return db.prepare(`SELECT ${COLUMNS} FROM sites ORDER BY id`).all() as unknown as Site[]
}

export function getSite(db: DatabaseSync, id: number): Site | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM sites WHERE id = ?`).get(id)
  return row as unknown as Site | undefined
}

const UPDATABLE = [
  'name',
  'base_url',
  'sitemap_url',
  'max_pages',
  'lighthouse_mode',
  'lighthouse_strategy',
  'enabled',
] as const

export function updateSite(db: DatabaseSync, id: number, patch: Partial<SiteInput>): Site {
  const sets: string[] = []
  const values: (string | number | null)[] = []

  for (const key of UPDATABLE) {
    const value = patch[key]
    if (value === undefined) continue
    sets.push(`${key} = ?`)
    values.push(key === 'base_url' ? normalizeBaseUrl(String(value)) : (value as string | number))
  }

  if (sets.length === 0) {
    const current = getSite(db, id)
    if (!current) throw new Error(`Situs ${id} tidak ditemukan`)
    return current
  }

  values.push(id)
  const row = db
    .prepare(`UPDATE sites SET ${sets.join(', ')} WHERE id = ? RETURNING ${COLUMNS}`)
    .get(...values)
  if (!row) throw new Error(`Situs ${id} tidak ditemukan`)
  return row as unknown as Site
}

export function deleteSite(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM sites WHERE id = ?').run(id)
}
