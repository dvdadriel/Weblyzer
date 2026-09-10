'use client'

import { useActionState, useState, useTransition } from 'react'
import { pilihCli, pakaiEnv } from '../app/model/aksi.ts'
import type { PilihanCli } from '../lib/repos/konfig.ts'
import { Ikon } from './Ikon.tsx'
import { penerjemah, type Locale, type Kunci } from '../lib/i18n/index.ts'

/**
 * Model yang disarankan per CLI — SARAN, bukan batas.
 *
 * Dipasang lewat `<datalist>`, jadi medannya tetap medan teks biasa: nama apa
 * pun boleh diketik. Itu penting, karena daftar model kedua CLI ini berubah
 * tanpa Weblyzer tahu — `agy models` hari ini memuat empat belas nama, dan
 * daftar yang di-hardcode sebagai `<select>` akan menolak model yang
 * sebenarnya berfungsi.
 *
 * Menjalankan `agy models` saat halaman dimuat memang bisa, dan sengaja tidak:
 * itu men-spawn proses pada setiap render untuk mengisi daftar yang jarang
 * berubah, dan halamannya akan macet setiap kali CLI-nya sedang rusak.
 */
const KETERANGAN = {
  claude: 'model.cli.claude',
  agy: 'model.cli.agy',
} as const satisfies Record<string, Kunci>

const SARAN: Record<string, string[]> = {
  claude: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'opus', 'sonnet', 'haiku'],
  agy: ['gemini-3.1-pro-high', 'gemini-3.8-flash-medium', 'claude-opus-4-6-thinking'],
}

/**
 * Memilih CLI dan modelnya, dari halaman web.
 *
 * Hanya jalur CLI yang bisa dipilih di sini, dan itu batas yang disengaja:
 * `claude` dan `agy` memakai loginnya sendiri di mesin ini, jadi yang tersimpan
 * cuma dua kata dan tidak ada rahasia yang menyeberang lewat form. API key
 * tetap hanya dari `.env` — lihat `lib/repos/konfig.ts`.
 */
export function PilihCli({
  pilihan,
  locale,
}: {
  pilihan: PilihanCli | null
  locale: Locale
}) {
  const [hasil, kirim, menunggu] = useActionState(pilihCli, null)
  const [melepas, mulaiLepas] = useTransition()
  const t = penerjemah(locale)
  const [cli, setCli] = useState<string>(pilihan?.cli ?? 'claude')

  return (
    <div className="model">
      <form action={kirim} className="model-set">
        <fieldset className="model-grup" disabled={menunggu}>
          <legend className="model-legend">{t('model.labelCli')}</legend>
          {/* Radio, bukan select: dua pilihan yang keduanya harus terlihat
              sekaligus supaya bedanya bisa dibaca tanpa membukanya dulu. */}
          {(['claude', 'agy'] as const).map((n) => (
            <label key={n} className="model-radio">
              <input
                type="radio"
                name="cli"
                value={n}
                checked={cli === n}
                onChange={() => setCli(n)}
              />
              <span>{n}</span>
              <span className="model-catatan">{t(KETERANGAN[n])}</span>
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
            placeholder={SARAN[cli]?.[0] ?? ''}
            autoComplete="off"
            spellCheck={false}
          />
          {/* Medan teks dengan saran, bukan select: daftar model berubah tanpa
              Weblyzer tahu, dan select akan menolak model yang berfungsi. */}
          <datalist id={`saran-${cli}`}>
            {(SARAN[cli] ?? []).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <button type="submit" className="model-uji" disabled={menunggu}>
          {menunggu ? t('model.memeriksa') : t('model.simpanUji')}
        </button>
      </form>

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
