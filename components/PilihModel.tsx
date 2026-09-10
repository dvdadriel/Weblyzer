'use client'

import { useActionState, useState, useTransition } from 'react'
import { simpanDanUji, lupakanKunci } from '../app/akun/aksi.ts'
import type { InfoKunci } from '../lib/ai/kunci.ts'
import { MODEL, MODEL_BAWAAN, PENYEDIA, penyediaDariModel } from '../lib/ai/penyedia.ts'
import { Ikon } from './Ikon.tsx'
import { penerjemah, type Locale } from '../lib/i18n/index.ts'

/**
 * Memilih model dan menyimpan API key, dalam satu form.
 *
 * Satu tombol, bukan "Simpan" lalu "Uji" terpisah. "Tersimpan" yang berhasil
 * untuk kunci yang salah adalah kebohongan yang baru ketahuan saat pemindaian
 * tengah malam gagal — dan itu persis kegagalan yang halaman ini ada untuk
 * mencegahnya.
 *
 * Kunci yang sudah ada tidak pernah dikirim balik ke browser. Yang ditampilkan
 * hanya model, empat karakter terakhir, dan status verifikasinya; field-nya
 * dibiarkan kosong dengan placeholder yang menjelaskan bahwa mengisinya berarti
 * mengganti.
 */
export function PilihModel({
  info,
  locale,
  admin,
}: {
  info: (InfoKunci & { ekor: string }) | null
  locale: Locale
  /** Penyedia yang memakai kredensial mesin hanya muncul untuk admin. Gerbang
   *  sebenarnya ada di server (lihat `simpanDanUji`); ini supaya opsi yang
   *  pasti ditolak tidak ditawarkan. */
  admin: boolean
}) {
  const [hasil, kirim, menunggu] = useActionState(simpanDanUji, null)
  const t = penerjemah(locale)
  const [melupakan, mulaiLupa] = useTransition()

  const daftar = MODEL.filter((m) => admin || m.penyedia !== 'agy-cli')
  const [dipilih, setDipilih] = useState(info?.model ?? MODEL_BAWAAN)
  const butuhKunci = penyediaDariModel(dipilih) === 'anthropic'

  return (
    <div className="model">
      {info && (
        <p className="model-status">
          {info.terverifikasi ? (
            <span className="model-hasil ok">
              <Ikon nama="ceklis" ukuran={13} />{' '}
              {info.provider === 'agy-cli'
                ? t('model.cliBerlaku', { model: namaModel(info.model) })
                : t('model.berlaku', { model: namaModel(info.model) })}
              {info.ekor !== '' && <> &middot; {t('model.berakhiran', { ekor: info.ekor })}</>}
            </span>
          ) : (
            /* Tersimpan tapi belum lolos validasi adalah keadaan tersendiri,
               dan harus terlihat begitu: fitur AI-nya mati, dan sebabnya bukan
               "belum dikonfigurasi". */
            <span className="model-hasil gagal">
              <Ikon nama="alert" ukuran={13} /> {t('model.belumTerbukti')}
            </span>
          )}
        </p>
      )}

      <form action={kirim} className="model-set">
        <label className="model-baris">
          <span className="model-nama">{t('model.labelModel')}</span>
          <select
            name="model"
            value={dipilih}
            onChange={(e) => setDipilih(e.target.value)}
            disabled={menunggu}
          >
            {/* Dikelompokkan per penyedia, karena pilihannya bukan sekadar
                model yang berbeda: yang satu memakai kunci dan tagihan Anda
                sendiri, yang lain memakai kredensial mesin server. */}
            {PENYEDIA.filter((p) => daftar.some((m) => m.penyedia === p.id)).map((p) => (
              <optgroup key={p.id} label={p.nama}>
                {daftar
                  .filter((m) => m.penyedia === p.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama} — {m.catatan}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>

        {/* Field kuncinya HILANG untuk penyedia CLI, bukan cuma dinonaktifkan.
            Field mati yang tetap terlihat mengundang orang mencari kunci yang
            tidak dibutuhkan, dan `required` di field yang tersembunyi lewat CSS
            membuat form gagal submit tanpa pesan yang bisa dilihat. */}
        {butuhKunci ? (
          <label className="model-baris">
            <span className="model-nama">{t('model.labelKunci')}</span>
            <input
              type="password"
              name="apiKey"
              autoComplete="off"
              required
              disabled={menunggu}
              placeholder={info ? t('model.gantiPetunjuk') : 'sk-ant-...'}
            />
          </label>
        ) : (
          <p className="model-status">{t('model.kunciTakPerlu')}</p>
        )}

        <button type="submit" className="model-uji" disabled={menunggu}>
          {menunggu ? t('model.memeriksa') : t('model.simpanUji')}
        </button>
      </form>

      {/* Hasilnya ditulis mentah, termasuk saat gagal. Inilah bedanya antara
          "gagal" dan "API key ini tidak punya izin untuk model yang dipilih" —
          yang pertama tidak bisa ditindaklanjuti, yang kedua bisa. */}
      {hasil && (
        <p className={hasil.ok ? 'model-hasil ok' : 'model-hasil gagal'} role="status">
          <Ikon nama={hasil.ok ? 'ceklis' : 'alert'} ukuran={13} /> {hasil.pesan}
        </p>
      )}

      {info && (
        <button
          type="button"
          className="model-uji"
          disabled={melupakan}
          onClick={() => mulaiLupa(() => void lupakanKunci())}
        >
          {melupakan ? t('model.menghapus') : t('model.lupakan')}
        </button>
      )}
    </div>
  )
}

function namaModel(id: string): string {
  return MODEL.find((m) => m.id === id)?.nama ?? id
}
