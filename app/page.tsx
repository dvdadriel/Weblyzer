import Link from 'next/link'
import { db } from '../lib/ui/db.ts'
import { ringkasanSitus } from '../lib/ui/queries.ts'
import { TambahSitus } from '../components/TambahSitus.tsx'
import { HapusSitus } from '../components/HapusSitus.tsx'

import { Ikon } from '../components/Ikon.tsx'

export const dynamic = 'force-dynamic'

const URUT = ['critical', 'high', 'medium', 'low'] as const

const PENANDA: Record<(typeof URUT)[number], string> = {
  critical: '[!!]',
  high: '[!]',
  medium: '[~]',
  low: '[.]',
}

export default function Dashboard() {
  const situs = ringkasanSitus(db())

  const totalSitus = situs.length
  const totalTemuan = situs.reduce((acc, s) => acc + s.totalTerbuka, 0)
  const situsBersih = situs.filter((s) => s.keadaan === 'bersih').length

  return (
    <>
      <header className="dashboard-header">
        <div className="dashboard-atas">
          <div className="dashboard-judul-grup">
            <h1 className="halaman-judul">Situs</h1>
          </div>
        </div>
        <p className="halaman-teks">
          Pantauan berkala kesehatan, performa, dan riwayat temuan situs Anda.
        </p>

        {totalSitus > 0 && (
          <div className="ringkasan-metrik" aria-label="Ringkasan pemantauan">
            <div className="metrik-chip">
              <span className="metrik-angka">{totalSitus}</span> Situs Terdaftar
            </div>
            <div className="metrik-chip">
              <span className="metrik-angka" style={{ color: totalTemuan > 0 ? 'var(--sev-high)' : 'var(--sev-fixed)' }}>
                {totalTemuan}
              </span> Masalah Terbuka
            </div>
            {situsBersih > 0 && (
              <div className="metrik-chip">
                <span className="metrik-angka" style={{ color: 'var(--sev-fixed)' }}>{situsBersih}</span> Situs Bersih
              </div>
            )}
          </div>
        )}
      </header>

      {situs.length === 0 ? (
        <div className="kosong">
          <div className="kosong-ikon">
            <Ikon nama="kompas" ukuran={24} />
          </div>
          <h2 className="kosong-judul">Belum ada situs.</h2>
          <p className="kosong-teks">
            Tambahkan situs pertama Anda di bawah untuk mulai memindai bug, keamanan, dan performa.
          </p>
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
                  <span className="kartu-status">
                    <Ikon nama="kompas" ukuran={13} />
                    Belum pernah dipindai
                  </span>
                )}
                {/* Pemicu paling berarti tepat di sini. Pemindaian yang gagal
                    saat ditekan biasanya sudah dilihat orangnya sendiri; yang
                    gagal terjadwal tidak ada yang menyaksikan, dan itu satu-
                    satunya kabar bahwa situsnya berubah tanpa disentuh. */}
                {s.keadaan === 'gagal' && (
                  <span className="kartu-status gagal">
                    <Ikon nama="alert" ukuran={13} />
                    {s.pesanGagal}
                    {s.terjadwal && ' (pemindaian terjadwal)'}
                  </span>
                )}
                {s.keadaan === 'bersih' && (
                  <span className="kartu-status bersih">
                    <Ikon nama="ceklis" ukuran={13} />
                    Tidak ada yang rusak &middot; {s.terakhirDipindai}
                    {s.terjadwal && ' · terjadwal'}
                  </span>
                )}

                {/* Lencana AI gagal, TERPISAH dari keadaan pemindaian. */}
                {s.aiGagal && (
                  <span className="kartu-ai">
                    <Ikon nama="alert" ukuran={12} />
                    Ringkasan AI gagal
                  </span>
                )}

                {s.keadaan === 'ada-temuan' && (
                  <span className="kartu-hitungan">
                    {URUT.filter((k) => s.terbuka[k] > 0).map((k) => (
                      <span key={k} className={`kartu-chip-hitung kartu-chip-${k}`}>
                        <span aria-hidden="true">{PENANDA[k]}</span>
                        {s.terbuka[k]} {k}
                      </span>
                    ))}
                    {/* Stempel waktu ikut di sini, bukan cuma di kartu bersih */}
                    <span className="kartu-waktu">
                      <Ikon nama="waktu" ukuran={12} />
                      dipindai {s.terakhirDipindai}
                      {s.terjadwal && ' · terjadwal'}
                    </span>
                    <span className="kartu-buka">
                      Detail <Ikon nama="panahKanan" ukuran={12} />
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
