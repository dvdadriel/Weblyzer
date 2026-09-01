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
      // ROLLBACK sendiri bisa melempar bila file migrasi memuat COMMIT-nya
      // sendiri sehingga tidak ada lagi transaksi aktif. Kalau itu dibiarkan,
      // error rollback menggantikan penyebab aslinya dan migrasi jadi mustahil
      // didiagnosis. Penyebab asli selalu menang.
      try {
        db.exec('ROLLBACK')
      } catch {
        // sengaja diabaikan
      }
      throw err
    }
  }
}

/** Membuka database pada path tertentu dan memastikan skemanya mutakhir. */
export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  // Tanpa ini koneksi kedua langsung gagal "database is locked" alih-alih
  // menunggu giliran. Scheduler dan CLI bisa berjalan bersamaan.
  db.exec('PRAGMA busy_timeout = 5000')
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
