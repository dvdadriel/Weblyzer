'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Ikon } from './Ikon.tsx'
import type { NamaIkon } from './Ikon.tsx'
import { Logo } from './Logo.tsx'

/**
 * `/model` diletakkan sesudah Home karena itu urutan pemakaiannya: daftar
 * situs dibuka tiap hari, konfigurasi model sekali lalu ditinggalkan.
 */
const NAV: { href: string; label: string; ikon: NamaIkon }[] = [
  { href: '/', label: 'Home', ikon: 'home' },
  { href: '/model', label: 'Model', ikon: 'model' },
]

/**
 * Navbar global: logo di kiri, tab dan identitas di kanan.
 *
 * Wordmark teks berdampingan dengan logo, dan `aria-hidden="true"` pada logo
 * sengaja dipasang — logonya duduk di dalam tautan yang teksnya sudah berbunyi
 * "weblyzer", jadi tidak membuat screen reader mengumumkan nama itu dua kali.
 *
 * Tab Home inilah jalan kembali ke index dari halaman situs, dan karena
 * navbarnya ada di setiap halaman, jalan itu tidak pernah hilang.
 */
export function Navbar({ email }: { email: string | null }) {
  const path = usePathname()

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-merek">
          <Logo ukuran={26} />
          <span className="wordmark-teks">weblyzer</span>
          <span className="navbar-badge">audit</span>
        </Link>

        <nav className="navbar-nav" aria-label="Bagian utama">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="navbar-item"
              /* `aria-current` hanya untuk halaman yang benar-benar dibuka.
                 Home dicocokkan tepat, bukan dengan `startsWith`: kalau tidak,
                 setiap halaman aktif karena semuanya diawali "/". */
              aria-current={path === n.href ? 'page' : undefined}
            >
              <Ikon nama={n.ikon} ukuran={15} />
              {n.label}
            </Link>
          ))}

          {email === null ? (
            <Link
              href="/masuk"
              className="navbar-item"
              aria-current={path === '/masuk' ? 'page' : undefined}
            >
              <Ikon nama="perisai" ukuran={15} />
              Masuk
            </Link>
          ) : (
            <>
              <Link
                href="/akun"
                className="navbar-item"
                aria-current={path === '/akun' ? 'page' : undefined}
                /* Emailnya yang jadi label, bukan kata "Akun": di instance
                   yang dipakai beberapa orang, pertanyaan yang muncul lebih
                   dulu adalah "saya masuk sebagai siapa". */
                title={email}
              >
                <Ikon nama="model" ukuran={15} />
                {email}
              </Link>

              {/* Form POST, bukan tautan. Tautan keluar yang bisa dipicu GET
                  akan dijalankan prefetcher browser, dan orang yang cuma
                  mengarahkan kursor ke menu mendadak keluar dari akunnya. */}
              <form action="/keluar" method="post">
                <button type="submit" className="navbar-item">
                  Keluar
                </button>
              </form>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
