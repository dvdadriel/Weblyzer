import { db } from '../../lib/ui/db.ts'
import { periksaPenyedia, penyediaTerpilih } from '../../lib/ai/penyedia.ts'
import { PilihModel } from '../../components/PilihModel.tsx'

export const dynamic = 'force-dynamic'

export default async function Model() {
  // Dideteksi pada tiap kunjungan, bukan disimpan: CLI dipasang, dihapus, dan
  // diperbarui di luar aplikasi ini. Ketersediaan yang di-cache akan berbohong
  // tepat pada hari pemakai memasang Gemini lalu bertanya kenapa masih mati.
  const tersedia = await periksaPenyedia()
  const terpilih = penyediaTerpilih(db())

  return (
    <>
      <h1 className="halaman-judul">Model AI</h1>
      <p className="halaman-teks">
        Weblyzer memanggil CLI yang sudah terpasang di mesin ini, jadi tidak ada
        API key yang perlu disimpan dan langganan yang sudah dibayar ikut
        terpakai. Yang tidak terpasang tidak bisa dipilih.
      </p>

      <PilihModel tersedia={tersedia} terpilih={terpilih} />

      {/* Halaman konfigurasi yang mengaku mengendalikan sesuatu yang belum ada
          adalah kebohongan yang paling mahal untuk ditelusuri nanti. Selama
          lapisan AI belum dibangun, pilihan ini memang cuma tersimpan. */}
      <p className="halaman-catatan">
        Lapisan AI belum dibangun, jadi pilihan ini baru disimpan dan belum
        dipakai oleh pemindaian. Empat tab analisis berjalan tanpa AI.
      </p>
    </>
  )
}
