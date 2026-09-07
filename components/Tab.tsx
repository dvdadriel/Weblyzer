'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TAB = ['bugs', 'console', 'security', 'lighthouse'] as const

export function Tab({ siteId }: { siteId: number }) {
  const path = usePathname()
  return (
    <nav className="tab" aria-label="Kategori">
      {TAB.map((t) => {
        const href = `/sites/${siteId}/${t}`
        const aktif = path === href
        return (
          <Link
            key={t}
            href={href}
            className="tab-item"
            aria-current={aktif ? 'page' : undefined}
          >
            {t}
          </Link>
        )
      })}
    </nav>
  )
}
