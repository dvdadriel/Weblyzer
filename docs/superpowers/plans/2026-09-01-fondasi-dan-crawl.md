# Fondasi & Crawl — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun inti headless Web Audit Dashboard — database, antrian job, rekonsiliasi temuan berbasis fingerprint, dan scanner crawl — sehingga sebuah situs dapat ditambahkan, di-crawl, dan hasilnya tersimpan dengan siklus hidup temuan (open/fixed/ignored) yang terbukti benar.

**Architecture:** Satu paket Node/TypeScript. SQLite bawaan Node (`node:sqlite`) sebagai satu-satunya state, dimigrasi dari file `.sql` berurutan. Antrian job berupa tabel SQLite yang di-*claim* secara atomik lewat `UPDATE ... RETURNING`. Scanner crawl memakai Playwright dan diuji terhadap server fixture lokal, bukan situs live. Tidak ada UI pada rencana ini — verifikasi lewat test dan satu CLI.

**Tech Stack:** Node 26 (menjalankan TypeScript secara native), `node:sqlite`, Playwright, Vitest.

**Referensi spec:** `docs/superpowers/specs/2026-09-01-web-audit-dashboard-design.md`

---

## Struktur File

| File | Tanggung jawab |
|---|---|
| `package.json` | Skrip dan devDependencies |
| `tsconfig.json` | Konfigurasi TypeScript |
| `vitest.config.ts` | Konfigurasi test |
| `lib/db.ts` | Membuka koneksi, menjalankan migrasi, menyediakan singleton |
| `lib/migrations/001_init.sql` | Skema penuh sesuai spec §5 |
| `lib/repos/sites.ts` | CRUD situs + normalisasi `base_url` |
| `lib/repos/pages.ts` | Upsert halaman hasil crawl |
| `lib/repos/runs.ts` | Membuat dan menutup run |
| `lib/findings.ts` | Fingerprint + rekonsiliasi open/fixed/ignored |
| `lib/queue.ts` | Enqueue, claim, complete, fail, requeue |
| `lib/runner.ts` | Loop pengurasan antrian dengan batas paralel |
| `lib/scanners/crawl.ts` | Penelusuran Playwright, murni — tanpa akses DB |
| `lib/jobs/crawl.ts` | Perekat: scanner → repo → rekonsiliasi |
| `test/fixture-server.ts` | Server HTTP statis untuk fixture |
| `test/fixtures/**` | Halaman HTML untuk pengujian scanner |
| `scripts/scan.ts` | CLI: add-site, list, crawl |

**Batasan penting:** `lib/scanners/*` tidak boleh menyentuh database. Scanner menerima URL dan mengembalikan data; `lib/jobs/*` yang menyimpannya. Ini membuat scanner dapat diuji tanpa DB dan dapat dipakai ulang oleh fitur recheck per-temuan nanti.

---

## Task 1: Kerangka proyek

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Test: `test/smoke.test.ts`

- [ ] **Step 1: Inisialisasi git**

Jalankan dari `/Users/david/Documents/SEO_Analyzer`:

```bash
git init
```

Diharapkan: `Initialized empty Git repository in .../SEO_Analyzer/.git/`

- [ ] **Step 2: Buat `.gitignore`**

```
node_modules/
.next/
data.db
data.db-wal
data.db-shm
test-results/
*.log
```

- [ ] **Step 3: Buat `package.json`**

```json
{
  "name": "web-audit-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "scan": "node scripts/scan.ts"
  }
}
```

- [ ] **Step 4: Buat `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "nodenext",
    "lib": ["ES2023", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"],
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true
  },
  "include": ["lib/**/*.ts", "test/**/*.ts", "scripts/**/*.ts", "*.ts"]
}
```

`erasableSyntaxOnly` memaksa TypeScript yang bisa dijalankan langsung oleh Node tanpa kompilasi (tanpa `enum`, tanpa parameter properties). Ini yang membuat `node scripts/scan.ts` berfungsi.

- [ ] **Step 5: Pasang dependensi**

```bash
npm install -D typescript @types/node vitest playwright
npx playwright install chromium
```

Diharapkan: instalasi selesai tanpa error, dan Playwright melaporkan Chromium terpasang.

- [ ] **Step 6: Buat `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
```

Timeout 30 detik karena beberapa test menjalankan Chromium sungguhan.

- [ ] **Step 7: Tulis test smoke yang membuktikan perkakas berjalan**

`test/smoke.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

test('node:sqlite tersedia dan dapat menjalankan query', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
  db.prepare('INSERT INTO t (name) VALUES (?)').run('halo')
  const rows = db.prepare('SELECT name FROM t').all() as { name: string }[]
  expect(rows).toHaveLength(1)
  expect(rows[0]!.name).toBe('halo')
  db.close()
})
```

- [ ] **Step 8: Jalankan test**

Run: `npm test`
Diharapkan: PASS, 1 test.

- [ ] **Step 9: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vitest.config.ts test/smoke.test.ts
git commit -m "chore: kerangka proyek dengan node:sqlite, vitest, playwright"
```

---

## Task 2: Database dan migrasi

**Files:**
- Create: `lib/db.ts`
- Create: `lib/migrations/001_init.sql`
- Test: `test/db.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/db.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { openDb, migrate } from '../lib/db.ts'

function tableNames(db: ReturnType<typeof openDb>): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[]
  return rows.map((r) => r.name)
}

test('migrasi membuat seluruh tabel sesuai spec', () => {
  const db = openDb(':memory:')
  const names = tableNames(db)
  for (const t of [
    'config',
    'findings',
    'jobs',
    'lighthouse',
    'pages',
    'reports',
    'runs',
    'sites',
  ]) {
    expect(names).toContain(t)
  }
  db.close()
})

test('migrasi bersifat idempoten pada database yang sama', () => {
  const db = openDb(':memory:')
  const before = tableNames(db)
  expect(() => migrate(db)).not.toThrow()
  expect(tableNames(db)).toEqual(before)
  db.close()
})

test('foreign key aktif: menghapus situs ikut menghapus halamannya', () => {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('S', 'https://a.test')").run()
  db.prepare("INSERT INTO pages (site_id, url) VALUES (1, 'https://a.test/')").run()
  db.prepare('DELETE FROM sites WHERE id = 1').run()
  const rows = db.prepare('SELECT id FROM pages').all()
  expect(rows).toHaveLength(0)
  db.close()
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/db.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/db.ts'`

- [ ] **Step 3: Tulis skema**

`lib/migrations/001_init.sql`:

```sql
CREATE TABLE sites (
  id                  INTEGER PRIMARY KEY,
  name                TEXT    NOT NULL,
  base_url            TEXT    NOT NULL UNIQUE,
  sitemap_url         TEXT,
  max_pages           INTEGER NOT NULL DEFAULT 200,
  lighthouse_mode     TEXT    NOT NULL DEFAULT 'sample',
  lighthouse_strategy TEXT    NOT NULL DEFAULT 'mobile',
  enabled             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE runs (
  id          INTEGER PRIMARY KEY,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'queued',
  trigger     TEXT    NOT NULL DEFAULT 'manual',
  started_at  TEXT,
  finished_at TEXT,
  error       TEXT,
  ai_status   TEXT    NOT NULL DEFAULT 'not_needed',
  ai_error    TEXT,
  ai_model    TEXT
);

CREATE INDEX idx_runs_site ON runs(site_id, id DESC);

CREATE TABLE pages (
  id           INTEGER PRIMARY KEY,
  site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url          TEXT    NOT NULL,
  status_code  INTEGER,
  load_ms      INTEGER,
  last_seen_at TEXT,
  is_pinned    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(site_id, url)
);

CREATE TABLE findings (
  id             INTEGER PRIMARY KEY,
  site_id        INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id        INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  category       TEXT    NOT NULL,
  severity       TEXT    NOT NULL,
  rule           TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  detail_json    TEXT    NOT NULL DEFAULT '{}',
  fingerprint    TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'open',
  first_seen_run INTEGER NOT NULL,
  last_seen_run  INTEGER NOT NULL,
  UNIQUE(site_id, fingerprint)
);

CREATE INDEX idx_findings_lookup ON findings(site_id, category, status);

CREATE TABLE lighthouse (
  id             INTEGER PRIMARY KEY,
  run_id         INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  page_id        INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  strategy       TEXT    NOT NULL,
  perf           INTEGER,
  a11y           INTEGER,
  best_practices INTEGER,
  seo            INTEGER,
  raw_json       TEXT
);

CREATE TABLE reports (
  id          INTEGER PRIMARY KEY,
  run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  format      TEXT    NOT NULL DEFAULT 'markdown',
  content     TEXT    NOT NULL,
  model_used  TEXT,
  tokens_est  INTEGER
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE jobs (
  id           INTEGER PRIMARY KEY,
  run_id       INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL,
  payload_json TEXT    NOT NULL DEFAULT '{}',
  status       TEXT    NOT NULL DEFAULT 'queued',
  attempts     INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  started_at   TEXT,
  finished_at  TEXT
);

CREATE INDEX idx_jobs_queued ON jobs(status, id);
```

- [ ] **Step 4: Tulis `lib/db.ts`**

```typescript
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

let instance: DatabaseSync | null = null

/** Menjalankan migrasi yang belum diterapkan, berurutan menurut nama file. */
export function migrate(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)')
  const rows = db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]
  const applied = new Set(rows.map((r) => r.name))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue
    db.exec('BEGIN')
    try {
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}

/** Membuka database pada path tertentu dan memastikan skemanya mutakhir. */
export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

/** Koneksi bersama untuk aplikasi. Test memakai openDb(':memory:') sendiri. */
export function getDb(): DatabaseSync {
  if (!instance) instance = openDb(process.env.DB_PATH ?? 'data.db')
  return instance
}

export function closeDb(): void {
  instance?.close()
  instance = null
}
```

- [ ] **Step 5: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/db.test.ts`
Diharapkan: PASS, 3 test.

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts lib/migrations/001_init.sql test/db.test.ts
git commit -m "feat: skema database dan runner migrasi"
```

---

## Task 3: Repository situs

**Files:**
- Create: `lib/repos/sites.ts`
- Test: `test/sites.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/sites.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { openDb } from '../lib/db.ts'
import { createSite, listSites, getSite, updateSite, deleteSite } from '../lib/repos/sites.ts'

test('membuat situs dan mengembalikannya dengan nilai default', () => {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'Springair', base_url: 'https://springair.co.id' })
  expect(site.id).toBe(1)
  expect(site.name).toBe('Springair')
  expect(site.max_pages).toBe(200)
  expect(site.lighthouse_mode).toBe('sample')
  expect(site.lighthouse_strategy).toBe('mobile')
  expect(site.enabled).toBe(1)
  db.close()
})

test('base_url dinormalisasi: garis miring akhir dibuang, host dihuruf-kecilkan', () => {
  const db = openDb(':memory:')
  const site = createSite(db, { name: 'A', base_url: 'https://Example.COM/path/' })
  expect(site.base_url).toBe('https://example.com/path')
  db.close()
})

test('base_url tanpa skema ditolak', () => {
  const db = openDb(':memory:')
  expect(() => createSite(db, { name: 'A', base_url: 'example.com' })).toThrow(
    /harus diawali http/i,
  )
  db.close()
})

test('base_url duplikat ditolak setelah normalisasi', () => {
  const db = openDb(':memory:')
  createSite(db, { name: 'A', base_url: 'https://a.test' })
  expect(() => createSite(db, { name: 'B', base_url: 'https://a.test/' })).toThrow()
  db.close()
})

test('list, get, update, dan delete', () => {
  const db = openDb(':memory:')
  createSite(db, { name: 'A', base_url: 'https://a.test' })
  createSite(db, { name: 'B', base_url: 'https://b.test' })

  expect(listSites(db).map((s) => s.name)).toEqual(['A', 'B'])
  expect(getSite(db, 1)?.name).toBe('A')
  expect(getSite(db, 99)).toBeUndefined()

  const updated = updateSite(db, 1, { name: 'A2', max_pages: 50, lighthouse_mode: 'full' })
  expect(updated.name).toBe('A2')
  expect(updated.max_pages).toBe(50)
  expect(updated.lighthouse_mode).toBe('full')

  deleteSite(db, 2)
  expect(listSites(db)).toHaveLength(1)
  db.close()
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/sites.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/repos/sites.ts'`

- [ ] **Step 3: Tulis `lib/repos/sites.ts`**

```typescript
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
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/sites.test.ts`
Diharapkan: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add lib/repos/sites.ts test/sites.test.ts
git commit -m "feat: repository situs dengan normalisasi base_url"
```

---

## Task 4: Fingerprint dan rekonsiliasi temuan

Ini logika inti aplikasi — yang membuat "apakah bug ini sudah diperbaiki" terjawab otomatis. Kerjakan dengan teliti.

**Files:**
- Create: `lib/findings.ts`
- Test: `test/findings.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/findings.test.ts`:

```typescript
import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { fingerprintOf, reconcile, type NewFinding } from '../lib/findings.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('S', 'https://a.test')").run()
})

function newRun(): number {
  const row = db
    .prepare("INSERT INTO runs (site_id, type) VALUES (1, 'bugs') RETURNING id")
    .get() as { id: number }
  return row.id
}

function statusOf(fingerprint: string): string | undefined {
  const row = db
    .prepare('SELECT status FROM findings WHERE fingerprint = ?')
    .get(fingerprint) as { status: string } | undefined
  return row?.status
}

const bug = (url: string, rule = 'http-error'): NewFinding => ({
  url,
  pageId: null,
  severity: 'high',
  rule,
  title: `${rule} pada ${url}`,
})

test('fingerprint stabil untuk masukan yang sama dan berbeda untuk masukan berbeda', () => {
  expect(fingerprintOf('https://a.test/x', 'http-error', '404')).toBe(
    fingerprintOf('https://a.test/x', 'http-error', '404'),
  )
  expect(fingerprintOf('https://a.test/x', 'http-error', '404')).not.toBe(
    fingerprintOf('https://a.test/y', 'http-error', '404'),
  )
  expect(fingerprintOf('https://a.test/x', 'http-error', '404')).not.toBe(
    fingerprintOf('https://a.test/x', 'broken-image', '404'),
  )
})

test('run pertama membuka semua temuan', () => {
  const run = newRun()
  const result = reconcile(db, 1, run, 'bugs', [bug('https://a.test/x'), bug('https://a.test/y')])
  expect(result).toEqual({ opened: 2, reopened: 0, stillOpen: 0, fixed: 0 })
  expect(statusOf(fingerprintOf('https://a.test/x', 'http-error', ''))).toBe('open')
})

test('temuan yang muncul lagi tetap open, bukan digandakan', () => {
  const firstRun = newRun()
  reconcile(db, 1, firstRun, 'bugs', [bug('https://a.test/x')])

  const secondRun = newRun()
  const result = reconcile(db, 1, secondRun, 'bugs', [bug('https://a.test/x')])
  expect(result).toEqual({ opened: 0, reopened: 0, stillOpen: 1, fixed: 0 })

  const rows = db.prepare('SELECT first_seen_run, last_seen_run FROM findings').all() as {
    first_seen_run: number
    last_seen_run: number
  }[]
  expect(rows).toHaveLength(1)
  expect(rows[0]!.first_seen_run).toBe(firstRun)
  expect(rows[0]!.last_seen_run).toBe(secondRun)
})

test('temuan yang hilang otomatis ditandai fixed', () => {
  reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x'), bug('https://a.test/y')])
  const result = reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  expect(result).toEqual({ opened: 0, reopened: 0, stillOpen: 1, fixed: 1 })
  expect(statusOf(fingerprintOf('https://a.test/y', 'http-error', ''))).toBe('fixed')
})

test('temuan yang sudah fixed lalu muncul lagi dihitung sebagai reopened', () => {
  reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  reconcile(db, 1, newRun(), 'bugs', [])
  expect(statusOf(fingerprintOf('https://a.test/x', 'http-error', ''))).toBe('fixed')

  const result = reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  expect(result).toEqual({ opened: 0, reopened: 1, stillOpen: 0, fixed: 0 })
  expect(statusOf(fingerprintOf('https://a.test/x', 'http-error', ''))).toBe('open')
})

test('temuan ignored tidak pernah kembali menjadi open maupun fixed', () => {
  reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  const fp = fingerprintOf('https://a.test/x', 'http-error', '')
  db.prepare("UPDATE findings SET status = 'ignored' WHERE fingerprint = ?").run(fp)

  reconcile(db, 1, newRun(), 'bugs', [bug('https://a.test/x')])
  expect(statusOf(fp)).toBe('ignored')

  reconcile(db, 1, newRun(), 'bugs', [])
  expect(statusOf(fp)).toBe('ignored')
})

test('rekonsiliasi hanya menyentuh kategorinya sendiri', () => {
  reconcile(db, 1, newRun(), 'security', [bug('https://a.test/x', 'missing-csp')])
  reconcile(db, 1, newRun(), 'bugs', [])
  expect(statusOf(fingerprintOf('https://a.test/x', 'missing-csp', ''))).toBe('open')
})

test('rekonsiliasi hanya menyentuh situsnya sendiri', () => {
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('T', 'https://b.test')").run()
  const runB = db
    .prepare("INSERT INTO runs (site_id, type) VALUES (2, 'bugs') RETURNING id")
    .get() as { id: number }

  reconcile(db, 2, runB.id, 'bugs', [bug('https://b.test/x')])
  reconcile(db, 1, newRun(), 'bugs', [])

  const row = db
    .prepare('SELECT status FROM findings WHERE site_id = 2')
    .get() as { status: string }
  expect(row.status).toBe('open')
})

test('severity dan judul diperbarui saat temuan muncul lagi', () => {
  reconcile(db, 1, newRun(), 'bugs', [{ ...bug('https://a.test/x'), severity: 'low' }])
  reconcile(db, 1, newRun(), 'bugs', [
    { ...bug('https://a.test/x'), severity: 'critical', title: 'judul baru' },
  ])
  const row = db
    .prepare('SELECT severity, title FROM findings')
    .get() as { severity: string; title: string }
  expect(row.severity).toBe('critical')
  expect(row.title).toBe('judul baru')
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/findings.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/findings.ts'`

- [ ] **Step 3: Tulis `lib/findings.ts`**

```typescript
import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type FindingStatus = 'open' | 'fixed' | 'ignored'

export type NewFinding = {
  url: string
  pageId: number | null
  severity: Severity
  rule: string
  title: string
  /** Pembeda tambahan bila satu aturan bisa muncul beberapa kali pada URL yang sama. */
  key?: string
  detail?: unknown
}

export type ReconcileResult = {
  opened: number
  reopened: number
  stillOpen: number
  fixed: number
}

/**
 * Identitas sebuah temuan. Selama tiga masukan ini tidak berubah, temuan yang
 * sama pada run berikutnya dikenali sebagai temuan yang sama — inilah dasar
 * deteksi otomatis "sudah diperbaiki".
 */
export function fingerprintOf(url: string, rule: string, key = ''): string {
  return createHash('sha256').update(`${url}\n${rule}\n${key}`).digest('hex').slice(0, 16)
}

/**
 * Menyelaraskan temuan tersimpan dengan hasil satu scan.
 *
 * Strateginya: tandai semua temuan open pada kategori ini sebagai fixed lebih
 * dulu, lalu buka kembali yang benar-benar dilaporkan. Ini menghindari klausa
 * `NOT IN (...)` yang akan menabrak batas jumlah parameter SQLite pada situs
 * besar.
 *
 * Temuan berstatus `ignored` tidak pernah disentuh — keputusan manual pengguna
 * bersifat lengket.
 */
export function reconcile(
  db: DatabaseSync,
  siteId: number,
  runId: number,
  category: string,
  incoming: NewFinding[],
): ReconcileResult {
  const priorRows = db
    .prepare('SELECT fingerprint, status FROM findings WHERE site_id = ? AND category = ?')
    .all(siteId, category) as { fingerprint: string; status: FindingStatus }[]
  const prior = new Map(priorRows.map((r) => [r.fingerprint, r.status]))

  const result: ReconcileResult = { opened: 0, reopened: 0, stillOpen: 0, fixed: 0 }

  db.exec('BEGIN')
  try {
    db.prepare(
      `UPDATE findings SET status = 'fixed'
       WHERE site_id = ? AND category = ? AND status = 'open'`,
    ).run(siteId, category)

    const insert = db.prepare(
      `INSERT INTO findings (site_id, page_id, category, severity, rule, title,
                             detail_json, fingerprint, status, first_seen_run, last_seen_run)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    )
    const refresh = db.prepare(
      `UPDATE findings
       SET page_id = ?, severity = ?, title = ?, detail_json = ?,
           last_seen_run = ?,
           status = CASE WHEN status = 'ignored' THEN 'ignored' ELSE 'open' END
       WHERE site_id = ? AND fingerprint = ?`,
    )

    const seen = new Set<string>()
    for (const f of incoming) {
      const fp = fingerprintOf(f.url, f.rule, f.key ?? '')
      if (seen.has(fp)) continue
      seen.add(fp)

      const detail = JSON.stringify(f.detail ?? {})
      const previous = prior.get(fp)

      if (previous === undefined) {
        insert.run(
          siteId,
          f.pageId,
          category,
          f.severity,
          f.rule,
          f.title,
          detail,
          fp,
          runId,
          runId,
        )
        result.opened += 1
      } else {
        refresh.run(f.pageId, f.severity, f.title, detail, runId, siteId, fp)
        if (previous === 'open') result.stillOpen += 1
        else if (previous === 'fixed') result.reopened += 1
      }
    }

    for (const [fp, status] of prior) {
      if (status === 'open' && !seen.has(fp)) result.fixed += 1
    }

    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return result
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/findings.test.ts`
Diharapkan: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add lib/findings.ts test/findings.test.ts
git commit -m "feat: fingerprint dan rekonsiliasi siklus hidup temuan"
```

---

## Task 5: Antrian job

**Files:**
- Create: `lib/repos/runs.ts`
- Create: `lib/queue.ts`
- Test: `test/queue.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/queue.test.ts`:

```typescript
import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { enqueue, claimNext, completeJob, failJob, requeueInterrupted } from '../lib/queue.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('S', 'https://a.test')").run()
})

test('membuat run dengan status queued dan trigger default manual', () => {
  const run = createRun(db, 1, 'crawl')
  expect(run.status).toBe('queued')
  expect(run.trigger).toBe('manual')
  expect(run.ai_status).toBe('not_needed')
})

test('job diambil satu per satu menurut urutan masuk', () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: 1 } })
  enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: 2 } })

  const first = claimNext(db)
  const second = claimNext(db)
  expect(first?.payload).toEqual({ siteId: 1 })
  expect(second?.payload).toEqual({ siteId: 2 })
  expect(claimNext(db)).toBeUndefined()
})

test('job yang diambil berstatus running dan attempts bertambah', () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: {} })
  const job = claimNext(db)
  expect(job?.status).toBe('running')
  expect(job?.attempts).toBe(1)
})

test('completeJob menandai selesai, failJob menyimpan pesan error', () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: {} })
  enqueue(db, { runId: run.id, type: 'crawl', payload: {} })

  completeJob(db, claimNext(db)!.id)
  failJob(db, claimNext(db)!.id, 'chromium gagal dijalankan')

  const rows = db
    .prepare('SELECT status, error FROM jobs ORDER BY id')
    .all() as { status: string; error: string | null }[]
  expect(rows[0]!.status).toBe('done')
  expect(rows[1]!.status).toBe('failed')
  expect(rows[1]!.error).toBe('chromium gagal dijalankan')
})

test('job yang tertinggal running setelah restart dapat dikembalikan ke antrian', () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: {} })
  claimNext(db)

  expect(requeueInterrupted(db)).toBe(1)
  expect(claimNext(db)?.attempts).toBe(2)
})

test('finishRun menutup run dan mencatat waktu selesai', () => {
  const run = createRun(db, 1, 'crawl')
  finishRun(db, run.id, 'done')
  const row = db
    .prepare('SELECT status, finished_at FROM runs WHERE id = ?')
    .get(run.id) as { status: string; finished_at: string | null }
  expect(row.status).toBe('done')
  expect(row.finished_at).not.toBeNull()
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/queue.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/repos/runs.ts'`

- [ ] **Step 3: Tulis `lib/repos/runs.ts`**

```typescript
import type { DatabaseSync } from 'node:sqlite'

export type RunType = 'crawl' | 'bugs' | 'console' | 'security' | 'lighthouse' | 'seo' | 'full'
export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type AiStatus = 'ok' | 'failed' | 'skipped' | 'not_needed'

export type Run = {
  id: number
  site_id: number
  type: RunType
  status: RunStatus
  trigger: 'manual' | 'scheduled'
  started_at: string | null
  finished_at: string | null
  error: string | null
  ai_status: AiStatus
  ai_error: string | null
  ai_model: string | null
}

const COLUMNS = `id, site_id, type, status, trigger, started_at, finished_at, error,
                 ai_status, ai_error, ai_model`

export function createRun(
  db: DatabaseSync,
  siteId: number,
  type: RunType,
  trigger: 'manual' | 'scheduled' = 'manual',
): Run {
  const row = db
    .prepare(
      `INSERT INTO runs (site_id, type, trigger, status, started_at)
       VALUES (?, ?, ?, 'queued', datetime('now'))
       RETURNING ${COLUMNS}`,
    )
    .get(siteId, type, trigger)
  return row as unknown as Run
}

export function finishRun(
  db: DatabaseSync,
  runId: number,
  status: RunStatus,
  error: string | null = null,
): void {
  db.prepare(
    `UPDATE runs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?`,
  ).run(status, error, runId)
}

export function setAiStatus(
  db: DatabaseSync,
  runId: number,
  status: AiStatus,
  model: string | null = null,
  error: string | null = null,
): void {
  db.prepare('UPDATE runs SET ai_status = ?, ai_model = ?, ai_error = ? WHERE id = ?').run(
    status,
    model,
    error,
    runId,
  )
}

export function getRun(db: DatabaseSync, id: number): Run | undefined {
  return db.prepare(`SELECT ${COLUMNS} FROM runs WHERE id = ?`).get(id) as unknown as
    | Run
    | undefined
}
```

- [ ] **Step 4: Tulis `lib/queue.ts`**

```typescript
import type { DatabaseSync } from 'node:sqlite'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export type Job = {
  id: number
  run_id: number
  type: string
  payload: Record<string, unknown>
  status: JobStatus
  attempts: number
}

type JobRow = {
  id: number
  run_id: number
  type: string
  payload_json: string
  status: JobStatus
  attempts: number
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    run_id: row.run_id,
    type: row.type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    status: row.status,
    attempts: row.attempts,
  }
}

export function enqueue(
  db: DatabaseSync,
  input: { runId: number; type: string; payload?: Record<string, unknown> },
): number {
  const row = db
    .prepare('INSERT INTO jobs (run_id, type, payload_json) VALUES (?, ?, ?) RETURNING id')
    .get(input.runId, input.type, JSON.stringify(input.payload ?? {})) as { id: number }
  return row.id
}

/**
 * Mengambil satu job berikutnya secara atomik. `UPDATE ... RETURNING` pada
 * subquery memastikan dua pemanggil bersamaan tidak pernah mendapat job yang
 * sama, tanpa perlu kunci di sisi aplikasi.
 */
export function claimNext(db: DatabaseSync): Job | undefined {
  const row = db
    .prepare(
      `UPDATE jobs
       SET status = 'running', attempts = attempts + 1, started_at = datetime('now')
       WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1)
       RETURNING id, run_id, type, payload_json, status, attempts`,
    )
    .get() as JobRow | undefined
  return row ? toJob(row) : undefined
}

export function completeJob(db: DatabaseSync, id: number): void {
  db.prepare(
    `UPDATE jobs SET status = 'done', finished_at = datetime('now') WHERE id = ?`,
  ).run(id)
}

export function failJob(db: DatabaseSync, id: number, error: string): void {
  db.prepare(
    `UPDATE jobs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?`,
  ).run(error, id)
}

/**
 * Dipanggil saat aplikasi mulai. Job yang tertinggal berstatus `running` berarti
 * proses sebelumnya mati di tengah jalan — kembalikan ke antrian agar tidak ada
 * pekerjaan yang hilang diam-diam.
 */
export function requeueInterrupted(db: DatabaseSync): number {
  const result = db
    .prepare(
      `UPDATE jobs SET status = 'queued', error = 'interrupted' WHERE status = 'running'`,
    )
    .run()
  return Number(result.changes)
}

export function countQueued(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'").get() as {
    n: number
  }
  return Number(row.n)
}
```

- [ ] **Step 5: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/queue.test.ts`
Diharapkan: PASS, 6 test.

- [ ] **Step 6: Commit**

```bash
git add lib/repos/runs.ts lib/queue.ts test/queue.test.ts
git commit -m "feat: repository run dan antrian job berbasis SQLite"
```

---

## Task 6: Runner dengan batas paralel

**Files:**
- Create: `lib/runner.ts`
- Test: `test/runner.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/runner.test.ts`:

```typescript
import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { createRun } from '../lib/repos/runs.ts'
import { enqueue } from '../lib/queue.ts'
import { drainQueue, type JobHandlers } from '../lib/runner.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  db.prepare("INSERT INTO sites (name, base_url) VALUES ('S', 'https://a.test')").run()
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('menjalankan semua job yang mengantre', async () => {
  const run = createRun(db, 1, 'crawl')
  const seen: number[] = []
  for (const n of [1, 2, 3]) enqueue(db, { runId: run.id, type: 'noop', payload: { n } })

  const handlers: JobHandlers = {
    noop: async (job) => {
      seen.push(job.payload.n as number)
    },
  }
  const summary = await drainQueue(db, handlers, { concurrency: 2 })

  expect(seen.sort()).toEqual([1, 2, 3])
  expect(summary).toEqual({ done: 3, failed: 0 })
})

test('tidak pernah melebihi batas paralel', async () => {
  const run = createRun(db, 1, 'crawl')
  for (let n = 0; n < 6; n += 1) enqueue(db, { runId: run.id, type: 'slow', payload: {} })

  let active = 0
  let peak = 0
  const handlers: JobHandlers = {
    slow: async () => {
      active += 1
      peak = Math.max(peak, active)
      await sleep(20)
      active -= 1
    },
  }

  await drainQueue(db, handlers, { concurrency: 2 })
  expect(peak).toBe(2)
})

test('handler yang melempar error menandai job failed tanpa menghentikan job lain', async () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'boom', payload: {} })
  enqueue(db, { runId: run.id, type: 'ok', payload: {} })

  const handlers: JobHandlers = {
    boom: async () => {
      throw new Error('meledak')
    },
    ok: async () => {},
  }
  const summary = await drainQueue(db, handlers, { concurrency: 1 })

  expect(summary).toEqual({ done: 1, failed: 1 })
  const failed = db
    .prepare("SELECT error FROM jobs WHERE status = 'failed'")
    .get() as { error: string }
  expect(failed.error).toContain('meledak')
})

test('job dengan tipe tanpa handler ditandai failed, bukan menggantung', async () => {
  const run = createRun(db, 1, 'crawl')
  enqueue(db, { runId: run.id, type: 'tidak-dikenal', payload: {} })

  const summary = await drainQueue(db, {}, { concurrency: 1 })
  expect(summary).toEqual({ done: 0, failed: 1 })
  const failed = db
    .prepare("SELECT error FROM jobs WHERE status = 'failed'")
    .get() as { error: string }
  expect(failed.error).toContain('tidak-dikenal')
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/runner.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/runner.ts'`

- [ ] **Step 3: Tulis `lib/runner.ts`**

```typescript
import type { DatabaseSync } from 'node:sqlite'
import { claimNext, completeJob, failJob, type Job } from './queue.ts'

export type JobHandler = (job: Job, db: DatabaseSync) => Promise<void>
export type JobHandlers = Record<string, JobHandler>

export type DrainSummary = { done: number; failed: number }

/**
 * Menguras antrian sampai kosong, menjalankan paling banyak `concurrency` job
 * secara bersamaan. Kegagalan satu job tidak pernah menghentikan yang lain —
 * satu halaman rusak tidak boleh membatalkan seluruh scan.
 */
export async function drainQueue(
  db: DatabaseSync,
  handlers: JobHandlers,
  opts: { concurrency?: number } = {},
): Promise<DrainSummary> {
  const limit = Math.max(1, opts.concurrency ?? 3)
  const summary: DrainSummary = { done: 0, failed: 0 }
  const active = new Set<Promise<void>>()

  const runOne = async (job: Job): Promise<void> => {
    const handler = handlers[job.type]
    if (!handler) {
      failJob(db, job.id, `Tidak ada handler untuk tipe job "${job.type}"`)
      summary.failed += 1
      return
    }
    try {
      await handler(job, db)
      completeJob(db, job.id)
      summary.done += 1
    } catch (err) {
      failJob(db, job.id, err instanceof Error ? err.message : String(err))
      summary.failed += 1
    }
  }

  for (;;) {
    while (active.size < limit) {
      const job = claimNext(db)
      if (!job) break
      const promise = runOne(job).finally(() => active.delete(promise))
      active.add(promise)
    }
    if (active.size === 0) break
    await Promise.race(active)
  }

  return summary
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/runner.test.ts`
Diharapkan: PASS, 4 test.

- [ ] **Step 5: Commit**

```bash
git add lib/runner.ts test/runner.test.ts
git commit -m "feat: runner antrian dengan batas paralel dan isolasi kegagalan"
```

---

## Task 7: Server fixture untuk pengujian scanner

Scanner diuji terhadap HTML lokal, bukan situs live — deterministik, cepat, dan memungkinkan pembuatan halaman rusak seburuk apa pun.

**Files:**
- Create: `test/fixture-server.ts`
- Create: `test/fixtures/basic/index.html`
- Create: `test/fixtures/basic/a.html`
- Create: `test/fixtures/basic/b.html`
- Test: `test/fixture-server.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/fixture-server.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { startFixtureServer } from './fixture-server.ts'

test('menyajikan index.html pada root dan 404 untuk yang tidak ada', async () => {
  const server = await startFixtureServer('basic')
  try {
    const root = await fetch(server.url)
    expect(root.status).toBe(200)
    expect(await root.text()).toContain('Beranda Fixture')

    const missing = await fetch(`${server.url}/tidak-ada.html`)
    expect(missing.status).toBe(404)
  } finally {
    await server.close()
  }
})

test('setiap server memakai port berbeda sehingga test dapat berjalan paralel', async () => {
  const [a, b] = await Promise.all([startFixtureServer('basic'), startFixtureServer('basic')])
  try {
    expect(a.url).not.toBe(b.url)
  } finally {
    await Promise.all([a.close(), b.close()])
  }
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/fixture-server.test.ts`
Diharapkan: FAIL — `Cannot find module './fixture-server.ts'`

- [ ] **Step 3: Buat fixture HTML**

`test/fixtures/basic/index.html`:

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>Beranda Fixture</title>
  </head>
  <body>
    <h1>Beranda Fixture</h1>
    <a href="/a.html">Halaman A</a>
    <a href="/b.html">Halaman B</a>
    <a href="/tidak-ada.html">Tautan rusak</a>
    <a href="https://contoh-eksternal.test/x">Tautan eksternal</a>
    <a href="/a.html#bagian">Halaman A dengan anchor</a>
  </body>
</html>
```

`test/fixtures/basic/a.html`:

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>Halaman A</title>
  </head>
  <body>
    <h1>Halaman A</h1>
    <a href="/">Kembali ke beranda</a>
  </body>
</html>
```

`test/fixtures/basic/b.html`:

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>Halaman B</title>
  </head>
  <body>
    <h1>Halaman B</h1>
  </body>
</html>
```

- [ ] **Step 4: Tulis `test/fixture-server.ts`**

```typescript
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'

const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

export type FixtureServer = {
  url: string
  close: () => Promise<void>
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

/**
 * Menyajikan satu folder fixture pada port acak. Port acak dipilih agar test
 * dapat berjalan paralel tanpa saling merebut port.
 */
export async function startFixtureServer(name: string): Promise<FixtureServer> {
  const root = join(FIXTURES_ROOT, name)

  const server: Server = createServer((req, res) => {
    const requested = new URL(req.url ?? '/', 'http://localhost')
    let pathname = decodeURIComponent(requested.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'

    // Menahan path traversal: file yang disajikan harus berada di dalam folder fixture.
    const filePath = normalize(join(root, pathname))
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden')
      return
    }

    readFile(filePath).then(
      (body) => {
        const ext = filePath.slice(filePath.lastIndexOf('.'))
        res.writeHead(200, { 'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream' })
        res.end(body)
      },
      () => {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><title>404</title><h1>Tidak ditemukan</h1>')
      },
    )
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}
```

- [ ] **Step 5: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/fixture-server.test.ts`
Diharapkan: PASS, 2 test.

- [ ] **Step 6: Commit**

```bash
git add test/fixture-server.ts test/fixture-server.test.ts test/fixtures
git commit -m "test: server fixture statis untuk pengujian scanner"
```

---

## Task 8: Scanner crawl

**Files:**
- Create: `lib/scanners/crawl.ts`
- Test: `test/crawl.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/crawl.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { startFixtureServer } from './fixture-server.ts'
import { crawl, normalizeUrl } from '../lib/scanners/crawl.ts'

test('normalizeUrl membuang fragment dan garis miring akhir', () => {
  expect(normalizeUrl('http://a.test/x/#bagian')).toBe('http://a.test/x')
  expect(normalizeUrl('http://a.test/')).toBe('http://a.test/')
  expect(normalizeUrl('http://a.test/x?b=2&a=1')).toBe('http://a.test/x?a=1&b=2')
})

test('menelusuri seluruh halaman internal dan mencatat status code', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 20 })
    const byUrl = new Map(pages.map((p) => [p.url, p]))

    expect(byUrl.get(`${server.url}/`)?.statusCode).toBe(200)
    expect(byUrl.get(`${server.url}/a.html`)?.statusCode).toBe(200)
    expect(byUrl.get(`${server.url}/b.html`)?.statusCode).toBe(200)
    expect(byUrl.get(`${server.url}/tidak-ada.html`)?.statusCode).toBe(404)
  } finally {
    await server.close()
  }
})

test('tautan eksternal tidak ikut ditelusuri', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 20 })
    expect(pages.every((p) => p.url.startsWith(server.url))).toBe(true)
  } finally {
    await server.close()
  }
})

test('anchor pada URL yang sama tidak menghasilkan halaman kembar', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 20 })
    const aPages = pages.filter((p) => p.url === `${server.url}/a.html`)
    expect(aPages).toHaveLength(1)
  } finally {
    await server.close()
  }
})

test('maxPages menghentikan penelusuran', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 2 })
    expect(pages).toHaveLength(2)
  } finally {
    await server.close()
  }
})

test('setiap halaman mencatat waktu muat', async () => {
  const server = await startFixtureServer('basic')
  try {
    const pages = await crawl(server.url, { maxPages: 3 })
    expect(pages.every((p) => p.loadMs >= 0)).toBe(true)
  } finally {
    await server.close()
  }
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/crawl.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/scanners/crawl.ts'`

- [ ] **Step 3: Tulis `lib/scanners/crawl.ts`**

```typescript
import { chromium, type Browser } from 'playwright'

export type CrawledPage = {
  url: string
  statusCode: number
  loadMs: number
  links: string[]
}

export type CrawlOptions = {
  maxPages?: number
  /** Batas waktu per halaman, agar satu halaman menggantung tidak membekukan antrian. */
  timeoutMs?: number
}

/**
 * Menyeragamkan URL agar satu halaman tidak tercatat berkali-kali. Fragment
 * dibuang (tidak menghasilkan dokumen berbeda) dan parameter query diurutkan
 * (urutannya tidak bermakna bagi server).
 */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw)
  url.hash = ''
  url.searchParams.sort()
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
  const query = url.searchParams.toString()
  return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ''}`
}

export async function crawl(baseUrl: string, opts: CrawlOptions = {}): Promise<CrawledPage[]> {
  const maxPages = opts.maxPages ?? 200
  const timeoutMs = opts.timeoutMs ?? 20_000
  const origin = new URL(baseUrl).origin

  const browser: Browser = await chromium.launch()
  const results: CrawledPage[] = []

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    const queue: string[] = [normalizeUrl(baseUrl)]
    const seen = new Set<string>(queue)

    while (queue.length > 0 && results.length < maxPages) {
      const url = queue.shift()!
      const startedAt = Date.now()

      let statusCode = 0
      let links: string[] = []
      try {
        const response = await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })
        statusCode = response?.status() ?? 0
        links = await page.$$eval('a[href]', (anchors) =>
          anchors.map((a) => (a as HTMLAnchorElement).href),
        )
      } catch {
        // Halaman gagal dimuat tetap dicatat dengan status 0 agar terlihat di laporan,
        // bukan hilang diam-diam.
        statusCode = 0
      }

      results.push({ url, statusCode, loadMs: Date.now() - startedAt, links })

      for (const href of links) {
        let normalized: string
        try {
          normalized = normalizeUrl(href)
        } catch {
          continue
        }
        if (!normalized.startsWith(origin)) continue
        if (seen.has(normalized)) continue
        seen.add(normalized)
        queue.push(normalized)
      }
    }
  } finally {
    await browser.close()
  }

  return results
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/crawl.test.ts`
Diharapkan: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add lib/scanners/crawl.ts test/crawl.test.ts
git commit -m "feat: scanner crawl berbasis Playwright"
```

---

## Task 9: Merangkai crawl menjadi job dan CLI

**Files:**
- Create: `lib/repos/pages.ts`
- Create: `lib/jobs/crawl.ts`
- Create: `scripts/scan.ts`
- Test: `test/crawl-job.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

`test/crawl-job.test.ts`:

```typescript
import { test, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { createRun } from '../lib/repos/runs.ts'
import { enqueue } from '../lib/queue.ts'
import { drainQueue } from '../lib/runner.ts'
import { crawlHandler } from '../lib/jobs/crawl.ts'
import { startFixtureServer } from './fixture-server.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
})

test('job crawl menyimpan halaman dan membuka temuan untuk status non-2xx', async () => {
  const server = await startFixtureServer('basic')
  try {
    const site = createSite(db, { name: 'Fixture', base_url: server.url, max_pages: 20 })
    const run = createRun(db, site.id, 'crawl')
    enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: site.id } })

    const summary = await drainQueue(db, { crawl: crawlHandler }, { concurrency: 1 })
    expect(summary).toEqual({ done: 1, failed: 0 })

    const pages = db.prepare('SELECT url, status_code FROM pages ORDER BY url').all() as {
      url: string
      status_code: number
    }[]
    expect(pages.length).toBeGreaterThanOrEqual(4)

    const findings = db
      .prepare("SELECT rule, severity, status FROM findings WHERE category = 'bugs'")
      .all() as { rule: string; severity: string; status: string }[]
    expect(findings).toHaveLength(1)
    expect(findings[0]!.rule).toBe('http-error')
    expect(findings[0]!.severity).toBe('high')
    expect(findings[0]!.status).toBe('open')
  } finally {
    await server.close()
  }
})

test('crawl kedua atas fixture yang sama tidak menggandakan halaman maupun temuan', async () => {
  const server = await startFixtureServer('basic')
  try {
    const site = createSite(db, { name: 'Fixture', base_url: server.url, max_pages: 20 })

    for (const _ of [1, 2]) {
      const run = createRun(db, site.id, 'crawl')
      enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: site.id } })
      await drainQueue(db, { crawl: crawlHandler }, { concurrency: 1 })
    }

    const pageCount = db.prepare('SELECT COUNT(*) AS n FROM pages').get() as { n: number }
    const findingCount = db.prepare('SELECT COUNT(*) AS n FROM findings').get() as { n: number }
    expect(Number(findingCount.n)).toBe(1)

    const finding = db
      .prepare('SELECT first_seen_run, last_seen_run FROM findings')
      .get() as { first_seen_run: number; last_seen_run: number }
    expect(finding.first_seen_run).toBe(1)
    expect(finding.last_seen_run).toBe(2)
    expect(Number(pageCount.n)).toBeGreaterThanOrEqual(4)
  } finally {
    await server.close()
  }
})

test('job gagal dengan pesan jelas bila situs tidak ditemukan', async () => {
  const site = createSite(db, { name: 'X', base_url: 'https://x.test' })
  const run = createRun(db, site.id, 'crawl')
  enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: 999 } })

  const summary = await drainQueue(db, { crawl: crawlHandler }, { concurrency: 1 })
  expect(summary).toEqual({ done: 0, failed: 1 })

  const failed = db.prepare("SELECT error FROM jobs WHERE status = 'failed'").get() as {
    error: string
  }
  expect(failed.error).toContain('999')
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx vitest run test/crawl-job.test.ts`
Diharapkan: FAIL — `Cannot find module '../lib/repos/pages.ts'`

- [ ] **Step 3: Tulis `lib/repos/pages.ts`**

```typescript
import type { DatabaseSync } from 'node:sqlite'

export type Page = {
  id: number
  site_id: number
  url: string
  status_code: number | null
  load_ms: number | null
  last_seen_at: string | null
  is_pinned: number
}

/**
 * Menyimpan halaman hasil crawl. Halaman yang sudah ada diperbarui, bukan
 * digandakan, sehingga `pages.id` stabil dan dapat dirujuk oleh temuan lintas run.
 */
export function upsertPage(
  db: DatabaseSync,
  siteId: number,
  input: { url: string; statusCode: number | null; loadMs: number | null },
): Page {
  const row = db
    .prepare(
      `INSERT INTO pages (site_id, url, status_code, load_ms, last_seen_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(site_id, url) DO UPDATE
         SET status_code  = excluded.status_code,
             load_ms      = excluded.load_ms,
             last_seen_at = excluded.last_seen_at
       RETURNING id, site_id, url, status_code, load_ms, last_seen_at, is_pinned`,
    )
    .get(siteId, input.url, input.statusCode, input.loadMs)
  return row as unknown as Page
}

export function listPages(db: DatabaseSync, siteId: number): Page[] {
  return db
    .prepare(
      `SELECT id, site_id, url, status_code, load_ms, last_seen_at, is_pinned
       FROM pages WHERE site_id = ? ORDER BY url`,
    )
    .all(siteId) as unknown as Page[]
}
```

- [ ] **Step 4: Tulis `lib/jobs/crawl.ts`**

```typescript
import type { DatabaseSync } from 'node:sqlite'
import type { Job } from '../queue.ts'
import { getSite } from '../repos/sites.ts'
import { upsertPage } from '../repos/pages.ts'
import { reconcile, type NewFinding } from '../findings.ts'
import { crawl } from '../scanners/crawl.ts'

/**
 * Menjalankan scanner crawl lalu menyimpan hasilnya. Scanner sendiri tidak
 * menyentuh database — pemisahan ini yang membuatnya dapat diuji tanpa DB dan
 * dipakai ulang oleh fitur recheck satu halaman.
 */
export async function crawlHandler(job: Job, db: DatabaseSync): Promise<void> {
  const siteId = Number(job.payload.siteId)
  const site = getSite(db, siteId)
  if (!site) throw new Error(`Situs ${siteId} tidak ditemukan`)

  const pages = await crawl(site.base_url, { maxPages: site.max_pages })
  const findings: NewFinding[] = []

  for (const page of pages) {
    const stored = upsertPage(db, siteId, {
      url: page.url,
      statusCode: page.statusCode,
      loadMs: page.loadMs,
    })

    const ok = page.statusCode >= 200 && page.statusCode < 400
    if (ok) continue

    findings.push({
      url: page.url,
      pageId: stored.id,
      severity: page.statusCode >= 500 || page.statusCode === 0 ? 'critical' : 'high',
      rule: 'http-error',
      title:
        page.statusCode === 0
          ? `Halaman gagal dimuat: ${page.url}`
          : `HTTP ${page.statusCode} pada ${page.url}`,
      detail: { statusCode: page.statusCode, loadMs: page.loadMs },
    })
  }

  reconcile(db, siteId, job.run_id, 'bugs', findings)
}
```

- [ ] **Step 5: Jalankan test untuk memastikan lulus**

Run: `npx vitest run test/crawl-job.test.ts`
Diharapkan: PASS, 3 test.

- [ ] **Step 6: Tulis CLI `scripts/scan.ts`**

```typescript
import { getDb, closeDb } from '../lib/db.ts'
import { createSite, listSites, getSite } from '../lib/repos/sites.ts'
import { createRun, finishRun } from '../lib/repos/runs.ts'
import { enqueue, requeueInterrupted } from '../lib/queue.ts'
import { drainQueue } from '../lib/runner.ts'
import { crawlHandler } from '../lib/jobs/crawl.ts'
import { listPages } from '../lib/repos/pages.ts'

const HANDLERS = { crawl: crawlHandler }

const USAGE = `Penggunaan:
  npm run scan -- add-site <nama> <url>   Menambahkan situs
  npm run scan -- list                    Menampilkan semua situs
  npm run scan -- crawl <site-id>         Menjalankan crawl untuk satu situs
  npm run scan -- pages <site-id>         Menampilkan halaman tersimpan`

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2)
  const db = getDb()
  requeueInterrupted(db)

  switch (command) {
    case 'add-site': {
      const [name, url] = args
      if (!name || !url) {
        console.error(USAGE)
        return 1
      }
      const site = createSite(db, { name, base_url: url })
      console.log(`Situs ${site.id} dibuat: ${site.name} — ${site.base_url}`)
      return 0
    }

    case 'list': {
      const sites = listSites(db)
      if (sites.length === 0) console.log('Belum ada situs.')
      for (const s of sites) console.log(`${s.id}\t${s.name}\t${s.base_url}`)
      return 0
    }

    case 'pages': {
      const siteId = Number(args[0])
      const pages = listPages(db, siteId)
      for (const p of pages) console.log(`${p.status_code}\t${p.load_ms}ms\t${p.url}`)
      console.log(`${pages.length} halaman.`)
      return 0
    }

    case 'crawl': {
      const siteId = Number(args[0])
      const site = getSite(db, siteId)
      if (!site) {
        console.error(`Situs ${args[0]} tidak ditemukan.`)
        return 1
      }

      const run = createRun(db, site.id, 'crawl')
      enqueue(db, { runId: run.id, type: 'crawl', payload: { siteId: site.id } })
      console.log(`Run ${run.id}: crawl ${site.base_url} ...`)

      const summary = await drainQueue(db, HANDLERS, { concurrency: 1 })
      finishRun(db, run.id, summary.failed > 0 ? 'failed' : 'done')

      const findings = db
        .prepare(
          `SELECT severity, COUNT(*) AS n FROM findings
           WHERE site_id = ? AND status = 'open' GROUP BY severity`,
        )
        .all(site.id) as { severity: string; n: number }[]

      console.log(`Selesai — ${summary.done} job berhasil, ${summary.failed} gagal.`)
      console.log(`Halaman tersimpan: ${listPages(db, site.id).length}`)
      for (const f of findings) console.log(`  ${f.severity}: ${f.n}`)
      return summary.failed > 0 ? 1 : 0
    }

    default:
      console.error(USAGE)
      return 1
  }
}

main()
  .then((code) => {
    closeDb()
    process.exit(code)
  })
  .catch((err: unknown) => {
    console.error(err)
    closeDb()
    process.exit(1)
  })
```

- [ ] **Step 7: Verifikasi CLI dari ujung ke ujung terhadap situs sungguhan**

```bash
npm run scan -- add-site Springair https://springair.co.id
npm run scan -- list
npm run scan -- crawl 1
npm run scan -- pages 1
```

Diharapkan: `add-site` mencetak `Situs 1 dibuat`; `crawl 1` menyelesaikan run, mencetak jumlah halaman tersimpan dan rekap severity; `pages 1` menampilkan daftar URL beserta status code dan waktu muat. File `data.db` terbentuk.

Catatan: crawl situs sungguhan memakan waktu beberapa menit. Bila terlalu lama, batasi dulu dengan `npm run scan -- add-site Uji https://example.com`.

- [ ] **Step 8: Jalankan seluruh test**

Run: `npm test`
Diharapkan: seluruh test lulus (smoke, db, sites, findings, queue, runner, fixture-server, crawl, crawl-job).

- [ ] **Step 9: Commit**

```bash
git add lib/repos/pages.ts lib/jobs/crawl.ts scripts/scan.ts test/crawl-job.test.ts
git commit -m "feat: job crawl dan CLI scan"
```

---

## Definisi Selesai

Rencana ini selesai bila:

- [ ] `npm test` lulus seluruhnya
- [ ] `npm run scan -- add-site`, `list`, `crawl`, dan `pages` berfungsi terhadap situs sungguhan
- [ ] Menjalankan `crawl` dua kali tidak menggandakan halaman maupun temuan
- [ ] Temuan yang hilang pada crawl kedua otomatis berstatus `fixed`
- [ ] Temuan berstatus `ignored` tidak pernah berubah sendiri

## Rencana Berikutnya

Ditulis setelah rencana ini selesai, agar tetap sesuai dengan kode yang benar-benar ada:

2. **Scanner deterministik** — bugs (gambar rusak, form rusak, halaman blank, redirect loop), console, security. Fase 2–3 saling bebas dan cocok dikerjakan paralel.
3. **Lighthouse** — runner paralel, penganggaran halaman `sample`/`full`, penyimpanan skor
4. **Lapisan AI** — spawn CLI `claude`/`gemini`, file prompt, `ai_status`, konfigurasi model
5. **SEO** — integrasi plugin `claude-seo`
6. **UI** — Next.js dengan tema vintage terminal, via `impeccable` + `frontend-design`
7. **Export Excel, scheduler, notifikasi email, Docker**
