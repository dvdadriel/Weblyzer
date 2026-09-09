'use client'

import { useTransition } from 'react'
import { aturTema, aturLocale } from '../app/tema/aksi.ts'
import { TEMA, type Tema } from '../lib/tema.ts'
import { LOCALE, type Locale, type T } from '../lib/i18n/index.ts'

/**
 * Pemilih tema dan bahasa.
 *
 * Tema: tiga pilihan, bukan tombol dua keadaan. Tombol yang cuma membalik
 * terang dan gelap menghapus pilihan `system`, dan `system` adalah pilihan yang
 * sah — ia berarti "ikuti apa pun yang sedang dipakai perangkat saya", termasuk
 * saat perangkat itu berganti sendiri di malam hari.
 *
 * `<select>`, bukan tombol berjajar: keduanya disentuh sekali lalu ditinggalkan,
 * dan enam tombol di navbar memakan lebar yang dibutuhkan alamat email.
 *
 * Label bahasa TIDAK diterjemahkan — "Indonesia" dan "English" ditulis dalam
 * bahasanya sendiri. Pemakai yang tidak paham bahasa yang sedang aktif justru
 * paling butuh menemukan pilihan ini, dan menerjemahkan namanya menyembunyikan
 * pilihan itu dari orang yang paling membutuhkannya.
 */
export function PilihTema({
  tema,
  locale,
  t,
}: {
  tema: Tema
  locale: Locale
  t: T
}) {
  const [menunggu, mulai] = useTransition()

  return (
    <>
      <label className="pilih-tema">
        <span className="pilih-tema-label">{t('nav.tema')}</span>
        <select
          value={tema}
          disabled={menunggu}
          onChange={(e) => {
            const nilai = e.target.value
            mulai(() => void aturTema(nilai))
          }}
        >
          {TEMA.map((x) => (
            <option key={x} value={x}>
              {t(`tema.${x}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="pilih-tema">
        <span className="pilih-tema-label">{t('locale.label')}</span>
        <select
          value={locale}
          disabled={menunggu}
          onChange={(e) => {
            const nilai = e.target.value
            mulai(() => void aturLocale(nilai))
          }}
        >
          {LOCALE.map((x) => (
            <option key={x} value={x}>
              {t(`locale.${x}`)}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
