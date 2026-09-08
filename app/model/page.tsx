import { db } from '../../lib/ui/db.ts'
import { periksaPenyedia, penyediaTerpilih, PENYEDIA } from '../../lib/ai/penyedia.ts'
import { statusAkun } from '../../lib/ai/akun.ts'
import { StatusAkun } from '../../components/StatusAkun.tsx'
import { PilihModel } from '../../components/PilihModel.tsx'
import { Ikon } from '../../components/Ikon.tsx'

export const dynamic = 'force-dynamic'

export default async function Model() {
  // Dideteksi pada tiap kunjungan, bukan disimpan: CLI dipasang, dihapus, dan
  // diperbarui di luar aplikasi ini. Ketersediaan yang di-cache akan berbohong
  // tepat pada hari pemakai memasang Gemini lalu bertanya kenapa masih mati.
  const tersedia = await periksaPenyedia()
  const terpilih = penyediaTerpilih(db())

  // Status akun diperiksa hanya untuk penyedia yang CLI-nya memang ada.
  // Menanyakannya pada yang tidak terpasang berarti empat detik menunggu
  // ENOENT yang sudah diketahui jawabannya.
  const akun = await Promise.all(
    PENYEDIA.filter((p) => tersedia.find((t) => t.id === p.id)?.ada === true).map(async (p) => ({
      nama: p.nama,
      status: await statusAkun(p.id, p.perintah),
    })),
  )

  return (
    <>
      <header className="dashboard-header">
        <div className="dashboard-atas">
          <h1 className="halaman-judul">Model AI</h1>
        </div>
        <p className="halaman-teks">
          Weblyzer memanggil CLI yang sudah terpasang di mesin ini, jadi tidak ada
          API key yang perlu disimpan dan langganan yang sudah dibayar ikut
          terpakai. Yang tidak terpasang tidak bisa dipilih.
        </p>
        <p className="halaman-teks">
          Login-nya milik CLI itu, bukan aplikasi ini:{' '}
          <code className="akun-perintah">claude auth login</code> di terminal, dan
          kredensialnya disimpan sistem. Weblyzer hanya membaca siapa yang sedang
          masuk.
        </p>
      </header>

      {akun.map((a) => (
        <StatusAkun key={a.nama} nama={a.nama} status={a.status} />
      ))}

      <PilihModel tersedia={tersedia} terpilih={terpilih} />

      <div className="catatan-sumber" style={{ marginTop: 'var(--s-5)', borderLeftColor: 'var(--ink)' }}>
        <Ikon nama="sparkle" ukuran={14} />
        <span>
          Lapisan AI memanfaatkan model CLI lokal untuk menyusun ringkasan analisis
          situs secara otomatis. Tab audit standar berjalan independen tanpa AI.
        </span>
      </div>
    </>
  )
}
