import type { DatabaseSync } from 'node:sqlite'
import type { User } from './pengguna.ts'
import type { Site } from '../repos/sites.ts'

export type Konteks = { jenis: 'user'; user: User } | { jenis: 'guest'; guestId: string }

const KOLOM = `id, name, base_url, sitemap_url, max_pages, lighthouse_mode,
               lighthouse_strategy, enabled, created_at, user_id, guest_id`

/**
 * Satu gerbang untuk kepemilikan situs.
 *
 * Bukan `WHERE user_id = ?` yang disebar di dua puluh kueri. Yang disebar akan
 * lupa satu tempat, dan tempat yang lupa itu adalah kebocoran data antar akun
 * — kelas bug yang tidak muncul di test mana pun sampai seseorang
 * melaporkannya. Satu gerbang bisa diuji sekali dan gagal keras kalau
 * dilewati.
 */
export function situsMilik(db: DatabaseSync, ctx: Konteks, siteId: number): Site {
  const { klausa, nilai } = filterPemilik(ctx)
  const row = db
    .prepare(`SELECT ${KOLOM} FROM sites WHERE id = ? AND (${klausa})`)
    .get(siteId, ...nilai)

  // Satu pesan untuk dua sebab: situs yang tidak ada, dan situs yang bukan
  // milik pemanggil. Membedakannya berarti mengumumkan situs mana yang ada di
  // instance ini kepada siapa pun yang mau mencoba id satu per satu.
  if (!row) throw new Error(`Situs ${siteId} tidak ditemukan.`)
  return row as unknown as Site
}

/**
 * Klausa WHERE untuk membatasi kueri daftar.
 *
 * Admin tidak dibatasi, dan itu juga yang membuat situs warisan (kedua kolom
 * pemiliknya NULL) tetap terlihat sebelum `seed-akun` memasang pemiliknya.
 */
export function filterPemilik(ctx: Konteks): { klausa: string; nilai: (string | number)[] } {
  if (ctx.jenis === 'user') {
    if (ctx.user.role === 'admin') return { klausa: '1 = 1', nilai: [] }
    return { klausa: 'user_id = ?', nilai: [ctx.user.id] }
  }
  return { klausa: 'guest_id = ?', nilai: [ctx.guestId] }
}

/** Kolom pemilik untuk INSERT situs baru. */
export function pasangPemilik(ctx: Konteks): {
  user_id: number | null
  guest_id: string | null
} {
  return ctx.jenis === 'user'
    ? { user_id: ctx.user.id, guest_id: null }
    : { user_id: null, guest_id: ctx.guestId }
}

/**
 * Apakah konteks ini boleh memakai aspek yang butuh CLI host — GEO dan Audit.
 *
 * Keduanya men-spawn `claude -p` dengan allowlist tool yang memuat `Bash`,
 * `Task`, dan `WebFetch`, di mesin ini, menulis ke disk (lihat
 * `lib/claude-seo/jalankan.ts`). Itu Claude Code, bukan Messages API, jadi
 * tidak ada padanan API key untuknya — dan membiarkan orang tak dikenal
 * memicunya berarti memberi mereka sesi ber-Bash di server Anda.
 */
export function bolehCliHost(ctx: Konteks): boolean {
  return ctx.jenis === 'user' && ctx.user.role === 'admin'
}

/** Apakah konteks ini boleh memakai fitur AI sama sekali. Guest tidak pernah. */
export function bolehAi(ctx: Konteks): boolean {
  return ctx.jenis === 'user'
}
