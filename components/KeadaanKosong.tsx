import type { Keadaan } from '../lib/ui/queries.ts'
import { Ikon } from './Ikon.tsx'
import type { NamaIkon } from './Ikon.tsx'
import type { Kunci, T } from '../lib/i18n/index.ts'

/**
 * Keadaan kosong yang bukan berasal dari data, melainkan dari siapa yang
 * membuka layarnya.
 *
 * `DESIGN.md` mensyaratkan keadaan kosong membedakan "belum dipindai",
 * "bersih", dan "gagal", karena ketiganya menghasilkan nol baris tetapi
 * artinya berlawanan. Multi-user menambahkan dua sebab lagi yang juga
 * menghasilkan nol baris:
 *
 * - `butuh-akun` — fiturnya ada, pemakainya belum masuk
 * - `admin-saja` — fiturnya ada, tapi berjalan dengan CLI di mesin server
 *   sehingga hanya pemilik instance yang bisa memicunya
 *
 * Menyamakan keduanya dengan "belum dipindai" akan membuat orang menunggu
 * pemindaian yang tidak akan pernah jalan.
 */
export type KeadaanKosongJenis = Exclude<Keadaan, 'ada-temuan'> | 'butuh-akun' | 'admin-saja'

const ISI: Record<
  KeadaanKosongJenis,
  { judul: Kunci; teks: Kunci; ikon: NamaIkon; warna?: string }
> = {
  'belum-dipindai': {
    judul: 'kosong.belumDipindai',
    teks: 'kosong.belumDipindaiTeks',
    ikon: 'kompas',
  },
  bersih: {
    judul: 'kosong.bersih',
    teks: 'kosong.bersihTeks',
    ikon: 'perisai',
    warna: 'var(--sev-fixed)',
  },
  gagal: {
    judul: 'kosong.gagal',
    teks: 'kosong.gagalTeks',
    ikon: 'alert',
    warna: 'var(--sev-critical)',
  },
  'butuh-akun': {
    judul: 'kosong.butuhAkun',
    teks: 'kosong.butuhAkunTeks',
    ikon: 'sparkle',
  },
  'admin-saja': {
    judul: 'kosong.adminSaja',
    teks: 'kosong.adminSajaTeks',
    ikon: 'perisai',
  },
}

export function KeadaanKosong({
  keadaan,
  aksi,
  t,
}: {
  keadaan: Keadaan | KeadaanKosongJenis
  /** Penerjemah. Wajib: keadaan kosong adalah tempat prosa terpanjang di
   *  aplikasi ini, dan prosa yang tidak diterjemahkan paling terlihat di sini. */
  t: T
  /** Tautan atau tombol di bawah teks. Keadaan kosong yang mengajarkan
   *  antarmuka lebih berguna daripada yang cuma menyatakan ketiadaan. */
  aksi?: React.ReactNode
}) {
  if (keadaan === 'ada-temuan') return null
  const { judul, teks, ikon, warna } = ISI[keadaan]
  return (
    <div className="kosong">
      <div className="kosong-ikon" style={warna ? { color: warna } : undefined}>
        <Ikon nama={ikon} ukuran={24} />
      </div>
      <h2 className="kosong-judul">{t(judul)}</h2>
      <p className="kosong-teks">{t(teks)}</p>
      {aksi && <div style={{ marginTop: 'var(--s-4)' }}>{aksi}</div>}
    </div>
  )
}
