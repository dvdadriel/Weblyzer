import type { Metadata } from 'next'
import { IBM_Plex_Mono, Space_Mono } from 'next/font/google'
import './globals.css'
import { Navbar } from '../components/Navbar.tsx'

const ui = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ui',
  display: 'swap',
})

// Hanya untuk wordmark. Kalau muncul di label tabel atau tombol, itu bug —
// lihat "Cara mengetahui ini gagal" di DESIGN.md.
const mark = Space_Mono({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-mark',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Weblyzer',
  description: 'Apa yang rusak di situs saya, dan apa yang sudah beres.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${ui.variable} ${mark.variable}`}>
      {/* Navbar di layout, bukan di tiap halaman: itu yang membuat jalan
          kembali ke index tidak pernah hilang di halaman mana pun. */}
      <body>
        <Navbar />
        <main className="wrap">{children}</main>
      </body>
    </html>
  )
}
