import Link from 'next/link'
import { db } from '../lib/ui/db.ts'
import { ringkasanSitus } from '../lib/ui/queries.ts'
import { TambahSitus } from '../components/TambahSitus.tsx'
import { HapusSitus } from '../components/HapusSitus.tsx'

export const dynamic = 'force-dynamic'

const URUT = ['critical', 'high', 'medium', 'low'] as const

export default function Dashboard() {
  const situs = ringkasanSitus(db())

  return (
    <>
      <h1 className="halaman-judul">Situs</h1>

      {situs.length === 0 ? (
        <div className="kosong">
          <h2 className="kosong-judul">Belum ada situs.</h2>
          <p className="kosong-teks">Tambahkan situs pertama untuk mulai memindai.</p>
        </div>
      ) : (
        <ul className="kartu-daftar">
          {situs.map((s) => (
            /* Tombol hapus berada DI LUAR tautan: `<button>` di dalam `<a>`
               adalah HTML tak sah, dan browser menanganinya berbeda-beda —
               sebagian mengaktifkan tautannya juga, jadi menekan Hapus bisa
               ikut berpindah halaman. Kartunya jadi pembungkus posisi, dan
               tautannya mengisi seluruh area kecuali sudut tombol. */
            <li key={s.id} className="kartu-bungkus">
              <Link href={`/sites/${s.id}/bugs`} className="kartu">
                <span className="kartu-judul">
                  <span className="kartu-nama">{s.nama}</span>
                  <span className="kartu-url">{s.base_url}</span>
                </span>

                {s.keadaan === 'belum-dipindai' && (
                  <span className="kartu-status">Belum pernah dipindai</span>
                )}
                {/* Pemicu paling berarti tepat di sini. Pemindaian yang gagal
                    saat ditekan biasanya sudah dilihat orangnya sendiri; yang
                    gagal terjadwal tidak ada yang menyaksikan, dan itu satu-
                    satunya kabar bahwa situsnya berubah tanpa disentuh. */}
                {s.keadaan === 'gagal' && (
                  <span className="kartu-status gagal">
                    {s.pesanGagal}
                    {s.terjadwal && ' (pemindaian terjadwal)'}
                  </span>
                )}
                {s.keadaan === 'bersih' && (
                  <span className="kartu-status bersih">
                    Tidak ada yang rusak &middot; {s.terakhirDipindai}
                    {s.terjadwal && ' · terjadwal'}
                  </span>
                )}

                {/* Lencana AI gagal, TERPISAH dari keadaan pemindaian.
                    Pemindaiannya sendiri berhasil dan temuannya sah; yang
                    gagal cuma ringkasannya. Menyatukannya dengan `gagal`
                    akan membuat kartu situs sehat tampak rusak, dan pemakainya
                    berhenti mempercayai angka yang sebenarnya benar. */}
                {s.aiGagal && (
                  <span className="kartu-ai">
                    <span aria-hidden="true">[!]</span> Ringkasan AI gagal
                  </span>
                )}
                {s.keadaan === 'ada-temuan' && (
                  <span className="kartu-hitungan">
                    {URUT.filter((k) => s.terbuka[k] > 0).map((k) => (
                      <span key={k} style={{ color: `var(--sev-${k})` }}>
                        {s.terbuka[k]} {k}
                      </span>
                    ))}
                    {/* Stempel waktu ikut di sini, bukan cuma di kartu bersih:
                        delapan critical dari semalam berbeda artinya dengan
                        delapan critical dari tiga minggu lalu. */}
                    <span className="kartu-waktu">
                      dipindai {s.terakhirDipindai}
                      {s.terjadwal && ' · terjadwal'}
                    </span>
                  </span>
                )}
              </Link>

              <HapusSitus siteId={s.id} nama={s.nama} jumlahTemuan={s.totalTerbuka} />
            </li>
          ))}
        </ul>
      )}

      <TambahSitus />
    </>
  )
}
