import type { DatabaseSync } from 'node:sqlite'
import { enkripsi, dekripsi } from '../auth/kripto.ts'
import { modelDikenal } from './penyedia.ts'

export type Kunci = {
  model: string
  apiKey: string
  /** Empat karakter terakhir — satu-satunya bagian yang boleh muncul di layar. */
  ekor: string
  terverifikasi: boolean
}

/** Yang aman ditampilkan tanpa mendekripsi apa pun. */
export type InfoKunci = { model: string; ekor: string; terverifikasi: boolean }

export function simpanKunci(
  db: DatabaseSync,
  rahasia: string,
  userId: number,
  input: { model: string; apiKey: string },
): void {
  const apiKey = input.apiKey.trim()
  if (apiKey === '') throw new Error('API key tidak boleh kosong.')
  if (!modelDikenal(input.model)) throw new Error(`Model tidak dikenal: ${input.model}`)

  const kotak = enkripsi(rahasia, apiKey)

  // `terverifikasi_at` sengaja di-set NULL, termasuk saat menimpa kunci yang
  // sudah terverifikasi. Kunci yang baru diganti belum diuji, dan verifikasi
  // lama yang menempel berarti kunci salah dianggap siap sampai pemindaian
  // tengah malam gagal tanpa penjelasan — persis kegagalan yang halaman
  // konfigurasi ada untuk mencegahnya.
  db.prepare(
    `INSERT INTO ai_kunci (user_id, provider, model, ciphertext, iv, tag, terverifikasi_at)
     VALUES (?, 'anthropic', ?, ?, ?, ?, NULL)
     ON CONFLICT(user_id) DO UPDATE SET
       model = excluded.model, ciphertext = excluded.ciphertext,
       iv = excluded.iv, tag = excluded.tag, terverifikasi_at = NULL`,
  ).run(userId, input.model, kotak.ciphertext, kotak.iv, kotak.tag)
}

export function bacaKunci(db: DatabaseSync, rahasia: string, userId: number): Kunci | null {
  const baris = db
    .prepare('SELECT model, ciphertext, iv, tag, terverifikasi_at FROM ai_kunci WHERE user_id = ?')
    .get(userId) as
    | {
        model: string
        ciphertext: Uint8Array
        iv: Uint8Array
        tag: Uint8Array
        terverifikasi_at: string | null
      }
    | undefined
  if (!baris) return null

  const apiKey = dekripsi(rahasia, {
    ciphertext: Buffer.from(baris.ciphertext),
    iv: Buffer.from(baris.iv),
    tag: Buffer.from(baris.tag),
  })
  return {
    model: baris.model,
    apiKey,
    ekor: apiKey.slice(-4),
    terverifikasi: baris.terverifikasi_at !== null,
  }
}

/**
 * Yang dibutuhkan halaman konfigurasi, tanpa mendekripsi apa pun.
 *
 * Halaman itu hanya perlu menampilkan model, ekor kunci, dan statusnya —
 * membuka kunci untuk itu berarti API key berjalan melalui memori pada setiap
 * render, untuk data yang tidak ditampilkan.
 */
export function infoKunci(db: DatabaseSync, userId: number): InfoKunci | null {
  const baris = db
    .prepare('SELECT model, terverifikasi_at FROM ai_kunci WHERE user_id = ?')
    .get(userId) as { model: string; terverifikasi_at: string | null } | undefined
  if (!baris) return null
  return {
    model: baris.model,
    // Ekornya tidak bisa didapat tanpa mendekripsi, jadi tidak disimpan
    // terpisah dan tidak ditampilkan di jalur ini. Halaman memakai
    // `bacaKunci` hanya kalau memang mau menampilkan ekornya.
    ekor: '',
    terverifikasi: baris.terverifikasi_at !== null,
  }
}

/**
 * Gerbang fitur AI, satu pemeriksaan.
 *
 * Inilah "harus konfigurasikan AI modelnya dulu, sudah oke baru bisa gunakan".
 * Tidak mendekripsi apa pun: pertanyaannya "boleh atau tidak".
 */
export function kunciSiap(db: DatabaseSync, userId: number): boolean {
  const baris = db
    .prepare('SELECT terverifikasi_at FROM ai_kunci WHERE user_id = ?')
    .get(userId) as { terverifikasi_at: string | null } | undefined
  return baris?.terverifikasi_at != null
}

export function tandaiTerverifikasi(db: DatabaseSync, userId: number): void {
  db.prepare("UPDATE ai_kunci SET terverifikasi_at = datetime('now') WHERE user_id = ?").run(
    userId,
  )
}

export function hapusKunci(db: DatabaseSync, userId: number): void {
  db.prepare('DELETE FROM ai_kunci WHERE user_id = ?').run(userId)
}
