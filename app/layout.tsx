import type { Metadata } from 'next'
import { Instrument_Sans, Spline_Sans_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import { Navbar } from '../components/Navbar.tsx'
import { konteks } from '../lib/auth/konteks.ts'
import { atributTema, temaSah, NAMA_COOKIE_TEMA } from '../lib/tema.ts'
import { localeSah, NAMA_COOKIE_LOCALE } from '../lib/i18n/index.ts'
import { tServer } from '../lib/i18n/server.ts'

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

/**
 * `generateMetadata`, bukan `metadata` statis.
 *
 * Deskripsi halaman ikut bahasa pemakai, dan `metadata` statis dievaluasi satu
 * kali saat build sehingga tidak bisa melihat locale request. Judulnya tetap
 * "Weblyzer" di kedua bahasa: itu nama produk, bukan kalimat.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer()
  return { title: 'Weblyzer', description: t('meta.deskripsi') }
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
  const jar = await cookies()
  const tema =
    ctx.jenis === 'user'
      ? temaSah(ctx.user.theme)
      : temaSah(jar.get(NAMA_COOKIE_TEMA)?.value)

  // Locale dari sumber yang sama dengan tema, dan alasannya sama: `users.locale`
  // untuk yang masuk, cookie untuk guest. `<html lang>` ikut berubah, bukan
  // dibiarkan "id" — screen reader memilih pelafalan dari atribut itu, dan
  // halaman berbahasa Inggris yang mengaku Indonesia dibacakan salah.
  const locale =
    ctx.jenis === 'user'
      ? localeSah(ctx.user.locale)
      : localeSah(jar.get(NAMA_COOKIE_LOCALE)?.value)

  return (
    <html
      lang={locale}
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
        <Navbar
          email={ctx.jenis === 'user' ? ctx.user.email : null}
          tema={tema}
          locale={locale}
        />
        <main className="wrap">{children}</main>
      </body>
    </html>
  )
}
