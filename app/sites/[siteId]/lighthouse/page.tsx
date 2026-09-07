import { db } from '../../../../lib/ui/db.ts'
import { skorSitus, keadaanKategori, situs, runAktif } from '../../../../lib/ui/queries.ts'
import { GridSkor } from '../../../../components/GridSkor.tsx'
import { TombolScan } from '../../../../components/TombolScan.tsx'
import { PilihStrategi } from '../../../../components/PilihStrategi.tsx'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const STRATEGI = [
  ['mobile', 'Mobile'],
  ['desktop', 'Desktop'],
] as const

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
  searchParams,
}: {
  params: Promise<{ siteId: string }>
  searchParams: Promise<{ strategy?: string }>
}) {
  const { siteId } = await params
  const { strategy: q } = await searchParams
  const id = Number(siteId)
  const aktif = q === 'desktop' ? 'desktop' : 'mobile'

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
          <Link href={`/sites/${id}/bugs`}>Buka tab Bug untuk memindai</Link>
        </p>
      </>
    )
  }

  const s = situs(db(), id)
  const keduanya = s?.lighthouse_strategy === 'both'
  const semua = skorSitus(db(), id)
  const baris = semua.filter((b) => b.strategy === aktif)

  return (
    <>
      <div className="bilah-aksi">
        <TombolScan
          siteId={id}
          kategori="lighthouse"
          path={`/sites/${id}/lighthouse`}
          berjalan={runAktif(db(), id) ?? null}
        />
        <PilihStrategi siteId={id} keduanya={keduanya} />
      </div>

      {/* Sub-tab sebagai tautan berparameter, sama seperti saringan status di
          tab temuan: bisa di-bookmark, tombol back berfungsi, dan skor mobile
          tidak pernah tertukar dengan desktop karena keduanya tidak pernah
          berada di satu tabel. */}
      <nav className="saring" aria-label="Strategi pengukuran">
        {STRATEGI.map(([nilai, label]) => (
          <Link
            key={nilai}
            href={
              nilai === 'mobile'
                ? `/sites/${id}/lighthouse`
                : `/sites/${id}/lighthouse?strategy=desktop`
            }
            className="saring-item"
            aria-current={aktif === nilai ? 'true' : undefined}
          >
            {label}
            {/* Jumlah pengukuran ikut di label. Tanpa itu, sub-tab kosong tidak
                bisa dibedakan dari sub-tab yang belum pernah diklik. */}
            <span className="saring-hitung">
              {semua.filter((b) => b.strategy === nilai).length}
            </span>
          </Link>
        ))}
      </nav>

      {baris.length > 0 ? (
        <GridSkor baris={baris} baseUrl={s?.base_url ?? ''} />
      ) : aktif === 'desktop' && !keduanya ? (
        // Dua sebab berbeda untuk tabel desktop yang kosong, dan dibedakan:
        // belum dinyalakan, atau sudah dinyalakan tapi belum diukur. Yang
        // pertama butuh centang, yang kedua butuh tombol ukur.
        <Kosong
          judul="Pengukuran desktop belum dinyalakan"
          teks="Centang “Ukur desktop juga” di atas, lalu jalankan Scan Lighthouse. Skor desktop kerap jauh berbeda dari mobile — pada halaman utama Springair, perf 35 di desktop melawan 63 di mobile."
        />
      ) : keadaan === 'gagal' ? (
        <Kosong
          judul="Pemindaian terakhir gagal"
          teks="Skornya tidak diketahui — ini bukan berarti halamannya cepat. Ukur lagi."
        />
      ) : (
        <Kosong
          judul={`Belum ada pengukuran ${aktif}`}
          teks={
            aktif === 'desktop'
              ? 'Desktop sudah dinyalakan tapi belum sempat terukur. Jalankan Scan Lighthouse.'
              : 'Halamannya sudah diketahui, tapi belum satu pun diukur.'
          }
        />
      )}
    </>
  )
}
