'use server'

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { revalidatePath } from 'next/cache'
import { getDb } from '../lib/db.ts'
import { createSite } from '../lib/repos/sites.ts'
import { runAktif } from '../lib/ui/queries.ts'
import { pilihPenyedia, PENYEDIA } from '../lib/ai/penyedia.ts'
import { ujiPenyedia } from '../lib/ai/jalankan.ts'
import { recheck } from '../lib/recheck.ts'
import type { IdPenyedia } from '../lib/ai/penyedia.ts'

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
  kategori: 'bugs' | 'console' | 'security' | 'seo' | 'geo' | 'audit' | 'lighthouse',
  path: string,
): Promise<HasilAksi> {
  // Penjaga ganda-klik. Tanpa ini dua Chromium berebut satu situs.
  if (runAktif(getDb(), siteId)) return { error: 'Pemindaian situs ini sedang berjalan.' }

  // `geo` dan `audit` adalah subcommand-nya sendiri, bukan kategori dari
  // `scan`: keduanya tidak menjelajah dengan Chromium melainkan memanggil
  // claude-seo, dan `scanHandler` akan menolaknya sebagai kategori tak dikenal.
  const argumen =
    kategori === 'lighthouse' || kategori === 'geo' || kategori === 'audit'
      ? [kategori, String(siteId)]
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

/**
 * Menghapus situs beserta seluruh riwayatnya.
 *
 * Satu `DELETE` sudah cukup: skema memasang `ON DELETE CASCADE` dari `sites`
 * ke `runs`, `pages`, dan `findings`, lalu dari `runs`/`pages` ke `jobs` dan
 * `lighthouse` — dan `PRAGMA foreign_keys = ON` dipasang di `openDb`. Menyapu
 * tabel satu per satu di sini berarti urutan penghapusan kedua yang harus
 * ikut benar setiap kali skemanya berubah.
 *
 * Tidak ada undo, dan itu disengaja: membangun tempat sampah untuk alat satu
 * pemakai adalah tabel plus penyaring di setiap kueri. Yang dipasang sebagai
 * gantinya adalah konfirmasi yang menyebut jumlah yang akan hilang.
 */
export async function hapusSitus(siteId: number): Promise<HasilAksi> {
  // Menghapus situs yang sedang dipindai akan menarik baris dari bawah proses
  // pekerja yang masih menulis: crawl-nya lalu gagal di tengah dengan galat
  // foreign key yang tidak menjelaskan apa pun. Ditolak dengan alasan jelas.
  if (runAktif(getDb(), siteId)) {
    return { error: 'Situs ini sedang dipindai. Tunggu sampai selesai, lalu hapus.' }
  }

  getDb().prepare('DELETE FROM sites WHERE id = ?').run(siteId)
  revalidatePath('/')
  return null
}

/**
 * Menyimpan penyedia AI pilihan. String kosong berarti dimatikan.
 *
 * Validasinya ada di `pilihPenyedia`, bukan di sini: form bisa mengirim apa
 * saja, dan `config` bertipe TEXT bebas yang akan menerima nilai sampah tanpa
 * keluhan — lalu memunculkannya sebagai nama perintah yang di-spawn.
 */
export async function simpanPenyedia(id: string): Promise<HasilAksi> {
  try {
    pilihPenyedia(getDb(), id === '' ? null : (id as IdPenyedia))
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  revalidatePath('/model')
  return null
}

/**
 * Menguji penyedia dengan benar-benar memanggil CLI-nya.
 *
 * Tidak dijalankan saat halaman dimuat, dan itu keputusan: satu uji butuh
 * beberapa detik per penyedia, jadi memuat halaman konfigurasi akan terasa
 * macet. Yang dijalankan otomatis cuma `--version` yang instan — dan justru
 * karena itu tidak cukup, tombol ini ada.
 */
export async function ujiKoneksi(id: string): Promise<{ ok: boolean; pesan: string }> {
  if (!PENYEDIA.some((p) => p.id === id)) {
    return { ok: false, pesan: `penyedia tidak dikenal: ${id}` }
  }
  return ujiPenyedia(id as IdPenyedia)
}

/**
 * Menjalankan ulang ringkasan tanpa memindai ulang.
 *
 * Terpisah dari `jalankanScan` karena memang pekerjaan yang berbeda: crawl
 * ulang situs 141 halaman butuh menit-menitan, sedangkan meringkas temuan yang
 * sudah ada butuh beberapa detik. Menyatukan keduanya berarti menunggu crawl
 * hanya untuk memperbaiki ringkasan yang gagal.
 */
export async function ulangiRingkasan(siteId: number, path: string): Promise<HasilAksi> {
  if (runAktif(getDb(), siteId)) {
    return { error: 'Situs ini sedang dipindai. Tunggu sampai selesai.' }
  }

  const anak = spawn(
    process.execPath,
    [join(process.cwd(), 'scripts/scan.ts'), 'ringkasan', String(siteId)],
    { detached: true, stdio: 'ignore', cwd: process.cwd() },
  )
  anak.unref()

  if (!(await tungguRun(siteId))) {
    return { error: 'Peringkasan gagal dijalankan. Periksa log server.' }
  }
  revalidatePath(path)
  return null
}

export type HasilPeriksa = { keadaan: string; pesan?: string; error?: string }

/**
 * Memeriksa ulang satu temuan: apakah yang ini sudah beres?
 *
 * Dijalankan di dalam proses server, bukan di-spawn seperti pemindaian —
 * satu halaman selesai dalam sekitar dua detik (terukur 1,5s pada situs
 * nyata), jauh di bawah batas waktu server action. Yang perlu di-spawn adalah
 * crawl 141 halaman, bukan ini.
 */
export async function periksaTemuan(findingId: number, path: string): Promise<HasilPeriksa> {
  // Ditolak selagi pemindaian berjalan: dua Chromium pada satu situs saling
  // berebut, dan yang kalah melapor gagal seolah halamannya rusak.
  const situsTemuan = getDb()
    .prepare('SELECT site_id FROM findings WHERE id = ?')
    .get(findingId) as { site_id: number } | undefined
  if (situsTemuan && runAktif(getDb(), situsTemuan.site_id)) {
    return { keadaan: 'sibuk', error: 'Situs ini sedang dipindai. Tunggu sampai selesai.' }
  }

  try {
    const hasil = await recheck(getDb(), findingId)
    revalidatePath(path)
    return hasil.keadaan === 'beres' || hasil.keadaan === 'masih-ada'
      ? { keadaan: hasil.keadaan }
      : { keadaan: hasil.keadaan, pesan: 'pesan' in hasil ? hasil.pesan : undefined }
  } catch (err) {
    return { keadaan: 'galat', error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Menyalakan atau mematikan pengukuran desktop untuk sebuah situs.
 *
 * Biayanya nyata dan karena itu jadi pilihan, bukan bawaan: setiap halaman
 * diukur dua kali per strategi (mekanisme irisan yang mematikan flapping),
 * jadi menyalakan desktop menggandakan waktu Lighthouse. Terukur 21 detik
 * untuk dua strategi pada satu halaman.
 */
export async function aturStrategi(siteId: number, keduanya: boolean): Promise<HasilAksi> {
  if (runAktif(getDb(), siteId)) {
    return { error: 'Situs ini sedang dipindai. Tunggu sampai selesai.' }
  }
  getDb()
    .prepare('UPDATE sites SET lighthouse_strategy = ? WHERE id = ?')
    .run(keduanya ? 'both' : 'mobile', siteId)
  revalidatePath(`/sites/${siteId}/lighthouse`)
  return null
}
