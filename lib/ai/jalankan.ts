import Anthropic from '@anthropic-ai/sdk'

export type HasilAi = { ok: true; teks: string } | { ok: false; galat: string }

/**
 * Batas waktu satu pemanggilan. Angka dan alasannya dibawa dari versi CLI:
 * ringkasan satu run adalah satu prompt pendek, dan sembilan puluh detik
 * memberi ruang untuk model yang lambat tanpa membiarkan pemindaian tengah
 * malam menggantung sampai pagi.
 */
export const BATAS_MS = 90_000

/**
 * Keluaran yang lebih panjang dari ini dipotong. Alasannya juga tidak berubah:
 * ringkasan yang meledak ukurannya biasanya berarti model mengembalikan
 * sesuatu yang bukan ringkasan, dan menyimpannya utuh berarti satu baris
 * database berukuran megabyte.
 */
export const BATAS_KELUARAN = 20_000

const MAKS_TOKEN = 8_000

/**
 * Menafsirkan galat SDK menjadi pesan yang bisa dibaca orang.
 *
 * Dipisah dari pemanggilannya supaya bisa diuji tanpa jaringan dan tanpa
 * kunci sungguhan — pola dan alasannya sama dengan `tafsirkan` versi CLI yang
 * digantikannya: yang perlu dijamin di sini adalah pemetaan galatnya, dan itu
 * murni logika. Mengujinya lewat API sungguhan berarti suite yang butuh
 * jaringan, beberapa detik per kasus, dan hasil berbeda tergantung kunci
 * siapa yang dipasang.
 */
export function tafsirkanGalat(err: unknown): { ok: false; galat: string } {
  const e = err as { name?: string; message?: string } | null
  const pesan = (() => {
    switch (e?.name) {
      case 'AuthenticationError':
        return 'API key tidak berlaku lagi. Simpan ulang kuncinya di halaman Model.'
      case 'PermissionDeniedError':
        return 'API key ini tidak punya izin untuk model yang dipilih.'
      case 'NotFoundError':
        return 'Model itu tidak tersedia untuk API key ini.'
      case 'RateLimitError':
        return 'Batas permintaan Anthropic tercapai. Coba lagi beberapa saat lagi.'
      case 'APIConnectionError':
      case 'APIConnectionTimeoutError':
      case 'APIUserAbortError':
        return (
          'Gagal menghubungi Anthropic — masalah jaringan, atau tidak selesai dalam ' +
          `${BATAS_MS / 1000} detik.`
        )
      case 'InternalServerError':
        return 'Anthropic mengembalikan galat server. Ini di sisi mereka; coba lagi nanti.'
      default:
        // Diteruskan apa adanya. `ai_error` di database memang untuk dibaca
        // manusia, dan meringkasnya jadi "gagal" menghapus satu-satunya
        // petunjuk yang ada.
        return e?.message ? String(e.message) : String(err)
    }
  })()
  return { ok: false, galat: pesan.slice(0, 2000) }
}

export type HasilValidasi = { ok: true } | { ok: false; pesan: string }

/** Menafsirkan kode status dari endpoint validasi kunci. */
export function tafsirkanValidasi(status: number): HasilValidasi {
  if (status === 200) return { ok: true }
  if (status === 401) {
    return { ok: false, pesan: 'API key tidak berlaku. Periksa lagi kuncinya.' }
  }
  // 403 dibedakan dari 401 dengan sengaja: kunci yang benar tetapi tidak
  // berhak tidak boleh disuruh diganti — orangnya akan mengganti kunci yang
  // sebenarnya sudah betul, lalu bingung kenapa tetap gagal.
  if (status === 403) {
    return { ok: false, pesan: 'API key ini tidak punya izin yang diperlukan.' }
  }
  if (status === 429) {
    return { ok: false, pesan: 'Batas permintaan tercapai saat memeriksa. Coba lagi sebentar.' }
  }
  if (status >= 500) {
    return { ok: false, pesan: `Anthropic mengembalikan ${status}. Ini di sisi mereka.` }
  }
  return { ok: false, pesan: `Pemeriksaan mengembalikan status ${status}.` }
}

/**
 * Memeriksa API key dengan `GET /v1/models`.
 *
 * Endpoint itu gratis dan tidak memakai token — 401 untuk kunci yang salah,
 * 200 untuk yang benar. Memeriksanya dengan satu permintaan ke Messages API
 * akan menghabiskan token pemakai untuk menjawab pertanyaan yang sudah
 * dijawab gratis.
 *
 * `fetch` langsung, bukan lewat SDK: yang dibutuhkan adalah kode statusnya,
 * dan SDK justru mengubah 401 menjadi exception yang harus dibongkar kembali.
 */
export async function validasiKunci(apiKey: string): Promise<HasilValidasi> {
  try {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(15_000),
    })
    return tafsirkanValidasi(r.status)
  } catch (err) {
    return { ok: false, pesan: tafsirkanGalat(err).galat }
  }
}

/**
 * Menjalankan satu prompt lewat Messages API.
 *
 * Galat dikembalikan sebagai nilai, bukan dilempar: pemanggilnya adalah job
 * pemindaian, dan AI yang gagal tidak boleh menggagalkan pemindaian yang
 * datanya sudah benar.
 *
 * Tanpa `temperature`, `top_p`, atau `budget_tokens` — ketiganya ditolak 400
 * pada model-model ini. Tanpa streaming: ringkasan satu run adalah keluaran
 * pendek, jauh di bawah ukuran yang membuat permintaan non-streaming kena
 * timeout HTTP.
 */
export async function jalankanAi(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<HasilAi> {
  const klien = new Anthropic({ apiKey, timeout: BATAS_MS, maxRetries: 1 })
  try {
    const jawab = await klien.messages.create({
      model,
      max_tokens: MAKS_TOKEN,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
    })

    // `stop_reason` diperiksa SEBELUM `content` dibaca. Penolakan mengembalikan
    // HTTP 200 dengan `content` kosong, dan kode yang langsung mengindeks
    // `content[0]` pecah di sana — dengan galat yang tidak menyebut sebabnya.
    if (jawab.stop_reason === 'refusal') {
      return { ok: false, galat: 'Model menolak permintaan ini.' }
    }

    const teks = jawab.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    if (teks === '') {
      // Berhasil dengan keluaran kosong tetap kegagalan: tidak ada ringkasan
      // yang bisa disimpan, dan menyimpan string kosong sebagai "berhasil"
      // menampilkan panel ringkasan yang melompong.
      return { ok: false, galat: 'Model selesai tanpa keluaran.' }
    }
    return { ok: true, teks: teks.slice(0, BATAS_KELUARAN) }
  } catch (err) {
    return tafsirkanGalat(err)
  }
}

/**
 * Prompt uji, dipertahankan dari versi CLI beserta alasannya: pendek, dan
 * jawabannya bisa diperiksa — jadi jawaban yang bukan jawaban tidak lolos
 * sebagai "berhasil".
 */
const PROMPT_UJI = 'Balas dengan tepat satu kata: SIAP'

export type HasilUji = { ok: boolean; pesan: string }

/**
 * Menguji kunci dengan benar-benar memanggil model yang dipilih.
 *
 * Berbeda dari `validasiKunci`, dan keduanya memang dibutuhkan:
 * `validasiKunci` gratis tapi hanya menjawab "kuncinya berlaku";
 * `ujiModel` memakai token tapi menjawab "kunci ini bisa memakai model
 * yang dipilih". Kunci yang berlaku untuk satu model bisa ditolak untuk
 * model lain, dan bedanya baru terasa saat pemindaian tengah malam gagal.
 */
export async function ujiModel(apiKey: string, model: string): Promise<HasilUji> {
  const hasil = await jalankanAi(apiKey, model, PROMPT_UJI)
  if (!hasil.ok) return { ok: false, pesan: hasil.galat }
  return { ok: true, pesan: hasil.teks.slice(0, 200) }
}
