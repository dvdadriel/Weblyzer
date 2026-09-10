import { execFile } from 'node:child_process'
import type { HasilAi } from './jalankan.ts'

/**
 * Batas waktu satu pemanggilan `agy`.
 *
 * Lebih longgar dari batas Messages API (90 detik) karena CLI membawa biaya
 * yang tidak ada di HTTP: ia memuat runtime-nya sendiri, memeriksa
 * kredensial, dan pada model bertingkat "high" ikut berpikir lebih lama.
 * Terukur sekitar sepuluh detik untuk prompt satu kata pada
 * `gemini-3.8-flash-medium`.
 */
const BATAS_MS = 180_000

/**
 * Bentuk pemanggilan `agy`, dan ini SUDAH DIBUKTIKAN dengan mencoba langsung
 * — bukan dibaca dari dokumentasi:
 *
 *   agy --model <model> -p='<prompt>'     berhasil
 *   agy -p '<prompt>' --model <model>     DITOLAK, agy menjawab
 *                                         "Attach the prompt to the flag
 *                                          (-p='your prompt') and move
 *                                          --model elsewhere"
 *   echo '<prompt>' | agy -p --model X    DITOLAK, mencetak layar bantuan
 *
 * Jadi promptnya WAJIB menempel ke flag dengan `=`, dan stdin tidak dipakai
 * sama sekali. Itu berbeda dari `claude -p` yang membaca stdin, dan perbedaan
 * itulah alasan berkas ini terpisah: satu tempat untuk satu keanehan.
 *
 * Prompt masuk sebagai argumen, jadi ARG_MAX yang membatasinya. Di macOS itu
 * 1 MB sedangkan prompt ringkasan beberapa kilobyte — aman, tapi batasnya
 * nyata dan bukan tak terhingga.
 */
function argumen(model: string, prompt: string): string[] {
  return ['--model', model, `-p=${prompt}`]
}

/**
 * Menafsirkan hasil `execFile` menjadi `HasilAi`.
 *
 * Dipisah dari pemanggilannya supaya bisa diuji tanpa men-spawn CLI sungguhan
 * — pola yang sama dengan `tafsirkanGalat` di `jalankan.ts`. Menguji lewat CLI
 * nyata berarti suite yang butuh langganan agy aktif, sepuluh detik per kasus,
 * dan hasil berbeda tergantung mesin siapa yang menjalankannya.
 */
export function tafsirkanAgy(
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
          'Perintah `agy` tidak ada di PATH. Jalur ini menjalankan CLI di mesin ini, ' +
          'jadi ia harus terpasang di sini.',
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
      return { ok: false, galat: `agy tidak selesai dalam ${BATAS_MS / 1000} detik.` }
    }

    // stderr lebih dulu: di sanalah CLI menaruh alasannya.
    const kata = (stderr || '').trim() || (stdout || '').trim()
    if (kata !== '') return { ok: false, galat: kata.slice(0, 2000) }

    // `err.message` TIDAK dipakai, dan ini bukan kelalaian: `execFile`
    // menyusunnya sebagai "Command failed: " + seluruh baris perintah, dan
    // baris perintah itu memuat prompt utuh — belasan kilobyte temuan yang
    // masuk ke `runs.ai_error` lalu terpampang di panel ringkasan. Yang
    // berguna dari galat itu cuma kode keluarnya.
    return {
      ok: false,
      galat: `agy keluar dengan kode ${err.code ?? '?'} tanpa keluaran maupun pesan galat.`,
    }
  }

  const teks = (stdout || '').trim()

  // Layar bantuan sebagai keluaran BERARTI GAGAL, walau exit code 0.
  //
  // Inilah kegagalan paling menyesatkan dari jalur ini: bentuk argumen yang
  // salah membuat agy mencetak daftar subcommand-nya dan keluar bersih, dan
  // tanpa pemeriksaan ini teks itu akan tersimpan sebagai "ringkasan" di
  // tabel `reports` lalu ditampilkan sebagai hasil analisis.
  if (/Available subcommands:|Usage of agy:/.test(teks)) {
    return {
      ok: false,
      galat: 'agy mencetak layar bantuan alih-alih menjawab — bentuk argumennya salah.',
    }
  }

  if (teks === '') {
    // Exit 0 dengan keluaran kosong tetap kegagalan: tidak ada ringkasan yang
    // bisa disimpan, dan menyimpan string kosong sebagai "berhasil" akan
    // menampilkan panel ringkasan yang melompong.
    return { ok: false, galat: 'agy selesai tanpa keluaran.' }
  }

  return { ok: true, teks: teks.slice(0, batasKeluaran) }
}

/**
 * Menjalankan satu prompt lewat CLI `agy` di mesin server.
 *
 * Galat dikembalikan sebagai nilai, bukan dilempar: pemanggilnya adalah job
 * pemindaian, dan AI yang gagal tidak boleh menggagalkan pemindaian yang
 * datanya sudah benar.
 */
export function jalankanAgy(
  model: string,
  prompt: string,
  batasKeluaran: number,
): Promise<HasilAi> {
  return new Promise((resolve) => {
    execFile(
      'agy',
      argumen(model, prompt),
      { timeout: BATAS_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => resolve(tafsirkanAgy(err, stdout, stderr, batasKeluaran)),
    )
  })
}

/** Prompt uji. Pendek, dan jawabannya bisa diperiksa — jadi jawaban yang bukan
 *  jawaban tidak lolos sebagai "berhasil". */
const PROMPT_UJI = 'Balas dengan tepat satu kata: SIAP'

/**
 * Memeriksa bahwa `agy` benar-benar ada dan menjawab.
 *
 * Berbeda dari validasi API key yang gratis lewat `GET /v1/models`: di sini
 * tidak ada endpoint murah, jadi pemeriksaannya memakai satu pemanggilan
 * nyata. Itu memakai kuota langganan, dan karena itu hanya dijalankan saat
 * pemakainya menekan tombolnya — bukan saat halaman dimuat.
 */
export async function ujiAgy(model: string): Promise<{ ok: true } | { ok: false; pesan: string }> {
  const hasil = await jalankanAgy(model, PROMPT_UJI, 200)
  if (!hasil.ok) return { ok: false, pesan: hasil.galat }
  return { ok: true }
}
