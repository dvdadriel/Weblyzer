import Link from 'next/link'
import { db } from '../lib/ui/db.ts'
import { ringkasanSitus } from '../lib/ui/queries.ts'
import { Wordmark } from '../components/Wordmark.tsx'

export const dynamic = 'force-dynamic'

const URUT = ['critical', 'high', 'medium', 'low'] as const

export default function Dashboard() {
  const situs = ringkasanSitus(db())

  return (
    <main className="wrap">
      <Wordmark />

      {situs.length === 0 ? (
        <div className="kosong">
          <p className="kosong-judul">Belum ada situs.</p>
          <p className="kosong-teks">
            Tambahkan lewat terminal:{' '}
            <code>npm run scan -- add-site Nama https://situs.com</code>
          </p>
        </div>
      ) : (
        <ul className="kartu-daftar">
          {situs.map((s) => (
            <li key={s.id}>
              <Link href={`/sites/${s.id}/bugs`} className="kartu">
                <span className="kartu-judul">
                  <span className="kartu-nama">{s.nama}</span>
                  <span className="kartu-url">{s.base_url}</span>
                </span>

                {s.keadaan === 'belum-dipindai' && (
                  <span className="kartu-status">Belum pernah dipindai</span>
                )}
                {s.keadaan === 'gagal' && (
                  <span className="kartu-status gagal">{s.pesanGagal}</span>
                )}
                {s.keadaan === 'bersih' && (
                  <span className="kartu-status bersih">
                    Tidak ada yang rusak &middot; {s.terakhirDipindai}
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
                    <span className="kartu-waktu">dipindai {s.terakhirDipindai}</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
