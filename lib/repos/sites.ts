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
}

export type SiteInput = {
  name: string
  base_url: string
  sitemap_url?: string | null
  max_pages?: number
  lighthouse_mode?: LighthouseMode
  lighthouse_strategy?: LighthouseStrategy
  enabled?: number
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
                 lighthouse_mode, lighthouse_strategy, enabled, created_at`

export function createSite(db: DatabaseSync, input: SiteInput): Site {
  const row = db
    .prepare(
      `INSERT INTO sites (name, base_url, sitemap_url, max_pages,
                          lighthouse_mode, lighthouse_strategy, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)
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
    )
  return row as unknown as Site
}

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
