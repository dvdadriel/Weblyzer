'use client'

import { useTransition } from 'react'
import { aturTema } from '../app/tema/aksi.ts'
import { TEMA, type Tema } from '../lib/tema.ts'

const LABEL: Record<Tema, string> = {
  system: 'Sistem',
  light: 'Terang',
  dark: 'Gelap',
}

/**
 * Pemilih tema: tiga pilihan, bukan tombol dua keadaan.
 *
 * Tombol yang cuma membalik terang dan gelap menghapus pilihan `system`, dan
 * `system` adalah pilihan yang sah — ia berarti "ikuti apa pun yang sedang
 * dipakai perangkat saya", termasuk saat perangkat itu berganti sendiri di
 * malam hari.
 *
 * `<select>`, bukan tiga tombol: tiga tombol memakan lebar navbar untuk sesuatu
 * yang disentuh sekali lalu ditinggalkan.
 */
export function PilihTema({ tema }: { tema: Tema }) {
  const [menunggu, mulai] = useTransition()

  return (
    <label className="pilih-tema">
      <span className="pilih-tema-label">Tema</span>
      <select
        value={tema}
        disabled={menunggu}
        onChange={(e) => {
          const nilai = e.target.value
          mulai(() => void aturTema(nilai))
        }}
      >
        {TEMA.map((t) => (
          <option key={t} value={t}>
            {LABEL[t]}
          </option>
        ))}
      </select>
    </label>
  )
}
