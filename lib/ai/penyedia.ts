/**
 * Penyedia AI dan model yang bisa dipilih.
 *
 * ============================================================================
 * DUA JALUR, ATURAN BERBEDA
 * ============================================================================
 * `anthropic` — API key milik pemakai, disimpan terenkripsi, tagihan orangnya
 *   sendiri. Boleh dipakai siapa pun yang punya akun.
 *
 * `agy-cli` — CLI `agy` di mesin server, kredensialnya milik mesin, tagihan
 *   pemilik instance. HANYA ADMIN, dan itu bukan preferensi melainkan batas
 *   keamanan: `agy` punya tool Bash (bahkan
 *   `--dangerously-skip-permissions`), jadi membiarkan orang tak dikenal
 *   memicunya berarti memberi mereka sesi shell di server Anda. Polanya sama
 *   dengan aspek GEO dan Audit — lihat `bolehCliHost` di
 *   `lib/auth/pemilik.ts`.
 *
 * Jalur kedua tidak membatalkan yang pertama. Alasan migrasi 002 memindahkan
 * AI dari CLI ke API key masih berlaku: kredensial mesin tidak bisa dibagi ke
 * banyak orang tanpa satu orang menanggung tagihan semuanya. Yang berubah cuma
 * bahwa pemilik instance boleh memakai langganannya sendiri.
 *
 * `agy-cli` juga TIDAK jalan di container, alasan yang sama dengan GEO dan
 * Audit: ia sama seperti `claude` — punya login sendiri, bukan API key. Di
 * macOS kredensialnya ada di `~/Library/Application Support/Antigravity`,
 * dipasang lewat login desktop yang butuh browser. Container tidak punya
 * keduanya, dan tidak ada variabel lingkungan yang bisa menggantikannya.
 */
export const PENYEDIA = [
  {
    id: 'anthropic',
    nama: 'Anthropic API',
    /** Butuh API key dari pemakainya. */
    pakaiKunci: true,
    /** Boleh dipakai user biasa. */
    adminSaja: false,
  },
  {
    id: 'agy-cli',
    nama: 'agy CLI (server)',
    pakaiKunci: false,
    adminSaja: true,
  },
] as const

export type IdPenyedia = (typeof PENYEDIA)[number]['id']

/**
 * Model per penyedia.
 *
 * Daftar `agy-cli` sengaja pendek, bukan seluruh keluaran `agy models` yang
 * memuat empat belas model. Menawarkan semuanya berarti empat belas baris di
 * halaman konfigurasi untuk pekerjaan yang cuma meringkas temuan, dan
 * perbedaan antara `gemini-3.6-flash-low` dan `gemini-3.7-flash-low` tidak
 * akan pernah terasa di sana. Jalankan `agy models` kalau daftarnya perlu
 * diperbarui.
 */
export const MODEL = [
  // ── Anthropic API ────────────────────────────────────────────────────────
  {
    penyedia: 'anthropic',
    id: 'claude-opus-5',
    nama: 'Claude Opus 5',
    catatan: 'Paling mampu. Bawaan.',
  },
  {
    penyedia: 'anthropic',
    id: 'claude-sonnet-5',
    nama: 'Claude Sonnet 5',
    catatan: 'Lebih murah, cukup untuk meringkas temuan.',
  },
  {
    penyedia: 'anthropic',
    id: 'claude-haiku-4-5',
    nama: 'Claude Haiku 4.5',
    catatan: 'Paling murah dan cepat.',
  },

  // ── agy CLI ──────────────────────────────────────────────────────────────
  {
    penyedia: 'agy-cli',
    id: 'gemini-3.1-pro-high',
    nama: 'Gemini 3.1 Pro',
    catatan: 'Paling mampu di jalur agy.',
  },
  {
    penyedia: 'agy-cli',
    id: 'gemini-3.8-flash-medium',
    nama: 'Gemini 3.8 Flash',
    catatan: 'Cepat, cukup untuk ringkasan.',
  },
  {
    penyedia: 'agy-cli',
    id: 'claude-opus-4-6-thinking',
    nama: 'Claude Opus 4.6',
    catatan: 'Lewat langganan agy, bukan API key.',
  },
] as const

export type IdModel = (typeof MODEL)[number]['id']

export const MODEL_BAWAAN: IdModel = 'claude-opus-5'

export function modelDikenal(id: string): id is IdModel {
  return MODEL.some((m) => m.id === id)
}

export function penyediaDikenal(id: string): id is IdPenyedia {
  return PENYEDIA.some((p) => p.id === id)
}

/** Penyedia yang memiliki model ini. Melempar untuk model tak dikenal. */
export function penyediaDariModel(id: string): IdPenyedia {
  const m = MODEL.find((x) => x.id === id)
  if (!m) throw new Error(`Model tidak dikenal: ${id}`)
  return m.penyedia
}

export function pakaiKunci(penyedia: IdPenyedia): boolean {
  return PENYEDIA.find((p) => p.id === penyedia)!.pakaiKunci
}

export function adminSaja(penyedia: IdPenyedia): boolean {
  return PENYEDIA.find((p) => p.id === penyedia)!.adminSaja
}

export function modelUntuk(penyedia: IdPenyedia): readonly (typeof MODEL)[number][] {
  return MODEL.filter((m) => m.penyedia === penyedia)
}
