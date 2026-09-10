'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { penerjemah, type Locale } from '../lib/i18n/index.ts'

/**
 * Segmen URL dipisah dari labelnya. Rutenya sudah dipakai dan bisa
 * di-bookmark (`/sites/3/bugs`), jadi yang berubah cuma yang dibaca mata.
 *
 * Tunggal, bukan jamak: tabnya berpasangan dengan tombol `Scan Bug`, dan
 * DESIGN.md mensyaratkan nama yang sama sepanjang alur.
 */
const TAB = [
  ['bugs', 'Bug'],
  ['console', 'Console'],
  ['security', 'Security'],
  ['seo', 'SEO'],
  // Mobile Parity berdiri di sisi deterministik bersama keempat di atasnya —
  // temuannya diukur, bukan dinilai model. Karena itu ia di SINI dan bukan di
  // sebelah GEO/Audit, walau lencananya BETA.
  ['mobile', 'Mobile Parity'],
  // GEO dan Audit datang dari claude-seo, bukan dari aturan. Diletakkan
  // BERSEBELAHAN dan setelah SEO, bukan diselipkan di antara yang
  // deterministik: keduanya punya sifat berbeda (§lib/kategori.ts), dan
  // mengelompokkannya membuat batas itu terlihat tanpa perlu label tambahan.
  ['geo', 'GEO'],
  ['audit', 'Audit'],
  ['lighthouse', 'Lighthouse'],
] as const

export function Tab({ siteId, locale }: { siteId: number; locale: Locale }) {
  const path = usePathname()
  const t = penerjemah(locale)
  return (
    <nav className="tab" aria-label={t('tab.kategori')}>
      {TAB.map(([t, label]) => {
        const href = `/sites/${siteId}/${t}`
        const aktif = path === href
        return (
          <Link
            key={t}
            href={href}
            className="tab-item"
            aria-current={aktif ? 'page' : undefined}
          >
            <span>{label}</span>
            {(t === 'geo' || t === 'audit') && <span className="tab-ai-tag">AI</span>}
            {/* BETA, bukan AI: temuannya diukur dan deterministik. Yang masih
                baru adalah AMBANGNYA — sebelas aturan dengan angka yang baru
                ditala pada segelintir situs, jadi banjir peringatan atau
                temuan yang terlewat masih mungkin. Label ini yang mengakui itu
                di layar, alih-alih membiarkan orang menyimpulkannya sendiri. */}
            {t === 'mobile' && <span className="tab-beta-tag">BETA</span>}
          </Link>
        )
      })}
    </nav>
  )
}
