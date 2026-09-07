import { execFile } from 'node:child_process'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Penyedia AI yang dijangkau lewat CLI yang sudah terpasang, bukan lewat API
 * key. Itu keputusan dari awal proyek: tidak ada kunci untuk disimpan, tidak
 * ada tagihan untuk diawasi, dan langganan yang sudah dibayar ikut terpakai.
 *
 * Konsekuensinya jujur disebut di halaman konfigurasi: kalau CLI-nya tidak
 * ada, fiturnya tidak ada. Karena itu halaman itu mendeteksi, bukan sekadar
 * menawarkan daftar.
 */
export const PENYEDIA = [
  { id: 'claude', nama: 'Claude', perintah: 'claude' },
  { id: 'gemini', nama: 'Gemini', perintah: 'gemini' },
] as const

export type IdPenyedia = (typeof PENYEDIA)[number]['id']

export type Ketersediaan = {
  id: IdPenyedia
  nama: string
  perintah: string
  ada: boolean
  versi: string | null
  galat: string | null
}

/** Batas waktu `--version`. CLI yang menunggu login bisa menggantung selamanya. */
const BATAS_MS = 4000

function versiCli(perintah: string): Promise<{ versi: string | null; galat: string | null }> {
  return new Promise((resolve) => {
    execFile(perintah, ['--version'], { timeout: BATAS_MS }, (err, stdout) => {
      if (err) {
        // ENOENT berarti tidak terpasang — keadaan normal, bukan kerusakan.
        // Sisanya (timeout, keluar dengan kode bukan nol) adalah CLI yang ada
        // tapi tidak menjawab, dan itu perlu dibedakan: yang pertama minta
        // dipasang, yang kedua minta diperiksa.
        const kode = (err as NodeJS.ErrnoException).code
        if (kode === 'ENOENT') return resolve({ versi: null, galat: null })
        return resolve({
          versi: null,
          galat: kode === 'ETIMEDOUT' ? `Tidak menjawab dalam ${BATAS_MS / 1000} detik` : err.message,
        })
      }
      resolve({ versi: stdout.trim().split('\n')[0] ?? null, galat: null })
    })
  })
}

/**
 * Memeriksa setiap penyedia secara paralel. Serial akan berarti menunggu dua
 * kali batas waktu ketika keduanya menggantung.
 */
export async function periksaPenyedia(): Promise<Ketersediaan[]> {
  return Promise.all(
    PENYEDIA.map(async (p) => {
      const { versi, galat } = await versiCli(p.perintah)
      return { id: p.id, nama: p.nama, perintah: p.perintah, ada: versi !== null, versi, galat }
    }),
  )
}

const KUNCI = 'ai.penyedia'

/** `null` berarti AI dimatikan — keadaan yang sah, bukan konfigurasi yang hilang. */
export function penyediaTerpilih(db: DatabaseSync): IdPenyedia | null {
  const baris = db.prepare('SELECT value FROM config WHERE key = ?').get(KUNCI) as
    | { value: string }
    | undefined
  if (!baris) return null
  return PENYEDIA.some((p) => p.id === baris.value) ? (baris.value as IdPenyedia) : null
}

export function pilihPenyedia(db: DatabaseSync, id: IdPenyedia | null): void {
  if (id === null) {
    db.prepare('DELETE FROM config WHERE key = ?').run(KUNCI)
    return
  }
  // Divalidasi di sini, bukan dipercaya dari form: `config` bertipe TEXT bebas,
  // jadi nilai sampah akan tersimpan tanpa keluhan lalu muncul sebagai nama
  // perintah yang di-spawn.
  if (!PENYEDIA.some((p) => p.id === id)) {
    throw new Error(`penyedia tidak dikenal: ${id}`)
  }
  db.prepare(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KUNCI, id)
}
