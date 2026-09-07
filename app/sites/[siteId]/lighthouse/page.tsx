import { db } from '../../../../lib/ui/db.ts'
import { skorSitus, keadaanKategori, situs, runAktif } from '../../../../lib/ui/queries.ts'
import { GridSkor } from '../../../../components/GridSkor.tsx'
import { TombolScan } from '../../../../components/TombolScan.tsx'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

/**
 * Lighthouse punya satu keadaan kosong yang tidak dimiliki tab lain: situs yang
 * sudah dipindai — jadi halamannya sudah diketahui — tetapi belum pernah
 * diukur. `KeadaanKosong` bicara soal keadaan pemindaian dan menyebut perintah
 * `scan`; di sini perintah yang memperbaiki keadaan itu adalah `lighthouse`.
 * Menumpang di sana berarti menyuruh menjalankan perintah yang salah, jadi
 * teksnya ditulis di tempat.
 */
function Kosong({ judul, teks }: { judul: string; teks: string }) {
  return (
    <div className="kosong">
      <h2 className="kosong-judul">{judul}</h2>
      <p className="kosong-teks">{teks}</p>
    </div>
  )
}

export default async function Lighthouse({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params
  const id = Number(siteId)

  const keadaan = keadaanKategori(db(), id, 'lighthouse')

  // Satu-satunya keadaan tanpa tombol ukur. Lighthouse mengukur halaman yang
  // sudah tersimpan, jadi kalau crawl belum pernah jalan tidak ada yang bisa
  // diukur — tombol di sini akan menjalankan pekerjaan yang pasti kosong.
  // Yang memperbaiki keadaan ini adalah crawl, dan itu ada di tab lain.
  if (keadaan === 'belum-dipindai') {
    return (
      <>
        <Kosong
          judul="Belum pernah dipindai"
          teks="Halamannya pun belum diketahui. Lighthouse mengukur halaman yang sudah tersimpan, jadi pemindaian harus jalan lebih dulu."
        />
        <p className="kosong-teks" style={{ textAlign: 'center' }}>
          <Link href={`/sites/${id}/bugs`}>Buka tab bugs untuk memindai</Link>
        </p>
      </>
    )
  }

  const tombol = (
    <TombolScan
      siteId={id}
      kategori="lighthouse"
      path={`/sites/${id}/lighthouse`}
      berjalan={runAktif(db(), id) ?? null}
    />
  )

  const skor = skorSitus(db(), id)
  if (skor.length > 0) {
    const s = situs(db(), id)
    return (
      <>
        {tombol}
        <GridSkor baris={skor} baseUrl={s?.base_url ?? ''} />
      </>
    )
  }

  if (keadaan === 'gagal') {
    return (
      <>
        {tombol}
        <Kosong
          judul="Pemindaian terakhir gagal"
          teks="Skornya tidak diketahui — ini bukan berarti halamannya cepat. Ukur lagi."
        />
      </>
    )
  }

  return (
    <>
      {tombol}
      <Kosong
        judul="Belum ada pengukuran Lighthouse"
        teks="Halamannya sudah diketahui, tapi belum satu pun diukur."
      />
    </>
  )
}
