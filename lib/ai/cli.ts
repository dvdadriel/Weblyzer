import { execFile } from 'node:child_process'
import type { HasilAi } from './jalankan.ts'

/**
 * Dua CLI yang punya loginnya sendiri: `claude` dan `agy`.
 *
 * ============================================================================
 * KENAPA KEDUANYA SEJALUR, DAN KENAPA TETAP PERLU TABEL
 * ============================================================================
 * Keduanya bekerja dengan cara yang sama dari sudut pandang Weblyzer:
 * kredensialnya milik mesin ini (login desktop, bukan API key), tagihannya
 * langganan Anda, dan pemanggilannya satu proses satu prompt. Jadi
 * penafsiran galatnya dibagi.
 *
 * Yang TIDAK bisa dibagi adalah cara prompt dikirim, dan ini sudah dibuktikan
 * dengan mencoba langsung — bukan dibaca dari dokumentasi:
 *
 *   echo '<prompt>' | claude -p --model X --allowedTools ''   berhasil
 *   agy --model X -p='<prompt>'                               berhasil
 *   echo '<prompt>' | agy -p --model X                        DITOLAK, agy
 *                                                             mencetak layar
 *                                                             bantuannya
 *   agy -p '<prompt>' --model X                                DITOLAK, agy
 *                                                             menyuruh
 *                                                             menempelkan
 *                                                             prompt ke flag
 *
 * Jadi `claude` membaca stdin dan `agy` menolaknya. Satu tabel dengan dua
 * baris menyimpan perbedaan itu di satu tempat, alih-alih dua berkas yang
 * 90% sama.
 */
export type NamaCli = 'claude' | 'agy'

type Bentuk = {
  /**
   * Argumen lengkap. `prompt` diabaikan oleh CLI yang membacanya dari stdin —
   * diberikan ke keduanya supaya bentuk argumennya berada di satu tempat, dan
   * pemanggilnya tidak perlu tahu mana yang memakainya.
   */
  argumen: (model: string, prompt: string) => string[]
  /**
   * `true` berarti prompt dikirim lewat stdin; `false` berarti sudah menempel
   * di argumen.
   */
  stdin: boolean
  /**
   * Pola keluaran yang berarti CLI-nya mencetak layar bantuan alih-alih
   * menjawab.
   *
   * Ini kegagalan paling menyesatkan dari jalur CLI: bentuk argumen yang salah
   * membuat prosesnya keluar dengan kode 0, dan tanpa pemeriksaan ini teks
   * bantuan itu akan tersimpan sebagai "ringkasan" di tabel `reports` lalu
   * ditampilkan sebagai hasil analisis.
   */
  bantuan: RegExp
}

export const CLI: Record<NamaCli, Bentuk> = {
  claude: {
    // `--allowedTools ''` sengaja: meringkas temuan yang sudah ada di tangan
    // tidak butuh Read, Bash, atau WebFetch. Aspek GEO dan Audit memang
    // memberinya tool (lihat `lib/claude-seo/jalankan.ts`) karena keduanya
    // memang menjelajah; ringkasan tidak.
    argumen: (model) => ['-p', '--model', model, '--allowedTools', ''],

    stdin: true,
    bantuan: /^Usage: claude/m,
  },
  agy: {
    argumen: (model, prompt) => ['--model', model, `-p=${prompt}`],
    stdin: false,
    bantuan: /Available subcommands:|Usage of agy:/,
  },
}

/**
 * Batas waktu satu pemanggilan.
 *
 * Lebih longgar dari batas Messages API (90 detik) karena CLI membawa biaya
 * yang tidak ada di HTTP: ia memuat runtime-nya sendiri dan memeriksa
 * kredensial lebih dulu.
 */
export const BATAS_MS = 180_000

/**
 * Menafsirkan hasil `execFile` menjadi `HasilAi`.
 *
 * Dipisah dari pemanggilannya supaya bisa diuji tanpa men-spawn CLI sungguhan
 * — pola yang sama dengan `tafsirkanGalat` di jalur Anthropic. Mengujinya
 * lewat CLI nyata berarti suite yang butuh langganan aktif, sepuluh detik per
 * kasus, dan hasil berbeda tergantung mesin siapa yang menjalankannya.
 */
export function tafsirkanCli(
  nama: NamaCli,
  err: (Error & { code?: string | number; killed?: boolean }) | null,
  stdout: string,
  stderr: string,
  batasKeluaran: number,
): HasilAi {
  if (err) {
    if (err.code === 'ENOENT') {
      return {
        ok: false,
        galat:
          `Perintah \`${nama}\` tidak ada di PATH. Jalur ini menjalankan CLI di mesin ini, ` +
          `jadi ia harus terpasang di sini.`,
      }
    }

    // `killed` DAN `ETIMEDOUT`, keduanya.
    //
    // Terukur: pada batas waktu yang terlewat, Node di sini melaporkan
    // `code: 1` dengan `killed: true` — bukan ETIMEDOUT. Versi pertama hanya
    // memeriksa ETIMEDOUT, jadi setiap timeout jatuh ke cabang umum di bawah
    // dan tersimpan sebagai "Command failed: agy --model ... -p=<seluruh
    // prompt>". ETIMEDOUT tetap diperiksa karena Node memakainya pada jalur
    // lain, dan menghapusnya berarti menukar satu lubang dengan lubang lain.
    if (err.killed || err.code === 'ETIMEDOUT') {
      return { ok: false, galat: `${nama} tidak selesai dalam ${BATAS_MS / 1000} detik.` }
    }

    // stderr lebih dulu: di sanalah CLI menaruh alasannya. Kalau kosong,
    // stdout — `agy` mencetak "error: interrupted" ke sana, bukan ke stderr.
    const kata = (stderr || '').trim() || (stdout || '').trim()
    if (kata !== '') return { ok: false, galat: kata.slice(0, 2000) }

    // `err.message` TIDAK dipakai, dan ini bukan kelalaian: `execFile`
    // menyusunnya sebagai "Command failed: " + seluruh baris perintah, dan
    // pada `agy` baris itu memuat prompt utuh — belasan kilobyte temuan yang
    // masuk ke `runs.ai_error` lalu terpampang di panel ringkasan. Yang
    // berguna dari galat itu cuma kode keluarnya.
    return {
      ok: false,
      galat: `${nama} keluar dengan kode ${err.code ?? '?'} tanpa keluaran maupun pesan galat.`,
    }
  }

  const teks = (stdout || '').trim()

  if (CLI[nama].bantuan.test(teks)) {
    return {
      ok: false,
      galat: `${nama} mencetak layar bantuan alih-alih menjawab — bentuk argumennya salah.`,
    }
  }

  if (teks === '') {
    // Keluar bersih dengan keluaran kosong tetap kegagalan: tidak ada
    // ringkasan yang bisa disimpan, dan menyimpan string kosong sebagai
    // "berhasil" akan menampilkan panel ringkasan yang melompong.
    return { ok: false, galat: `${nama} selesai tanpa keluaran.` }
  }

  return { ok: true, teks: teks.slice(0, batasKeluaran) }
}

/**
 * Menjalankan satu prompt lewat CLI di mesin ini.
 *
 * Galat dikembalikan sebagai nilai, bukan dilempar: pemanggilnya adalah job
 * pemindaian, dan AI yang gagal tidak boleh menggagalkan pemindaian yang
 * datanya sudah benar.
 */
export function jalankanCli(
  nama: NamaCli,
  model: string,
  prompt: string,
  batasKeluaran: number,
): Promise<HasilAi> {
  const bentuk = CLI[nama]

  return new Promise((resolve) => {
    // Prompt yang menempel di argumen (jalur `agy`) dibatasi ARG_MAX — 1 MB di
    // macOS, sedangkan prompt ringkasan beberapa kilobyte. Aman, tapi batasnya
    // nyata dan bukan tak terhingga.
    const anak = execFile(
      nama,
      bentuk.argumen(model, prompt),
      { timeout: BATAS_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) =>
        resolve(tafsirkanCli(nama, err, stdout, stderr, batasKeluaran)),
    )
    if (bentuk.stdin) anak.stdin?.end(prompt)
  })
}

/** Prompt uji. Pendek, dan jawabannya bisa diperiksa — jadi jawaban yang bukan
 *  jawaban tidak lolos sebagai "berhasil". */
const PROMPT_UJI = 'Balas dengan tepat satu kata: SIAP'

/**
 * Memanggil CLI-nya sekali untuk membuktikan ia benar-benar menjawab.
 *
 * Berbeda dari validasi API key yang gratis lewat `GET /v1/models`: di sini
 * tidak ada endpoint murah, jadi pemeriksaannya memakai satu pemanggilan
 * nyata. Itu memakai kuota langganan, dan karena itu hanya dijalankan saat
 * pemakainya menekan tombolnya — bukan saat halaman dimuat.
 */
export async function ujiCli(nama: NamaCli, model: string): Promise<HasilAi> {
  return jalankanCli(nama, model, PROMPT_UJI, 200)
}
