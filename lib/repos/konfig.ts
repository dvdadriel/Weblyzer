import type { DatabaseSync } from 'node:sqlite'
import { CLI, type NamaCli } from '../ai/cli.ts'

/**
 * Pilihan CLI yang dibuat dari halaman web, disimpan di tabel `config`.
 *
 * ============================================================================
 * KENAPA YANG INI DI DATABASE SEDANGKAN API KEY DI .env
 * ============================================================================
 * Bedanya satu, dan itu menentukan: **jalur CLI tidak punya rahasia.**
 *
 * `claude` dan `agy` memakai loginnya sendiri di mesin ini. Memilih salah
 * satunya berarti menyimpan dua kata — nama CLI dan nama model — dan tidak ada
 * apa pun di antaranya yang berbahaya kalau terbaca. Jadi ia boleh dipilih
 * lewat tombol di halaman web.
 *
 * API key lain. Menyimpannya dari browser berarti rahasia menyeberang lewat
 * form, tersimpan di berkas database yang tidak terenkripsi, dan muncul di
 * layar orang yang membuka halamannya. Karena itu kunci hanya datang dari
 * `.env` — tempat kredensial alat baris perintah memang tinggal, dan yang
 * sudah diabaikan git.
 *
 * Tabel `config` sendiri sudah ada sejak migrasi 001 dan kosong sejak
 * penyedia global dibuang. Berkas ini memakainya kembali alih-alih menambah
 * tabel kedua untuk dua baris.
 */
const KUNCI_CLI = 'ai_cli'
const KUNCI_MODEL = 'ai_cli_model'

export type PilihanCli = { cli: NamaCli; model: string }

function adalahCli(v: string): v is NamaCli {
  return v in CLI
}

export function bacaPilihanCli(db: DatabaseSync): PilihanCli | null {
  const baris = db
    .prepare(`SELECT key, value FROM config WHERE key IN (?, ?)`)
    .all(KUNCI_CLI, KUNCI_MODEL) as { key: string; value: string }[]

  const peta = new Map(baris.map((b) => [b.key, b.value]))
  const cli = peta.get(KUNCI_CLI)
  const model = peta.get(KUNCI_MODEL)

  // Setengah pilihan diperlakukan sebagai tidak ada pilihan. Nama CLI tanpa
  // model akan dijalankan dengan `--model undefined`, dan CLI-nya menolak
  // dengan pesan yang tidak menyebut sebab sebenarnya.
  if (!cli || !model) return null

  // Nilai tak dikenal juga tidak ada pilihan. Barisnya bisa datang dari versi
  // lama atau dari suntingan tangan di berkas database, dan `CLI[nama]` yang
  // undefined akan meledak jauh dari sini.
  if (!adalahCli(cli)) return null

  return { cli, model }
}

export function simpanPilihanCli(db: DatabaseSync, pilihan: PilihanCli): void {
  const model = pilihan.model.trim()
  if (model === '') throw new Error('Nama model tidak boleh kosong.')
  if (!adalahCli(pilihan.cli)) throw new Error(`CLI tidak dikenal: ${pilihan.cli}`)

  const tulis = db.prepare(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )
  tulis.run(KUNCI_CLI, pilihan.cli)
  tulis.run(KUNCI_MODEL, model)
}

/** Kembali memakai `.env`. */
export function hapusPilihanCli(db: DatabaseSync): void {
  db.prepare('DELETE FROM config WHERE key IN (?, ?)').run(KUNCI_CLI, KUNCI_MODEL)
}
