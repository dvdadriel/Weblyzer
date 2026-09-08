import type { Keadaan } from '../lib/ui/queries.ts'
import { Ikon } from './Ikon.tsx'
import type { NamaIkon } from './Ikon.tsx'

const ISI: Record<
  Exclude<Keadaan, 'ada-temuan'>,
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
}

export function KeadaanKosong({ keadaan }: { keadaan: Keadaan }) {
  if (keadaan === 'ada-temuan') return null
  const { judul, teks, ikon, warna } = ISI[keadaan]
  return (
    <div className="kosong">
      <div className="kosong-ikon" style={warna ? { color: warna } : undefined}>
        <Ikon nama={ikon} ukuran={24} />
      </div>
      <h2 className="kosong-judul">{judul}</h2>
      <p className="kosong-teks">{teks}</p>
    </div>
  )
}
