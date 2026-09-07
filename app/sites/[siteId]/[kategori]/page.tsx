import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '../../../../lib/ui/db.ts'
import { temuanKategori, keadaanKategori, situs, runAktif } from '../../../../lib/ui/queries.ts'
import type { BarisTemuan } from '../../../../lib/ui/queries.ts'
import { TabelTemuan } from '../../../../components/TabelTemuan.tsx'
import { KeadaanKosong } from '../../../../components/KeadaanKosong.tsx'
import { TombolScan } from '../../../../components/TombolScan.tsx'

export const dynamic = 'force-dynamic'

const KATEGORI = ['bugs', 'console', 'security']

/**
 * `node:sqlite` mengembalikan baris berprototipe null, dan React menolak
 * mengirimnya ke client component. Menyalinnya jadi objek biasa di batas itu
 * lebih murah daripada mengubah lapisan query yang dipakai bersama.
 */
export default async function Kategori({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string; kategori: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { siteId, kategori } = await params
  const { status: q } = await searchParams
  if (!KATEGORI.includes(kategori)) notFound()

  const id = Number(siteId)
  const status: 'open' | 'ignored' = q === 'ignored' ? 'ignored' : 'open'
  const path = `/sites/${id}/${kategori}`

  const diabaikan = temuanKategori(db(), id, kategori, 'ignored')

  // Saringan yang cuma punya satu sisi berisi adalah kebisingan: kalau belum
  // ada yang diabaikan, tidak ada yang perlu dipilih.
  const saringan = diabaikan.length > 0 && (
    <nav className="saring" aria-label="Status temuan">
      <Link
        href={path}
        className="saring-item"
        aria-current={status === 'open' ? 'true' : undefined}
      >
        Terbuka
      </Link>
      <Link
        href={`${path}?status=ignored`}
        className="saring-item"
        aria-current={status === 'ignored' ? 'true' : undefined}
      >
        Diabaikan
      </Link>
    </nav>
  )

  const s = situs(db(), id)
  const baseUrl = s?.base_url ?? ''

  const berjalan = runAktif(db(), id) ?? null
  const tombol = (
    <TombolScan
      siteId={id}
      kategori={kategori as 'bugs' | 'console' | 'security'}
      path={path}
      berjalan={berjalan}
    />
  )

  if (status === 'ignored') {
    return (
      <>
        {tombol}
        {saringan}
        {diabaikan.length === 0 ? (
          // Sengaja bukan KeadaanKosong: teks di sana bicara soal keadaan
          // pemindaian, sementara pertanyaan di sini murni soal saringan.
          <p className="saring-kosong">Belum ada temuan yang diabaikan di kategori ini.</p>
        ) : (
          <TabelTemuan baris={diabaikan} baseUrl={baseUrl} status="ignored" path={path} />
        )}
      </>
    )
  }

  const keadaan = keadaanKategori(db(), id, kategori)
  if (keadaan !== 'ada-temuan') {
    return (
      <>
        {tombol}
        {saringan}
        <KeadaanKosong keadaan={keadaan} />
      </>
    )
  }

  return (
    <>
      {tombol}
      {saringan}
      <TabelTemuan
        baris={temuanKategori(db(), id, kategori)}
        baseUrl={baseUrl}
        status="open"
        path={path}
      />
    </>
  )
}
