import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '../../../../lib/ui/db.ts'
import {
  temuanKategori,
  keadaanKategori,
  situs,
  runAktif,
  waktuScanKategori,
} from '../../../../lib/ui/queries.ts'
import type { BarisTemuan } from '../../../../lib/ui/queries.ts'
import { TabelTemuan } from '../../../../components/TabelTemuan.tsx'
import { KeadaanKosong } from '../../../../components/KeadaanKosong.tsx'
import { TombolScan } from '../../../../components/TombolScan.tsx'
import { sumberKategori } from '../../../../lib/kategori.ts'

export const dynamic = 'force-dynamic'

const KATEGORI = ['bugs', 'console', 'security', 'seo', 'geo', 'audit']

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

  const terbuka = temuanKategori(db(), id, kategori, 'open')
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
        <span>Terbuka</span>
        <span className="saring-hitung">{terbuka.length}</span>
      </Link>
      <Link
        href={`${path}?status=ignored`}
        className="saring-item"
        aria-current={status === 'ignored' ? 'true' : undefined}
      >
        <span>Diabaikan</span>
        <span className="saring-hitung">{diabaikan.length}</span>
      </Link>
    </nav>
  )

  const s = situs(db(), id)
  const baseUrl = s?.base_url ?? ''

  /**
   * Keterangan sumber, hanya untuk kategori yang dinilai claude-seo.
   */
  const keterangan = sumberKategori(kategori) === 'claude-seo' && (
    <div className="catatan-sumber" role="note">
      <span style={{ color: 'var(--sev-high)', marginTop: '2px', flexShrink: 0 }}>
        [!]
      </span>
      <span>
        Dinilai claude-seo, bukan diukur aturan. Jawabannya bisa bergeser antar
        analisis walau situsnya tidak berubah, jadi &quot;sudah diperbaiki&quot; di sini
        lebih tepat dibaca sebagai checklist Anda sendiri.
      </span>
    </div>
  )

  const berjalan = runAktif(db(), id) ?? null
  const waktuScan = waktuScanKategori(db(), id, kategori)
  const tombol = (
    <TombolScan
      siteId={id}
      kategori={kategori as 'bugs' | 'console' | 'security' | 'seo' | 'geo' | 'audit'}
      path={path}
      berjalan={berjalan}
    />
  )

  if (status === 'ignored') {
    return (
      <>
        {tombol}
        {keterangan}
        {saringan}
        {diabaikan.length === 0 ? (
          // Sengaja bukan KeadaanKosong: teks di sana bicara soal keadaan
          // pemindaian, sementara pertanyaan di sini murni soal saringan.
          <p className="saring-kosong">Belum ada temuan yang diabaikan di kategori ini.</p>
        ) : (
          <TabelTemuan
            baris={diabaikan}
            baseUrl={baseUrl}
            status="ignored"
            path={path}
            waktuScan={waktuScan}
          />
        )}
      </>
    )
  }

  const keadaan = keadaanKategori(db(), id, kategori)
  if (keadaan !== 'ada-temuan') {
    return (
      <>
        {tombol}
        {keterangan}
        {saringan}
        <KeadaanKosong keadaan={keadaan} />
      </>
    )
  }

  return (
    <>
      {tombol}
      {keterangan}
      {saringan}
      <TabelTemuan
        baris={temuanKategori(db(), id, kategori)}
        baseUrl={baseUrl}
        status="open"
        path={path}
        waktuScan={waktuScan}
      />
    </>
  )
}
