import Link from 'next/link'
import { db } from '../../lib/ui/db.ts'
import { bacaRahasia } from '../../lib/auth/rahasia.ts'
import { konteks } from '../../lib/auth/konteks.ts'
import { bacaKunci } from '../../lib/ai/kunci.ts'
import { PilihModel } from '../../components/PilihModel.tsx'
import { KeadaanKosong } from '../../components/KeadaanKosong.tsx'
import { Ikon } from '../../components/Ikon.tsx'
import { tServer, localeSekarang } from '../../lib/i18n/server.ts'

export const dynamic = 'force-dynamic'

export default async function Model() {
  const ctx = await konteks()
  const t = await tServer()
  const locale = await localeSekarang()

  // Guest tidak punya akun, jadi tidak punya tempat untuk menyimpan kunci.
  // Halamannya tetap ada dan menjelaskan itu — bukan 404, dan bukan form yang
  // menolak setelah diisi.
  if (ctx.jenis !== 'user') {
    return (
      <>
        <header className="dashboard-header">
          <div className="dashboard-atas">
            <h1 className="halaman-judul">{t('model.judul')}</h1>
          </div>
        </header>
        <KeadaanKosong
          keadaan="butuh-akun"
          t={t}
          aksi={
            <Link href="/masuk" className="tombol">
              {t('masuk.tombol')}
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
          <h1 className="halaman-judul">{t('model.judul')}</h1>
        </div>
        <p className="halaman-teks">{t('model.teks1')}</p>
        <p className="halaman-teks">{t('model.teks2')}</p>
      </header>

      <PilihModel
        locale={locale}
        admin={ctx.user.role === 'admin'}
        info={
          kunci === null
            ? null
            : {
                provider: kunci.provider,
                model: kunci.model,
                ekor: kunci.ekor,
                terverifikasi: kunci.terverifikasi,
              }
        }
      />

      <div
        className="catatan-sumber"
        style={{ marginTop: 'var(--s-5)', borderLeftColor: 'var(--ink)' }}
      >
        <Ikon nama="sparkle" ukuran={14} />
        <span>{t('model.catatanAi')}</span>
      </div>

      {ctx.user.role === 'admin' && (
        <>
          <div className="catatan-sumber" style={{ marginTop: 'var(--s-4)' }}>
            <Ikon nama="perisai" ukuran={14} />
            <span>{t('model.catatanAdmin')}</span>
          </div>
          <div className="catatan-sumber" style={{ marginTop: 'var(--s-4)' }}>
            <Ikon nama="perisai" ukuran={14} />
            <span>{t('model.cliCatatan')}</span>
          </div>
        </>
      )}
    </>
  )
}
