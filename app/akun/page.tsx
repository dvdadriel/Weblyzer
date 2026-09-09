import Link from 'next/link'
import { db } from '../../lib/ui/db.ts'
import { konteks } from '../../lib/auth/konteks.ts'
import { daftarUser } from '../../lib/auth/pengguna.ts'
import { FormPassword, FormBuatAkun } from '../../components/FormAkun.tsx'
import { KeadaanKosong } from '../../components/KeadaanKosong.tsx'
import { Ikon } from '../../components/Ikon.tsx'

export const dynamic = 'force-dynamic'

export default async function Akun() {
  const ctx = await konteks()

  if (ctx.jenis !== 'user') {
    return (
      <>
        <header className="dashboard-header">
          <div className="dashboard-atas">
            <h1 className="halaman-judul">Akun</h1>
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

  const semua = ctx.user.role === 'admin' ? daftarUser(db()) : []

  return (
    <>
      <header className="dashboard-header">
        <div className="dashboard-atas">
          <h1 className="halaman-judul">Akun</h1>
        </div>
        <p className="halaman-teks">
          Masuk sebagai <strong>{ctx.user.email}</strong>
          {ctx.user.role === 'admin' && ' · admin'}
        </p>
      </header>

      <section>
        <h2 className="halaman-judul">Ganti password</h2>
        {ctx.user.password_hash === null && (
          <p className="halaman-teks">
            Akun ini masuk lewat Google dan belum punya password. Mengisi form ini
            menambahkan satu, jadi Anda bisa masuk dengan cara mana pun.
          </p>
        )}
        <FormPassword punyaPassword={ctx.user.password_hash !== null} />
      </section>

      {ctx.user.role === 'admin' && (
        <section style={{ marginTop: 'var(--s-6)' }}>
          <h2 className="halaman-judul">Akun di instance ini</h2>

          <div className="tabel-bungkus">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Peran</th>
                  <th scope="col">Cara masuk</th>
                  <th scope="col">Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {semua.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>{u.password_hash === null ? 'Google saja' : 'Password'}</td>
                    <td>{u.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="halaman-judul" style={{ marginTop: 'var(--s-5)' }}>
            Buat akun
          </h2>
          <p className="halaman-teks">
            Instance ini tidak menerima pendaftaran mandiri, jadi akun dibuat di sini.
            Pendaftaran terbuka berarti moderasi, verifikasi email, dan penyalahgunaan
            kuota — tiga masalah yang belum ada.
          </p>
          <FormBuatAkun />
        </section>
      )}

      <div className="catatan-sumber" style={{ marginTop: 'var(--s-6)' }}>
        <Ikon nama="alert" ukuran={14} />
        <span>
          Sesi di proyek ini tidak punya tabel, jadi mengganti password{' '}
          <strong>tidak</strong> mengeluarkan Anda dari perangkat lain yang sudah masuk.
          Kalau ada perangkat yang hilang, hubungi pemilik instance untuk menghapus dan
          membuat ulang akunnya.
        </span>
      </div>
    </>
  )
}
