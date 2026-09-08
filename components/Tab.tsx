'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
  // GEO dan Audit datang dari claude-seo, bukan dari aturan. Diletakkan
  // BERSEBELAHAN dan setelah SEO, bukan diselipkan di antara yang
  // deterministik: keduanya punya sifat berbeda (§lib/kategori.ts), dan
  // mengelompokkannya membuat batas itu terlihat tanpa perlu label tambahan.
  ['geo', 'GEO'],
  ['audit', 'Audit'],
  ['lighthouse', 'Lighthouse'],
] as const

export function Tab({ siteId }: { siteId: number }) {
  const path = usePathname()
  return (
    <nav className="tab" aria-label="Kategori">
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
          </Link>
        )
      })}
    </nav>
  )
}
