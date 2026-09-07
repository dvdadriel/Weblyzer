import { db } from '../../../../lib/ui/db.ts'
import { skorSitus, keadaanKategori, situs } from '../../../../lib/ui/queries.ts'
import { GridSkor } from '../../../../components/GridSkor.tsx'

export const dynamic = 'force-dynamic'

/**
 * Lighthouse punya satu keadaan kosong yang tidak dimiliki tab lain: situs yang
 * sudah dipindai — jadi halamannya sudah diketahui — tetapi belum pernah
 * diukur. `KeadaanKosong` bicara soal keadaan pemindaian dan menyebut perintah
 * `scan`; di sini perintah yang memperbaiki keadaan itu adalah `lighthouse`.
 * Menumpang di sana berarti menyuruh menjalankan perintah yang salah, jadi
 * teksnya ditulis di tempat.
 */
function Kosong({ judul, teks, perintah }: { judul: string; teks: string; perintah: string }) {
  return (
    <div className="kosong">
      <p className="kosong-judul">{judul}</p>
      <p className="kosong-teks">{teks}</p>
      <p className="kosong-teks">
        <code>{perintah}</code>
      </p>
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

  const skor = skorSitus(db(), id)
  if (skor.length > 0) {
    const s = situs(db(), id)
    return <GridSkor baris={skor} baseUrl={s?.base_url ?? ''} />
  }

  const keadaan = keadaanKategori(db(), id, 'lighthouse')

  if (keadaan === 'belum-dipindai') {
    return (
      <Kosong
        judul="Belum pernah dipindai"
        teks="Halamannya pun belum diketahui. Jalankan pemindaian dulu, baru pengukuran Lighthouse."
        perintah={`npm run scan -- scan ${id}`}
      />
    )
  }

  if (keadaan === 'gagal') {
    return (
      <Kosong
        judul="Pemindaian terakhir gagal"
        teks="Skornya tidak diketahui — ini bukan berarti halamannya cepat. Ukur lagi."
        perintah={`npm run scan -- lighthouse ${id}`}
      />
    )
  }

  return (
    <Kosong
      judul="Belum ada pengukuran Lighthouse"
      teks="Halamannya sudah diketahui, tapi belum satu pun diukur."
      perintah={`npm run scan -- lighthouse ${id}`}
    />
  )
}
