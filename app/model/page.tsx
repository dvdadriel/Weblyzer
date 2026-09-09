import Link from 'next/link'
import { db } from '../../lib/ui/db.ts'
import { bacaRahasia } from '../../lib/auth/rahasia.ts'
import { konteks } from '../../lib/auth/konteks.ts'
import { bacaKunci } from '../../lib/ai/kunci.ts'
import { PilihModel } from '../../components/PilihModel.tsx'
import { KeadaanKosong } from '../../components/KeadaanKosong.tsx'
import { Ikon } from '../../components/Ikon.tsx'

export const dynamic = 'force-dynamic'

export default async function Model() {
  const ctx = await konteks()

  // Guest tidak punya akun, jadi tidak punya tempat untuk menyimpan kunci.
  // Halamannya tetap ada dan menjelaskan itu — bukan 404, dan bukan form yang
  // menolak setelah diisi.
  if (ctx.jenis !== 'user') {
    return (
      <>
        <header className="dashboard-header">
          <div className="dashboard-atas">
            <h1 className="halaman-judul">Model AI</h1>
          </div>
        </header>
        <KeadaanKosong
          keadaan="butuh-akun"
          aksi={
            <Link href="/masuk" className="tombol">
              Masuk
            </Link>
          }
        />
      </>
    )
  }

  // Ekornya butuh dekripsi, dan halaman ini memang menampilkannya — empat
  // karakter terakhir adalah satu-satunya cara pemakai memastikan kunci mana
  // yang sedang tersimpan tanpa menempel ulang.
  const kunci = bacaKunci(db(), bacaRahasia(), ctx.user.id)

  return (
    <>
      <header className="dashboard-header">
        <div className="dashboard-atas">
          <h1 className="halaman-judul">Model AI</h1>
        </div>
        <p className="halaman-teks">
          Ringkasan AI memakai API key Anthropic milik Anda sendiri, dan tagihannya
          milik Anda. Kuncinya disimpan terenkripsi dan tidak pernah dikirim kembali ke
          browser — yang ditampilkan di sini hanya empat karakter terakhirnya.
        </p>
        <p className="halaman-teks">
          Kunci baru diperiksa dulu terhadap Anthropic sebelum dianggap berlaku, dan
          ringkasan AI tetap mati sampai pemeriksaan itu lolos. Pemeriksaannya tidak
          memakai token.
        </p>
      </header>

      <PilihModel
        info={
          kunci === null
            ? null
            : { model: kunci.model, ekor: kunci.ekor, terverifikasi: kunci.terverifikasi }
        }
      />

      <div
        className="catatan-sumber"
        style={{ marginTop: 'var(--s-5)', borderLeftColor: 'var(--ink)' }}
      >
        <Ikon nama="sparkle" ukuran={14} />
        <span>
          Lapisan AI hanya menyusun rangkuman dari temuan yang sudah ada. Ketujuh aspek
          pemindaian berjalan sendiri tanpa AI, dan skor Lighthouse tetap hasil
          pengukuran — bukan tebakan model.
        </span>
      </div>

      {ctx.user.role === 'admin' && (
        <div className="catatan-sumber" style={{ marginTop: 'var(--s-4)' }}>
          <Ikon nama="perisai" ukuran={14} />
          <span>
            Aspek GEO dan Audit tidak memakai kunci ini. Keduanya menjalankan CLI{' '}
            <code className="akun-perintah">claude</code> di mesin server dengan plugin
            claude-seo, jadi kredensialnya milik mesin — <code className="akun-perintah">
              claude auth login
            </code>{' '}
            di terminal server. Karena itu keduanya hanya bisa dipicu admin.
          </span>
        </div>
      )}
    </>
  )
}
