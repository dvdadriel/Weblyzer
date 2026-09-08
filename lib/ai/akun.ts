import { execFile } from 'node:child_process'
import type { IdPenyedia } from './penyedia.ts'

/**
 * Status login akun penyedia AI.
 *
 * Login OAuth-nya **sudah ada dan bukan milik aplikasi ini** — `claude auth
 * login` yang mengerjakannya, dan kredensialnya disimpan CLI itu sendiri
 * (keyring OS). Weblyzer cuma memanggil CLI-nya, jadi ia otomatis memakai akun
 * yang sudah masuk.
 *
 * Yang belum ada sebelumnya adalah **melihatnya**. Halaman `/model` hanya bisa
 * menjawab "CLI-nya jalan atau tidak", padahal `--version` tetap berhasil pada
 * CLI yang kredensialnya sudah kedaluwarsa. Bedanya baru terasa saat
 * pemindaian tengah malam gagal dan tidak ada yang tahu kenapa.
 *
 * Yang sengaja TIDAK dibangun: OAuth sendiri di dalam Weblyzer. Itu berarti
 * menyimpan token di `data.db` — berkas yang sampai sekarang nol kredensial dan
 * tidak terenkripsi — sekaligus membangun ulang alur yang sudah bekerja. Asas
 * proyek ini "tanpa API key" (lihat `penyedia.ts`), dan token OAuth adalah
 * kunci juga.
 */

export type StatusAkun =
  | { keadaan: 'masuk'; email: string | null; org: string | null; langganan: string | null; metode: string | null }
  | { keadaan: 'keluar' }
  | { keadaan: 'tak-didukung' }
  | { keadaan: 'galat'; pesan: string }

/** `--version` tidak menyentuh jaringan, tapi `auth status` bisa. Tetap pendek:
 *  halaman konfigurasi tidak boleh menggantung karena satu panel. */
const BATAS_MS = 8000

/**
 * Penyedia yang punya cara memeriksa status login dari luar.
 *
 * Hanya `claude`. `gemini` tidak punya subcommand auth sama sekali — auth-nya
 * lewat mode interaktif atau `GEMINI_API_KEY`, dan keduanya tidak bisa
 * ditanyai. Ini asimetri nyata di alatnya, bukan kelalaian di sini, dan
 * halamannya menyebutkannya apa adanya alih-alih menampilkan panel kosong yang
 * terbaca seperti kerusakan.
 */
const PUNYA_AUTH: Record<IdPenyedia, boolean> = {
  claude: true,
  gemini: false,
}

/**
 * Menafsirkan keluaran `claude auth status --json`.
 *
 * Dipisah dari pemanggilannya supaya bisa diuji tanpa CLI sungguhan — pola
 * yang sama dengan `tafsirkan` di `jalankan.ts`, dan alasannya sama: hasilnya
 * bergantung pada siapa yang login di mesin yang menjalankan test.
 *
 * Bentuk yang diharapkan (terbukti dengan menjalankannya):
 * `{"loggedIn":true,"authMethod":"claude.ai","email":"...","orgName":"...",
 *   "subscriptionType":"team"}`
 */
export function bacaStatus(stdout: string): StatusAkun {
  const teks = stdout.trim()
  if (teks === '') return { keadaan: 'galat', pesan: 'Tidak ada keluaran dari claude auth status' }

  let data: unknown
  try {
    data = JSON.parse(teks)
  } catch {
    // Keluaran yang bukan JSON biasanya pesan galat CLI. Dipakai apa adanya,
    // dipotong: pesan mentah lebih berguna daripada "gagal membaca status".
    return { keadaan: 'galat', pesan: teks.slice(0, 300) }
  }

  if (typeof data !== 'object' || data === null) {
    return { keadaan: 'galat', pesan: 'Bentuk status tidak dikenal' }
  }
  const o = data as Record<string, unknown>

  // `loggedIn` yang bukan `true` diperlakukan sebagai keluar, termasuk kalau
  // fieldnya tidak ada sama sekali. Menebak "mungkin masuk" pada status yang
  // tidak jelas adalah kebohongan yang tepat jenisnya dilarang §2.2.
  if (o.loggedIn !== true) return { keadaan: 'keluar' }

  const teksAtauNull = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : null

  return {
    keadaan: 'masuk',
    email: teksAtauNull(o.email),
    org: teksAtauNull(o.orgName),
    langganan: teksAtauNull(o.subscriptionType),
    metode: teksAtauNull(o.authMethod),
  }
}

/** Status akun satu penyedia. */
export function statusAkun(id: IdPenyedia, perintah: string): Promise<StatusAkun> {
  if (!PUNYA_AUTH[id]) return Promise.resolve({ keadaan: 'tak-didukung' })

  return new Promise((resolve) => {
    execFile(
      perintah,
      ['auth', 'status', '--json'],
      { timeout: BATAS_MS },
      (err, stdout, stderr) => {
        if (err) {
          const kode = (err as NodeJS.ErrnoException).code
          // CLI-nya tidak ada. Bukan kerusakan — halaman ini sudah punya
          // panelnya sendiri untuk itu (`periksaPenyedia`), jadi di sini
          // cukup diam.
          if (kode === 'ENOENT') return resolve({ keadaan: 'tak-didukung' })
          if (kode === 'ETIMEDOUT') {
            return resolve({
              keadaan: 'galat',
              pesan: `claude auth status tidak menjawab dalam ${BATAS_MS / 1000} detik`,
            })
          }
          // Exit non-nol bisa berarti "belum login" pada sebagian versi CLI,
          // dan stdout-nya tetap memuat JSON. Dicoba dulu sebelum menyerah —
          // pelajaran yang sama dari `claude-seo/jalankan.ts`.
          if (stdout.trim() !== '') return resolve(bacaStatus(stdout))
          return resolve({
            keadaan: 'galat',
            pesan: (stderr.trim() || err.message).slice(0, 300),
          })
        }
        resolve(bacaStatus(stdout))
      },
    )
  })
}
