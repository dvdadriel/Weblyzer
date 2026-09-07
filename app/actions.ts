'use server'

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { revalidatePath } from 'next/cache'
import { getDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { runAktif } from '../lib/ui/queries.ts'

/**
 * Menandai temuan diabaikan, atau membukanya kembali.
 *
 * `ignored` bersifat lengket di `reconcile`: pemindaian ulang tidak pernah
 * mengembalikannya ke `open`. Aturan itu sudah diuji di `test/findings.test.ts`;
 * di sini kita hanya membalik bendera yang sama.
 */
export async function ubahStatusTemuan(
  findingId: number,
  status: 'open' | 'ignored',
  path: string,
): Promise<void> {
  getDb().prepare('UPDATE findings SET status = ? WHERE id = ?').run(status, findingId)
  revalidatePath(path)
}

/**
 * `nama` dan `url` ikut dikembalikan bersama galat, dan itu bukan hiasan.
 *
 * React mengosongkan input tak-terkontrol setelah sebuah form action selesai —
 * termasuk ketika actionnya gagal. Tanpa mengembalikan nilainya, pemakai yang
 * salah mengetik alamat kehilangan kedua field dan harus mengulang dari nol,
 * lalu submit berikutnya diblokir `required` sementara pesan galat lama masih
 * terpampang. Nilai ini dipasang kembali sebagai `defaultValue`, jadi reset
 * React mendarat di apa yang tadi diketik.
 */
export type HasilAksi = { error: string; nama?: string; url?: string } | null

/**
 * Menambahkan situs dari form dashboard.
 *
 * Validasi URL-nya dipinjam dari `normalizeBaseUrl`, yang sudah dipakai CLI dan
 * sudah diuji — jadi situs yang masuk lewat tombol dan lewat terminal tidak
 * pernah tersimpan dalam dua bentuk berbeda.
 */
export async function tambahSitus(_sebelum: HasilAksi, form: FormData): Promise<HasilAksi> {
  const nama = String(form.get('nama') ?? '').trim()
  const url = String(form.get('url') ?? '').trim()
  if (!nama) return { error: 'Nama situs belum diisi.', nama, url }
  if (!url) return { error: 'Alamat situs belum diisi.', nama, url }

  try {
    createSite(getDb(), { name: nama, base_url: url })
  } catch (err) {
    // Pesan aslinya sudah menyebut apa yang salah dan apa yang diterima
    // ("base_url harus diawali http:// atau https:// — diterima: situs.com"),
    // jadi diteruskan apa adanya. UNIQUE constraint dari SQLite tidak, maka
    // diterjemahkan.
    const pesan = err instanceof Error ? err.message : String(err)
    return {
      error: /UNIQUE/.test(pesan) ? 'Situs dengan alamat itu sudah ada.' : pesan,
      nama,
      url,
    }
  }

  revalidatePath('/')
  return null
}

/**
 * Menjalankan pemindaian di proses terpisah.
 *
 * Sengaja men-spawn CLI yang sudah ada, bukan memanggil `drainQueue` di sini.
 * Dua alasan: satu crawl memakan beberapa menit sedangkan server action punya
 * batas waktu, dan CLI itu sudah menangani antrian, status run, serta
 * requeue job yang terputus — semuanya sudah teruji. Menyalin logikanya ke
 * sini berarti dua jalur yang harus sama-sama benar selamanya.
 *
 * `detached` + `unref` supaya pemindaian tidak mati saat server dev reload.
 */
export async function jalankanScan(
  siteId: number,
  kategori: 'bugs' | 'console' | 'security' | 'lighthouse',
  path: string,
): Promise<HasilAksi> {
  // Penjaga ganda-klik. Tanpa ini dua Chromium berebut satu situs.
  if (runAktif(getDb(), siteId)) return { error: 'Pemindaian situs ini sedang berjalan.' }

  const argumen =
    kategori === 'lighthouse'
      ? ['lighthouse', String(siteId)]
      : ['scan', String(siteId), kategori]

  const anak = spawn(process.execPath, [join(process.cwd(), 'scripts/scan.ts'), ...argumen], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  })
  anak.unref()

  // Ditunggu sampai proses anak menuliskan baris run-nya.
  //
  // `spawn` kembali seketika, jadi tanpa penungguan ini `revalidatePath` di
  // bawah merender ulang sebelum ada run yang bisa ditemukan — dan layar
  // kembali menampilkan tombol. Ditekan, lalu tidak terjadi apa-apa: keluhan
  // paling sulit ditelusuri yang bisa dibuat sebuah tombol.
  //
  // Batas waktunya juga menangkap kegagalan sungguhan (skrip hilang, Node
  // gagal start). Diam bukan pilihan: pemakai berhak tahu pemindaian tidak
  // pernah jalan.
  const mulai = await tungguRun(siteId)
  if (!mulai) {
    return { error: 'Pemindaian gagal dijalankan. Periksa log server.' }
  }

  revalidatePath(path)
  return null
}

const BATAS_MULAI_MS = 8000
const JEDA_MS = 150

async function tungguRun(siteId: number): Promise<boolean> {
  for (let habis = 0; habis < BATAS_MULAI_MS; habis += JEDA_MS) {
    if (runAktif(getDb(), siteId)) return true
    await new Promise((r) => setTimeout(r, JEDA_MS))
  }
  return false
}
