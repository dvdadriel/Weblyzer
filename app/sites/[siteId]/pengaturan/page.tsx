import { notFound } from 'next/navigation'
import { getDb } from '../../../../lib/db.ts'
import { getSite } from '../../../../lib/repos/sites.ts'
import { runAktif } from '../../../../lib/ui/queries.ts'
import { PengaturanSitus } from '../../../../components/PengaturanSitus.tsx'

export const dynamic = 'force-dynamic'

/**
 * Halaman pengaturan satu situs.
 *
 * Segmen statis `pengaturan` menang atas `[kategori]` yang dinamis di Next.js,
 * jadi rute ini tidak perlu didaftarkan di daftar kategori — dan sebaliknya,
 * `pengaturan` tidak akan pernah dicoba dirender sebagai tab temuan.
 *
 * Membaca lewat `getSite`, bukan `situs()` di `lib/ui/queries.ts`: yang ini
 * butuh empat kolom yang tidak dibawa query UI itu (`max_pages`, `sitemap_url`,
 * `enabled`), dan melebarkan query yang dipakai lima halaman lain hanya untuk
 * satu halaman ini membuat semuanya membayar.
 */
export default async function Pengaturan({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params
  const id = Number(siteId)
  if (!Number.isInteger(id)) notFound()

  const s = getSite(getDb(), id)
  if (!s) notFound()

  return (
    <PengaturanSitus
      siteId={s.id}
      awal={{
        max_pages: s.max_pages,
        lighthouse_mode: s.lighthouse_mode,
        sitemap_url: s.sitemap_url,
        enabled: s.enabled,
      }}
      // Dibaca di server, bukan ditebak di klien: form yang mengunci dirinya
      // sendiri berdasarkan tebakan akan salah tepat ketika pemindaian dimulai
      // dari tab lain.
      sedangDipindai={runAktif(getDb(), id) !== undefined}
    />
  )
}
