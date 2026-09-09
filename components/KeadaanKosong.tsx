import type { Keadaan } from '../lib/ui/queries.ts'
import { Ikon } from './Ikon.tsx'
import type { NamaIkon } from './Ikon.tsx'

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
  { judul: string; teks: string; ikon: NamaIkon; warna?: string }
> = {
  'belum-dipindai': {
    judul: 'Belum pernah dipindai',
    teks: 'Jalankan pemindaian untuk melihat keadaan situs ini.',
    ikon: 'kompas',
  },
  bersih: {
    judul: 'Tidak ada yang rusak di sini',
    teks: 'Pemindaian terakhir tidak menemukan apa pun di kategori ini.',
    ikon: 'perisai',
    warna: 'var(--sev-fixed)',
  },
  gagal: {
    judul: 'Pemindaian terakhir gagal',
    teks: 'Hasilnya tidak diketahui — ini bukan berarti situsnya bersih. Coba pindai lagi.',
    ikon: 'alert',
    warna: 'var(--sev-critical)',
  },
  'butuh-akun': {
    judul: 'Butuh akun',
    teks:
      'Aspek ini memakai API key milik Anda sendiri, jadi ia butuh tempat untuk ' +
      'menyimpannya. Aspek pemindaian lainnya tetap jalan tanpa akun.',
    ikon: 'sparkle',
  },
  'admin-saja': {
    judul: 'Hanya untuk pemilik instance',
    teks:
      'Aspek ini dijalankan oleh CLI Claude di mesin server, bukan oleh API key Anda, ' +
      'jadi hanya pemilik instance yang bisa memicunya. Temuan yang sudah ada tetap ' +
      'terlihat di bawah.',
    ikon: 'perisai',
  },
}

export function KeadaanKosong({
  keadaan,
  aksi,
}: {
  keadaan: Keadaan | KeadaanKosongJenis
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
      <h2 className="kosong-judul">{judul}</h2>
      <p className="kosong-teks">{teks}</p>
      {aksi && <div style={{ marginTop: 'var(--s-4)' }}>{aksi}</div>}
    </div>
  )
}
