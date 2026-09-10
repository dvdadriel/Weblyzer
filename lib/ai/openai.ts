import type { HasilAi } from './jalankan.ts'

/**
 * Jalur `POST /chat/completions` — protokol OpenAI.
 *
 * Ditulis dengan `fetch`, BUKAN dengan `openai` npm: yang dibutuhkan cuma satu
 * POST dan satu pembacaan `choices[0].message.content`. Paket resminya membawa
 * streaming, retry, tool calling, dan tipe untuk selusin endpoint yang tidak
 * dipanggil di sini — satu dependensi baru untuk tiga puluh baris.
 *
 * Satu berkas ini mencakup NVIDIA NIM, Groq, OpenRouter, Together, vLLM, dan
 * Ollama sekaligus, karena mereka memang bicara protokol yang sama. Yang
 * membedakan hanya base URL, dan itu datang dari `.env`.
 */

const BATAS_MS = 180_000

/** Bentuk balasan yang benar-benar dibaca. Sisanya diabaikan. */
type Balasan = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[]
  error?: { message?: string }
}

/**
 * Menafsirkan balasan menjadi `HasilAi`.
 *
 * Dipisah dari `fetch`-nya supaya bisa diuji tanpa jaringan — pola yang sama
 * dengan `tafsirkanGalat` di jalur Anthropic dan `tafsirkanAgy` di jalur CLI.
 * Yang perlu dijamin di sini adalah penafsirannya, dan itu murni logika.
 */
export function tafsirkanOpenai(
  status: number,
  tubuh: unknown,
  batasKeluaran: number,
): HasilAi {
  const b = (tubuh ?? {}) as Balasan

  if (status !== 200) {
    // Pesan penyedianya dipakai kalau ada. Di sinilah "model not found",
    // "invalid api key", dan "insufficient quota" muncul — tiga hal yang
    // masing-masing butuh tindakan berbeda, dan semuanya hilang kalau
    // diringkas menjadi "gagal".
    const pesan = b.error?.message?.trim()
    if (pesan) return { ok: false, galat: `${status}: ${pesan}`.slice(0, 2000) }
    if (status === 401) return { ok: false, galat: '401: API key ditolak penyedianya.' }
    if (status === 404) {
      return {
        ok: false,
        galat: '404: endpoint atau modelnya tidak ada. Periksa WEBLYZER_AI_BASE_URL dan WEBLYZER_AI_MODEL.',
      }
    }
    return { ok: false, galat: `Penyedia mengembalikan status ${status}.` }
  }

  const teks = (b.choices?.[0]?.message?.content ?? '').trim()
  if (teks === '') {
    // Sama seperti dua jalur lainnya: berhasil dengan keluaran kosong tetap
    // kegagalan, karena tidak ada ringkasan yang bisa disimpan dan panel
    // ringkasan yang melompong lebih buruk daripada pesan galat.
    const sebab = b.choices?.[0]?.finish_reason
    return {
      ok: false,
      galat: sebab
        ? `Model selesai tanpa keluaran (finish_reason: ${sebab}).`
        : 'Model selesai tanpa keluaran.',
    }
  }
  return { ok: true, teks: teks.slice(0, batasKeluaran) }
}

/** Header auth. Kunci kosong berarti server lokal yang tidak memintanya. */
function header(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(apiKey === '' ? {} : { authorization: `Bearer ${apiKey}` }),
  }
}

export async function jalankanOpenai(
  cfg: { baseUrl: string; apiKey: string; model: string },
  prompt: string,
  batasKeluaran: number,
): Promise<HasilAi> {
  try {
    const r = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: header(cfg.apiKey),
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        // Tanpa `temperature`: bawaan penyedianya sudah benar untuk meringkas,
        // dan sebagian model penalaran menolak parameter itu dengan 400.
        max_tokens: 8_000,
        stream: false,
      }),
      signal: AbortSignal.timeout(BATAS_MS),
    })

    // Tubuh dibaca sebagai teks lebih dulu, bukan langsung `.json()`.
    // Gateway yang mengembalikan HTML (nginx 502, halaman login proxy) akan
    // membuat `.json()` melempar SyntaxError yang tidak menyebut status
    // maupun asal masalahnya.
    const mentah = await r.text()
    let tubuh: unknown
    try {
      tubuh = JSON.parse(mentah)
    } catch {
      return {
        ok: false,
        galat: `Penyedia mengembalikan ${r.status} yang bukan JSON: ${mentah.slice(0, 300)}`,
      }
    }
    return tafsirkanOpenai(r.status, tubuh, batasKeluaran)
  } catch (err) {
    const e = err as { name?: string; message?: string }
    if (e?.name === 'TimeoutError') {
      return { ok: false, galat: `Tidak ada jawaban dalam ${BATAS_MS / 1000} detik.` }
    }
    // Server lokal yang belum menyala mendarat di sini, dan pesan Node
    // ("fetch failed") tidak menyebut alamat yang gagal dihubungi.
    return {
      ok: false,
      galat: `Gagal menghubungi ${cfg.baseUrl}: ${e?.message ?? String(err)}`,
    }
  }
}

/**
 * Memeriksa konfigurasi dengan `GET /models`.
 *
 * Endpoint itu ada di protokol yang sama dan tidak memakai token — jadi
 * memeriksa kunci tidak perlu membayar satu pemanggilan. Yang tidak bisa
 * dijawabnya adalah apakah MODEL-nya benar; itu memang urusan pemanggilan
 * sungguhan.
 */
export async function periksaOpenai(cfg: {
  baseUrl: string
  apiKey: string
}): Promise<{ ok: true } | { ok: false; pesan: string }> {
  try {
    const r = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/models`, {
      headers: header(cfg.apiKey),
      signal: AbortSignal.timeout(15_000),
    })
    if (r.status === 200) return { ok: true }
    if (r.status === 401) return { ok: false, pesan: 'API key ditolak penyedianya.' }
    return { ok: false, pesan: `Pemeriksaan mengembalikan status ${r.status}.` }
  } catch (err) {
    const e = err as { message?: string }
    return { ok: false, pesan: `Gagal menghubungi ${cfg.baseUrl}: ${e?.message ?? String(err)}` }
  }
}

/**
 * Daftar model yang tersedia untuk kunci ini.
 *
 * Ada karena pertanyaan "model apa yang bisa saya pakai" hanya bisa dijawab
 * penyedianya sendiri — daftar yang ditulis di kode akan salah begitu penyedia
 * menambah atau menghapus satu model.
 */
export async function daftarModel(cfg: {
  baseUrl: string
  apiKey: string
}): Promise<string[] | null> {
  try {
    const r = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/models`, {
      headers: header(cfg.apiKey),
      signal: AbortSignal.timeout(15_000),
    })
    if (r.status !== 200) return null
    const tubuh = (await r.json()) as { data?: { id?: string }[] }
    return (tubuh.data ?? []).map((m) => m.id).filter((id): id is string => !!id)
  } catch {
    return null
  }
}
