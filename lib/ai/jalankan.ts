import { execFile } from 'node:child_process'
import { PENYEDIA, type IdPenyedia } from './penyedia.ts'

export type HasilAi =
  | { ok: true; teks: string }
  | { ok: false; galat: string }

/**
 * Batas waktu satu pemanggilan. Ringkasan satu run adalah satu prompt pendek,
 * dan lima detik sudah cukup pada percobaan langsung; sembilan puluh detik
 * memberi ruang untuk model yang lambat tanpa membiarkan pemindaian tengah
 * malam menggantung sampai pagi.
 */
const BATAS_MS = 90_000

/**
 * Keluaran yang lebih panjang dari ini dipotong. Ringkasan yang meledak
 * ukurannya biasanya berarti CLI mengembalikan sesuatu yang bukan ringkasan —
 * jejak galat, bantuan penggunaan, atau transkrip. Menyimpannya utuh berarti
 * satu baris database berukuran megabyte.
 */
const BATAS_KELUARAN = 20_000

/**
 * Cara memanggil tiap CLI, dan keduanya memang berbeda — sudah dibuktikan
 * dengan mencoba langsung, bukan dibaca dari dokumentasi:
 *
 * - `claude -p` membaca seluruh prompt dari stdin. Berhasil, exit 0, 5 detik.
 * - `gemini -p` MENOLAK berdiri tanpa nilai ("Not enough arguments following:
 *   p"), jadi promptnya harus jadi argumen. ARG_MAX di macOS 1 MB sedangkan
 *   prompt kita beberapa kilobyte, jadi aman.
 */
function panggilan(id: IdPenyedia, prompt: string): { argumen: string[]; stdin: string } {
  switch (id) {
    case 'claude':
      return { argumen: ['-p'], stdin: prompt }
    case 'gemini':
      return { argumen: ['-p', prompt], stdin: '' }
  }
}

/**
 * Menafsirkan hasil `execFile` menjadi HasilAi.
 *
 * Dipisah dari pemanggilannya supaya bisa diuji tanpa men-spawn CLI sungguhan:
 * yang perlu dijamin di sini adalah pemetaan galatnya, dan itu murni logika.
 * Menguji lewat CLI nyata berarti suite yang butuh jaringan, tujuh detik per
 * kasus, dan hasil berbeda tergantung mesin siapa yang menjalankannya.
 */
export function tafsirkan(
  perintah: string,
  err: (Error & { code?: string | number }) | null,
  stdout: string,
  stderr: string,
): HasilAi {
  if (err) {
    if (err.code === 'ENOENT') return { ok: false, galat: `${perintah} tidak ditemukan di PATH` }
    if (err.code === 'ETIMEDOUT') {
      return { ok: false, galat: `${perintah} tidak selesai dalam ${BATAS_MS / 1000} detik` }
    }
    // stderr lebih dulu: di sinilah CLI menaruh alasannya. Pesan Node
    // ("Command failed") tidak menyebut apa pun yang berguna, dan inilah
    // bedanya antara "perlu GEMINI_API_KEY" dan sekadar "gagal".
    const pesan = (stderr || '').trim() || err.message
    return { ok: false, galat: pesan.slice(0, 2000) }
  }

  const teks = (stdout || '').trim()
  if (teks === '') {
    // Exit 0 dengan keluaran kosong tetap kegagalan: tidak ada ringkasan yang
    // bisa disimpan, dan menyimpan string kosong sebagai "berhasil" akan
    // menampilkan panel ringkasan yang melompong.
    return { ok: false, galat: `${perintah} selesai tanpa keluaran` }
  }
  return { ok: true, teks: teks.slice(0, BATAS_KELUARAN) }
}

/**
 * Menjalankan satu prompt lewat CLI penyedia.
 *
 * Galat dikembalikan sebagai nilai, bukan dilempar: pemanggilnya adalah job
 * pemindaian, dan AI yang gagal tidak boleh menggagalkan pemindaian yang
 * datanya sudah benar. Pesan CLI diteruskan apa adanya — `ai_error` di
 * database memang untuk dibaca manusia, dan meringkasnya jadi "gagal"
 * menghapus satu-satunya petunjuk yang ada.
 */
export function jalankanAi(id: IdPenyedia, prompt: string): Promise<HasilAi> {
  const penyedia = PENYEDIA.find((p) => p.id === id)
  if (!penyedia) return Promise.resolve({ ok: false, galat: `penyedia tidak dikenal: ${id}` })

  const { argumen, stdin } = panggilan(id, prompt)

  return new Promise((resolve) => {
    const anak = execFile(
      penyedia.perintah,
      argumen,
      { timeout: BATAS_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => resolve(tafsirkan(penyedia.perintah, err, stdout, stderr)),
    )

    if (stdin !== '') {
      anak.stdin?.end(stdin)
    } else {
      // Wajib ditutup. CLI yang membaca stdin akan menunggu selamanya kalau
      // pipe-nya dibiarkan terbuka, dan batas waktu di atas jadi satu-satunya
      // yang menyelamatkan — sembilan puluh detik terbuang untuk tiap run.
      anak.stdin?.end()
    }
  })
}

/** Prompt uji. Pendek dan jawabannya bisa diperiksa, jadi CLI yang menjawab
 *  dengan bantuan penggunaan tidak lolos sebagai "berhasil". */
const PROMPT_UJI = 'Balas dengan tepat satu kata: SIAP'

export type HasilUji = { ok: boolean; pesan: string }

/**
 * Menguji penyedia dengan benar-benar memanggilnya.
 *
 * `--version` tidak cukup, dan itu sudah terbukti mahal: `gemini --version`
 * berhasil sedangkan mode headless-nya menolak tanpa GEMINI_API_KEY. Halaman
 * konfigurasi yang hanya memeriksa versi akan melaporkan "siap" untuk
 * penyedia yang tidak akan pernah jalan — dan kegagalannya baru muncul pada
 * pemindaian tengah malam.
 */
export async function ujiPenyedia(id: IdPenyedia): Promise<HasilUji> {
  const hasil = await jalankanAi(id, PROMPT_UJI)
  if (!hasil.ok) return { ok: false, pesan: hasil.galat }
  return { ok: true, pesan: hasil.teks.slice(0, 200) }
}
