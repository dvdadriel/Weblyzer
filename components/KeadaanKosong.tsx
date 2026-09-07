import type { Keadaan } from '../lib/ui/queries.ts'

const ISI: Record<Exclude<Keadaan, 'ada-temuan'>, { judul: string; teks: string }> = {
  'belum-dipindai': {
    judul: 'Belum pernah dipindai',
    teks: 'Jalankan pemindaian untuk melihat keadaan situs ini.',
  },
  bersih: {
    judul: 'Tidak ada yang rusak di sini',
    teks: 'Pemindaian terakhir tidak menemukan apa pun di kategori ini.',
  },
  gagal: {
    judul: 'Pemindaian terakhir gagal',
    teks: 'Hasilnya tidak diketahui — ini bukan berarti situsnya bersih. Coba pindai lagi.',
  },
}

export function KeadaanKosong({ keadaan, siteId }: { keadaan: Keadaan; siteId: number }) {
  if (keadaan === 'ada-temuan') return null
  const { judul, teks } = ISI[keadaan]
  return (
    <div className="kosong">
      <p className="kosong-judul">{judul}</p>
      <p className="kosong-teks">{teks}</p>
      <p className="kosong-teks">
        <code>npm run scan -- scan {siteId}</code>
      </p>
    </div>
  )
}
