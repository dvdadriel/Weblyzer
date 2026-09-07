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

export function KeadaanKosong({ keadaan }: { keadaan: Keadaan }) {
  if (keadaan === 'ada-temuan') return null
  const { judul, teks } = ISI[keadaan]
  return (
    <div className="kosong">
      {/* `--t-sub` adalah "judul bagian" di DESIGN.md, dan layar kosong adalah
          hasil paling sering — justru di sini heading sungguhan paling berguna. */}
      <h2 className="kosong-judul">{judul}</h2>
      <p className="kosong-teks">{teks}</p>
      {/* Tanpa perintah terminal maupun tombol kedua: tombol pindai sudah ada
          di atas blok ini di setiap keadaan. Mengulangnya di sini berarti dua
          cara untuk satu pekerjaan, dan pada keadaan `bersih` mengajak
          bertindak justru melemahkan jawaban yang sudah selesai. */}
    </div>
  )
}
