import Link from 'next/link'
import { db } from '../../lib/ui/db.ts'
import { konteks } from '../../lib/auth/konteks.ts'
import { daftarUser } from '../../lib/auth/pengguna.ts'
import { FormPassword, FormBuatAkun } from '../../components/FormAkun.tsx'
import { KeadaanKosong } from '../../components/KeadaanKosong.tsx'
import { Ikon } from '../../components/Ikon.tsx'
import { tServer, localeSekarang } from '../../lib/i18n/server.ts'

export const dynamic = 'force-dynamic'

export default async function Akun() {
  const ctx = await konteks()
  const t = await tServer()
  const locale = await localeSekarang()

  if (ctx.jenis !== 'user') {
    return (
      <>
        <header className="dashboard-header">
          <div className="dashboard-atas">
            <h1 className="halaman-judul">{t('akun.judul')}</h1>
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

  const semua = ctx.user.role === 'admin' ? daftarUser(db()) : []

  return (
    <>
      <header className="dashboard-header">
        <div className="dashboard-atas">
          <h1 className="halaman-judul">{t('akun.judul')}</h1>
        </div>
        <p className="halaman-teks">
          {t('akun.masukSebagai')} <strong>{ctx.user.email}</strong>
          {ctx.user.role === 'admin' && ' · admin'}
        </p>
      </header>

      <section>
        <h2 className="halaman-judul">{t('akun.gantiPassword')}</h2>
        {ctx.user.password_hash === null && (
          <p className="halaman-teks">{t('akun.tanpaPassword')}</p>
        )}
        <FormPassword punyaPassword={ctx.user.password_hash !== null} locale={locale} />
      </section>

      {ctx.user.role === 'admin' && (
        <section style={{ marginTop: 'var(--s-6)' }}>
          <h2 className="halaman-judul">{t('akun.daftarJudul')}</h2>

          <div className="tabel-bungkus">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">{t('akun.kolomEmail')}</th>
                  <th scope="col">{t('akun.kolomPeran')}</th>
                  <th scope="col">{t('akun.kolomCaraMasuk')}</th>
                  <th scope="col">{t('akun.kolomDibuat')}</th>
                </tr>
              </thead>
              <tbody>
                {semua.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>{u.password_hash === null ? t('akun.caraGoogle') : t('akun.caraPassword')}</td>
                    <td>{u.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="halaman-judul" style={{ marginTop: 'var(--s-5)' }}>
            {t('akun.buatJudul')}
          </h2>
          <p className="halaman-teks">{t('akun.buatTeks')}</p>
          <FormBuatAkun locale={locale} />
        </section>
      )}

      <div className="catatan-sumber" style={{ marginTop: 'var(--s-6)' }}>
        <Ikon nama="alert" ukuran={14} />
        <span>{t('akun.peringatanSesi')}</span>
      </div>
    </>
  )
}
