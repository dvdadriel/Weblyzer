'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Ikon } from './Ikon.tsx'
import type { NamaIkon } from './Ikon.tsx'
import { Logo } from './Logo.tsx'
import { PilihTema } from './PilihTema.tsx'
import type { Tema } from '../lib/tema.ts'
import { penerjemah, type Locale, type Kunci } from '../lib/i18n/index.ts'

/**
 * `/model` diletakkan sesudah Home karena itu urutan pemakaiannya: daftar
 * situs dibuka tiap hari, konfigurasi model sekali lalu ditinggalkan.
 */
const NAV = [
  { href: '/', kunci: 'nav.home', ikon: 'home' },
  { href: '/model', kunci: 'nav.model', ikon: 'model' },
] as const satisfies readonly { href: string; kunci: Kunci; ikon: NamaIkon }[]

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
export function Navbar({
  email,
  tema,
  locale,
}: {
  email: string | null
  tema: Tema
  locale: Locale
}) {
  const path = usePathname()
  // Penerjemah dibuat di sini, bukan diterima sebagai prop: `T` adalah fungsi,
  // dan fungsi tidak bisa diserialkan dari Server Component ke Client
  // Component. Yang menyeberang adalah `locale`, yang cuma string.
  const t = penerjemah(locale)

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-merek">
          <Logo ukuran={26} />
          <span className="wordmark-teks">weblyzer</span>
          <span className="navbar-badge">audit</span>
        </Link>

        <nav className="navbar-nav" aria-label={t('nav.bagianUtama')}>
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
              {t(n.kunci)}
            </Link>
          ))}

          <PilihTema tema={tema} locale={locale} t={t} />

          {email === null ? (
            <Link
              href="/masuk"
              className="navbar-item"
              aria-current={path === '/masuk' ? 'page' : undefined}
            >
              <Ikon nama="perisai" ukuran={15} />
              {t('nav.masuk')}
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
                  {t('nav.keluar')}
                </button>
              </form>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
