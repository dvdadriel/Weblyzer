/**
 * Konfigurasi AI, dibaca dari lingkungan.
 *
 * ============================================================================
 * KENAPA DARI ENV, BUKAN DARI DATABASE
 * ============================================================================
 * Weblyzer berjalan di mesin pemakainya sendiri. Menyimpan API key terenkripsi
 * di database berarti kunci yang dienkripsi dengan rahasia yang tersimpan di
 * mesin yang sama — siapa pun yang bisa membaca database itu bisa membaca
 * rahasianya juga, jadi enkripsinya tidak menambah keamanan apa pun. Yang ia
 * tambahkan cuma satu tabel, satu form, satu jalur dekripsi, dan satu rahasia
 * yang tidak boleh hilang selamanya.
 *
 * Jadi konfigurasinya di `.env`, tempat kredensial memang tinggal di alat
 * baris perintah. `.env` sudah masuk `.gitignore`.
 *
 * ============================================================================
 * KENAPA TIDAK ADA DAFTAR MODEL
 * ============================================================================
 * Versi sebelumnya memuat daftar model yang boleh dipilih, dan itu keliru
 * untuk alat yang jalan di mesin sendiri: menambah satu model berarti mengedit
 * kode, mengetik ulang, dan menunggu Next me-reload. NVIDIA NIM sendiri
 * menawarkan ratusan model, dan Ollama menawarkan apa pun yang sudah Anda
 * tarik.
 *
 * Karena itu `WEBLYZER_AI_MODEL` diterima apa adanya. Model yang salah tulis
 * ditolak penyedianya dengan pesannya sendiri ("model not found"), dan pesan
 * itu jauh lebih berguna daripada "model tidak dikenal" dari daftar yang
 * ketinggalan zaman. Yang divalidasi di sini hanya hal yang tidak bisa
 * dijawab siapa pun selain berkas ini: jalur mana, dan kuncinya ada atau
 * tidak.
 */

/**
 * Jalur pemanggilan. Bukan "penyedia" — yang penting bukan siapa yang
 * menjualnya, tapi bentuk protokolnya.
 *
 * - `anthropic` — Messages API, lewat `@anthropic-ai/sdk`.
 * - `openai`    — `POST /chat/completions`, protokol yang dipakai NVIDIA NIM,
 *                 Groq, OpenRouter, Together, vLLM, dan Ollama. Satu jalur ini
 *                 mencakup semuanya, karena mereka memang bicara protokol yang
 *                 sama.
 * - `agy`       — CLI `agy` di mesin ini, dengan login sendiri seperti
 *                 `claude`. Tidak ada API key.
 */
export type Jalur = 'anthropic' | 'openai' | 'agy'

/**
 * Base URL yang sudah diketahui, supaya `.env` tidak perlu memuat URL yang
 * harus dicari dulu.
 *
 * Ini data, bukan abstraksi: menambah satu baris di sini menyetarakan satu
 * penyedia baru dengan yang lain, dan tidak menambah percabangan di mana pun.
 * Penyedia yang tidak terdaftar tetap bisa dipakai — isi
 * `WEBLYZER_AI_BASE_URL` sendiri.
 */
export const BASE_URL: Record<string, string> = {
  nim: 'https://integrate.api.nvidia.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  ollama: 'http://localhost:11434/v1',
  vllm: 'http://localhost:8000/v1',
  openai: 'https://api.openai.com/v1',
}

export type Konfigurasi =
  | { jalur: 'anthropic'; model: string; apiKey: string }
  | { jalur: 'openai'; model: string; apiKey: string; baseUrl: string; nama: string }
  | { jalur: 'agy'; model: string }

/**
 * Kenapa AI belum siap, dalam kalimat yang menyebut variabel yang harus diisi.
 *
 * Bukan boolean. "AI tidak aktif" adalah pesan yang membuat orang menebak, dan
 * yang ditebak-tebak di sini ada empat: jalurnya, modelnya, kuncinya, dan base
 * URL-nya.
 */
export type Belum = { siap: false; sebab: string }
export type Hasil = { siap: true; konfigurasi: Konfigurasi } | Belum

/** Yang jalur `openai` butuh, dan dari mana ia diambil. */
function bacaOpenai(env: Record<string, string | undefined>, nama: string): Hasil {
  // `WEBLYZER_AI_BASE_URL` menang atas preset. Itu yang membuat NIM
  // self-hosted (`localhost:8000/v1`) bisa memakai nama `nim` yang sama
  // dengan yang hosted tanpa preset baru.
  const baseUrl = env.WEBLYZER_AI_BASE_URL?.trim() || BASE_URL[nama]
  if (!baseUrl) {
    return {
      siap: false,
      sebab:
        `WEBLYZER_AI=${nama} tidak dikenal, jadi base URL-nya harus disebut sendiri. ` +
        `Isi WEBLYZER_AI_BASE_URL, atau pakai salah satu nama yang sudah ada: ` +
        `${Object.keys(BASE_URL).join(', ')}.`,
    }
  }

  const model = env.WEBLYZER_AI_MODEL?.trim()
  if (!model) {
    return { siap: false, sebab: `WEBLYZER_AI_MODEL belum diisi. Contoh untuk ${nama}: lihat daftar model di penyedianya.` }
  }

  // Ollama dan vLLM lokal tidak butuh kunci, dan memaksanya berarti menyuruh
  // orang mengarang nilai untuk variabel yang tidak dibaca siapa pun.
  const apiKey = env.WEBLYZER_AI_API_KEY?.trim() ?? ''
  const lokal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(baseUrl)
  if (apiKey === '' && !lokal) {
    return { siap: false, sebab: `WEBLYZER_AI_API_KEY belum diisi untuk ${nama}.` }
  }

  return { siap: true, konfigurasi: { jalur: 'openai', model, apiKey, baseUrl, nama } }
}

/**
 * Konfigurasi yang sedang berlaku.
 *
 * `env` sebagai parameter, bukan `process.env` yang dibaca langsung: itu yang
 * membuat seluruh berkas ini bisa diuji tanpa mengotori lingkungan proses yang
 * sedang menjalankan test — dan tanpa test yang saling menimpa variabel satu
 * sama lain.
 */
export function konfigurasiAi(env: Record<string, string | undefined> = process.env): Hasil {
  const pilihan = env.WEBLYZER_AI?.trim().toLowerCase()

  if (!pilihan) {
    return {
      siap: false,
      sebab:
        'WEBLYZER_AI belum diisi, jadi ringkasan AI mati. Pemindaian sendiri tetap ' +
        'jalan tanpa AI. Isi salah satu: anthropic, agy, nim, groq, ollama, atau nama ' +
        'lain yang bicara protokol OpenAI.',
    }
  }

  if (pilihan === 'anthropic') {
    const model = env.WEBLYZER_AI_MODEL?.trim()
    if (!model) {
      return { siap: false, sebab: 'WEBLYZER_AI_MODEL belum diisi. Contoh: claude-opus-5.' }
    }
    // `ANTHROPIC_API_KEY` ikut dibaca karena itu nama yang sudah dipakai SDK
    // Anthropic dan CLI-nya. Kalau sudah ada di mesin, tidak perlu ditulis dua
    // kali dengan nama berbeda.
    const apiKey = (env.WEBLYZER_AI_API_KEY || env.ANTHROPIC_API_KEY)?.trim()
    if (!apiKey) {
      return {
        siap: false,
        sebab: 'WEBLYZER_AI_API_KEY (atau ANTHROPIC_API_KEY) belum diisi.',
      }
    }
    return { siap: true, konfigurasi: { jalur: 'anthropic', model, apiKey } }
  }

  if (pilihan === 'agy' || pilihan === 'agy-cli') {
    const model = env.WEBLYZER_AI_MODEL?.trim()
    if (!model) {
      return {
        siap: false,
        sebab: 'WEBLYZER_AI_MODEL belum diisi. Jalankan `agy models` untuk daftarnya.',
      }
    }
    return { siap: true, konfigurasi: { jalur: 'agy', model } }
  }

  return bacaOpenai(env, pilihan)
}

/** Jalur mana yang dipakai nama itu — untuk halaman status. */
export function jalurDari(nama: string): Jalur {
  const n = nama.trim().toLowerCase()
  if (n === 'anthropic') return 'anthropic'
  if (n === 'agy' || n === 'agy-cli') return 'agy'
  return 'openai'
}
