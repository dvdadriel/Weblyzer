import type { NextConfig } from 'next'

const config: NextConfig = {
  // Next 16 menuliskan CLAUDE.md dan AGENTS.md ke root proyek setiap kali
  // `next dev` mulai. Keduanya wilayah konfigurasi pengguna, bukan keluaran
  // build, dan menulis ulang berkas milik orang lain tanpa diminta tidak sopan.
  agentRules: false,
}

export default config
