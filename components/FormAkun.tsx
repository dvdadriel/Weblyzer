'use client'

import { useActionState } from 'react'
import { ubahPassword, buatAkun } from '../app/akun/aksi.ts'
import { Ikon } from './Ikon.tsx'

function Hasil({ hasil }: { hasil: { ok: boolean; pesan: string } | null }) {
  if (!hasil) return null
  return (
    <p className={hasil.ok ? 'model-hasil ok' : 'model-hasil gagal'} role="status">
      <Ikon nama={hasil.ok ? 'ceklis' : 'alert'} ukuran={13} /> {hasil.pesan}
    </p>
  )
}

export function FormPassword({ punyaPassword }: { punyaPassword: boolean }) {
  const [hasil, kirim, menunggu] = useActionState(ubahPassword, null)

  return (
    <form action={kirim} className="model-set">
      {/* Password lama diminta walau session sudah terbukti: tanpa itu, laptop
          yang ditinggal terbuka satu menit cukup untuk mengambil alih akun
          secara permanen. Akun Google belum punya password lama untuk diminta. */}
      {punyaPassword && (
        <label className="model-baris">
          <span className="model-nama">Password sekarang</span>
          <input
            type="password"
            name="lama"
            autoComplete="current-password"
            required
            disabled={menunggu}
          />
        </label>
      )}

      <label className="model-baris">
        <span className="model-nama">Password baru</span>
        <input
          type="password"
          name="baru"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={menunggu}
        />
      </label>

      <button type="submit" className="tombol" disabled={menunggu}>
        {menunggu ? 'Menyimpan…' : 'Ganti Password'}
      </button>

      <Hasil hasil={hasil} />
    </form>
  )
}

export function FormBuatAkun() {
  const [hasil, kirim, menunggu] = useActionState(buatAkun, null)

  return (
    <form action={kirim} className="model-set">
      <label className="model-baris">
        <span className="model-nama">Email</span>
        <input type="email" name="email" required disabled={menunggu} />
      </label>

      <label className="model-baris">
        <span className="model-nama">Password awal</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={menunggu}
        />
      </label>

      <label className="model-baris">
        <input type="checkbox" name="admin" disabled={menunggu} />
        <span className="model-nama">Jadikan admin</span>
        <span className="model-versi">bisa memicu aspek GEO dan Audit</span>
      </label>

      <button type="submit" className="tombol" disabled={menunggu}>
        {menunggu ? 'Membuat…' : 'Buat Akun'}
      </button>

      <Hasil hasil={hasil} />
    </form>
  )
}
