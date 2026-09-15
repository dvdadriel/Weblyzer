'use client'

import { useActionState, useState, useTransition } from 'react'
import { pilihCli, pakaiEnv } from '../app/model/aksi.ts'
import type { PilihanCli } from '../lib/repos/konfig.ts'
import type { StatusCli } from '../lib/ai/cli.ts'
import { Ikon } from './Ikon.tsx'
import { penerjemah, type Locale } from '../lib/i18n/index.ts'

/**
 * Memilih CLI dan modelnya, dari halaman web.
 *
 * Hanya jalur CLI yang bisa dipilih di sini, dan itu batas yang disengaja:
 * `claude` dan `agy` memakai loginnya sendiri di mesin ini, jadi yang tersimpan
 * cuma dua kata dan tidak ada rahasia yang menyeberang lewat form. API key
 * tetap hanya dari `.env` — lihat `lib/repos/konfig.ts`.
 *
 * Daftar modelnya datang dari CLI-nya sendiri (lihat `statusCli`), bukan dari
 * daftar di dalam kode: yang di-hardcode akan menolak model yang sebenarnya
 * berfungsi pada hari penyedianya menambah satu.
 */
export function PilihCli({
  pilihan,
  status,
  locale,
}: {
  pilihan: PilihanCli | null
  status: StatusCli[]
  locale: Locale
}) {
  const [hasil, kirim, menunggu] = useActionState(pilihCli, null)
  const [melepas, mulaiLepas] = useTransition()
  const t = penerjemah(locale)
  const [cli, setCli] = useState<string>(pilihan?.cli ?? status[0]?.nama ?? 'claude')
  const terpilih = status.find((s) => s.nama === cli)

  return (
    <div className="model">
      <form action={kirim} className="model-set">
        <fieldset className="model-grup" disabled={menunggu}>
          <legend className="model-legend">{t('model.labelCli')}</legend>
          {/* Radio, bukan select: dua pilihan yang keduanya harus terlihat
              sekaligus supaya bedanya bisa dibaca tanpa membukanya dulu. */}
          {status.map((s) => (
            <label key={s.nama} className="model-radio">
              <input
                type="radio"
                name="cli"
                value={s.nama}
                checked={cli === s.nama}
                onChange={() => setCli(s.nama)}
              />
              <span>{s.nama}</span>
              {/* Keadaan loginnya di samping namanya, bukan di tempat lain:
                  memilih CLI yang belum login adalah satu-satunya cara form
                  ini gagal, dan sebabnya harus terbaca sebelum diklik. */}
              <span className="model-catatan">
                {s.galat
                  ? s.galat
                  : s.masuk
                    ? t('model.masuk', { akun: s.akun ?? t('model.akunTanpaNama') })
                    : t('model.belumMasuk', { perintah: s.login })}
              </span>
            </label>
          ))}
        </fieldset>

        <label className="model-baris">
          <span className="model-nama">{t('model.labelModel')}</span>
          <input
            type="text"
            name="model"
            list={`saran-${cli}`}
            required
            disabled={menunggu}
            defaultValue={pilihan?.model ?? ''}
            placeholder={terpilih?.model[0] ?? ''}
            autoComplete="off"
            spellCheck={false}
          />
          {/* Medan teks dengan saran, bukan select: daftarnya diambil dari CLI
              yang sedang hidup, dan select akan menolak nama yang berfungsi
              kalau pemeriksaannya sendiri yang gagal. */}
          <datalist id={`saran-${cli}`}>
            {(terpilih?.model ?? []).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <button type="submit" className="model-uji" disabled={menunggu}>
          {menunggu ? t('model.memeriksa') : t('model.simpanUji')}
        </button>
      </form>

      {terpilih && !terpilih.masuk && (
        <p className="model-hasil gagal" role="status">
          <Ikon nama="alert" ukuran={13} />{' '}
          {t('model.loginDulu', { cli: terpilih.nama, perintah: terpilih.login })}
        </p>
      )}

      {/* Hasilnya ditulis mentah, termasuk saat gagal. Inilah bedanya antara
          "gagal" dan "error: interrupted" — yang pertama tidak bisa
          ditindaklanjuti, yang kedua bisa. */}
      {hasil && (
        <p className={hasil.ok ? 'model-hasil ok' : 'model-hasil gagal'} role="status">
          <Ikon nama={hasil.ok ? 'ceklis' : 'alert'} ukuran={13} /> {hasil.pesan}
        </p>
      )}

      {pilihan && (
        <button
          type="button"
          className="model-uji"
          disabled={melepas}
          onClick={() => mulaiLepas(() => void pakaiEnv())}
        >
          {melepas ? t('model.melepas') : t('model.pakaiEnv')}
        </button>
      )}
    </div>
  )
}
