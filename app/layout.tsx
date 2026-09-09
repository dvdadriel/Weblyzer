import type { Metadata } from 'next'
import { Instrument_Sans, Spline_Sans_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import { Navbar } from '../components/Navbar.tsx'
import { konteks } from '../lib/auth/konteks.ts'
import { atributTema, temaSah, NAMA_COOKIE_TEMA } from '../lib/tema.ts'

const ui = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ui',
  display: 'swap',
})

/**
 * Semua angka, dan hanya angka.
 *
 * Bukan gaya: `font-variant-numeric: tabular-nums` pada keluarga inilah yang
 * membuat kolom skor tidak bergeser saat berpindah tab. Pergeseran itu mahal
 * untuk alat yang memang dipakai dengan berpindah-pindah tab, dan keluhannya
 * sulit ditelusuri ke sebabnya.
 *
 * Geist Mono ditolak dengan sengaja: ia font bawaan Vercel dan sudah muncul di
 * hampir setiap antarmuka hasil generate, yang justru hal yang redesign ini
 * ingin dihindari.
 */
const num = Spline_Sans_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-num',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Weblyzer',
  description: 'Apa yang rusak di situs saya, dan apa yang sudah beres.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ctx = await konteks()

  // Tema diterapkan DI SERVER, sebelum render, dan itu bukan optimasi.
  // Kalau diterapkan lewat `useEffect` di klien, setiap muat halaman berkedip
  // dari terang ke gelap — dan kedipan itu paling terlihat justru pada pemakai
  // yang memilih gelap, yaitu orang yang paling peduli dengan pilihannya.
  //
  // Sumbernya `users.theme` untuk yang masuk, cookie untuk guest: guest tidak
  // punya baris di tabel mana pun, jadi cookie adalah satu-satunya tempat
  // pilihannya bisa hidup.
  const tema =
    ctx.jenis === 'user'
      ? temaSah(ctx.user.theme)
      : temaSah((await cookies()).get(NAMA_COOKIE_TEMA)?.value)

  return (
    <html
      lang="id"
      className={`${ui.variable} ${num.variable}`}
      // `undefined` untuk pilihan `system`, dan itu disengaja: server tidak
      // bisa mengetahui `prefers-color-scheme` milik browser, jadi keputusannya
      // diserahkan ke CSS lewat media query. Memaksa nilai di sini berarti
      // menebak, dan tebakan yang salah menampilkan tema yang tidak diminta.
      data-theme={atributTema(tema)}
    >
      {/* Navbar di layout, bukan di tiap halaman: itu yang membuat jalan
          kembali ke index tidak pernah hilang di halaman mana pun. */}
      <body>
        <Navbar email={ctx.jenis === 'user' ? ctx.user.email : null} tema={tema} />
        <main className="wrap">{children}</main>
      </body>
    </html>
  )
}
