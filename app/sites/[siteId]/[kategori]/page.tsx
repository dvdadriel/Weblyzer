import { notFound } from 'next/navigation'
import { db } from '../../../../lib/ui/db.ts'
import { temuanKategori, keadaanKategori } from '../../../../lib/ui/queries.ts'
import { TabelTemuan } from '../../../../components/TabelTemuan.tsx'
import { KeadaanKosong } from '../../../../components/KeadaanKosong.tsx'

export const dynamic = 'force-dynamic'

const KATEGORI = ['bugs', 'console', 'security', 'lighthouse']

export default async function Kategori({
  params,
}: {
  params: Promise<{ siteId: string; kategori: string }>
}) {
  const { siteId, kategori } = await params
  if (!KATEGORI.includes(kategori)) notFound()

  const id = Number(siteId)
  const keadaan = keadaanKategori(db(), id, kategori)
  if (keadaan !== 'ada-temuan') return <KeadaanKosong keadaan={keadaan} siteId={id} />

  return <TabelTemuan baris={temuanKategori(db(), id, kategori)} />
}
