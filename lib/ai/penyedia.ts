/**
 * Model Anthropic yang bisa dipilih pemakai.
 *
 * ============================================================================
 * ASAS YANG DIBALIK, DAN KENAPA
 * ============================================================================
 * Berkas ini dulunya mendeteksi CLI yang terpasang di mesin, dan asasnya
 * tertulis di sini: "tanpa API key — tidak ada kunci untuk disimpan, tidak ada
 * tagihan untuk diawasi, dan langganan yang sudah dibayar ikut terpakai."
 *
 * Asas itu benar untuk alat satu orang di mesinnya sendiri, dan salah begitu
 * instance-nya dipakai lebih dari satu orang. Dua sebabnya:
 *
 * 1. Kredensial CLI adalah milik mesin, bukan milik pemakai. Sepuluh orang
 *    yang memakai instance ini akan berbagi satu akun Claude, dan tidak ada
 *    yang bisa membedakan pemakaian siapa.
 * 2. Langganan pemilik instance akan menanggung tagihan semua orang yang
 *    mendaftar. Itu bukan "langganan yang sudah dibayar ikut terpakai", itu
 *    tagihan yang dipindahkan ke orang yang tidak menyetujuinya.
 *
 * Jadi sekarang setiap pemakai membawa kuncinya sendiri, terenkripsi di
 * `ai_kunci` (lihat `lib/ai/kunci.ts`), dan tagihannya sendiri.
 *
 * YANG TIDAK BERUBAH: kredensial CLI (`claude auth login`) tetap bukan milik
 * aplikasi ini dan tidak pernah disimpannya. Itu masih dipakai tab GEO dan
 * Audit, yang berjalan di mesin host dan hanya untuk admin — lihat
 * `lib/claude-seo/jalankan.ts` dan `bolehCliHost` di `lib/auth/pemilik.ts`.
 */
export const MODEL = [
  {
    id: 'claude-opus-5',
    nama: 'Claude Opus 5',
    catatan: 'Paling mampu. Bawaan.',
  },
  {
    id: 'claude-sonnet-5',
    nama: 'Claude Sonnet 5',
    catatan: 'Lebih murah, cukup untuk meringkas temuan.',
  },
  {
    id: 'claude-haiku-4-5',
    nama: 'Claude Haiku 4.5',
    catatan: 'Paling murah dan cepat.',
  },
] as const

export type IdModel = (typeof MODEL)[number]['id']

export const MODEL_BAWAAN: IdModel = 'claude-opus-5'

export function modelDikenal(id: string): id is IdModel {
  return MODEL.some((m) => m.id === id)
}
