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
 * Navbar global: logo di kiri, dua tab di kanan.
 *
 * Wordmark teks berdampingan dengan logo, dan `aria-hidden="true"` pada logo
 * sengaja dipasang — logonya duduk di dalam tautan yang teksnya sudah berbunyi "weblyzer",
 * jadi tidak membuat screen reader mengumumkan nama itu dua kali.
 *
 * Tab Home inilah jalan kembali ke index dari halaman situs, dan karena
 * navbarnya ada di setiap halaman, jalan itu tidak pernah hilang.
 */
export function Navbar() {
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
        </nav>
      </div>
    </header>
  )
}
