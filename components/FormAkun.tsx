'use client'

import { useActionState } from 'react'
import { ubahPassword, buatAkun } from '../app/akun/aksi.ts'
import { Ikon } from './Ikon.tsx'
import { penerjemah, type Locale } from '../lib/i18n/index.ts'

function Hasil({ hasil }: { hasil: { ok: boolean; pesan: string } | null }) {
  if (!hasil) return null
  return (
    <p className={hasil.ok ? 'model-hasil ok' : 'model-hasil gagal'} role="status">
      <Ikon nama={hasil.ok ? 'ceklis' : 'alert'} ukuran={13} /> {hasil.pesan}
    </p>
  )
}

export function FormPassword({
  punyaPassword,
  locale,
}: {
  punyaPassword: boolean
  locale: Locale
}) {
  const [hasil, kirim, menunggu] = useActionState(ubahPassword, null)
  const t = penerjemah(locale)

  return (
    <form action={kirim} className="model-set">
      {/* Password lama diminta walau session sudah terbukti: tanpa itu, laptop
          yang ditinggal terbuka satu menit cukup untuk mengambil alih akun
          secara permanen. Akun Google belum punya password lama untuk diminta. */}
      {punyaPassword && (
        <label className="model-baris">
          <span className="model-nama">{t('akun.passwordSekarang')}</span>
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
        <span className="model-nama">{t('akun.passwordBaru')}</span>
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
        {menunggu ? t('akun.menyimpan') : t('akun.tombolGanti')}
      </button>

      <Hasil hasil={hasil} />
    </form>
  )
}

export function FormBuatAkun({ locale }: { locale: Locale }) {
  const [hasil, kirim, menunggu] = useActionState(buatAkun, null)
  const t = penerjemah(locale)

  return (
    <form action={kirim} className="model-set">
      <label className="model-baris">
        <span className="model-nama">{t('masuk.email')}</span>
        <input type="email" name="email" required disabled={menunggu} />
      </label>

      <label className="model-baris">
        <span className="model-nama">{t('akun.passwordAwal')}</span>
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
        <span className="model-nama">{t('akun.jadikanAdmin')}</span>
        <span className="model-versi">{t('akun.jadikanAdminTeks')}</span>
      </label>

      <button type="submit" className="tombol" disabled={menunggu}>
        {menunggu ? t('akun.membuat') : t('akun.buatTombol')}
      </button>

      <Hasil hasil={hasil} />
    </form>
  )
}
