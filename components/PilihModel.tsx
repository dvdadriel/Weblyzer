'use client'

import { useState, useTransition } from 'react'
import { simpanPenyedia } from '../app/actions.ts'
import type { Ketersediaan } from '../lib/ai/penyedia.ts'

/**
 * Memilih penyedia AI dari yang benar-benar terpasang di mesin ini.
 *
 * Yang tidak terpasang tetap ditampilkan, tapi dimatikan dan diberi perintah
 * pemasangannya. Menyembunyikannya akan membuat daftar yang berbeda-beda di
 * tiap mesin tanpa penjelasan — dan pertanyaan "kenapa Gemini tidak ada?"
 * tidak punya jawaban di layar.
 */
export function PilihModel({
  tersedia,
  terpilih,
}: {
  tersedia: Ketersediaan[]
  terpilih: string | null
}) {
  const [nilai, setNilai] = useState(terpilih ?? '')
  const [galat, setGalat] = useState<string | null>(null)
  const [tersimpan, setTersimpan] = useState(false)
  const [menunggu, mulai] = useTransition()

  function pilih(v: string) {
    setNilai(v)
    setTersimpan(false)
    mulai(async () => {
      const hasil = await simpanPenyedia(v)
      if (hasil?.error) {
        setGalat(hasil.error)
        // Dikembalikan ke nilai yang tersimpan: radio yang tetap menunjuk
        // pilihan gagal akan terbaca seperti pilihan yang berlaku.
        setNilai(terpilih ?? '')
        return
      }
      setGalat(null)
      setTersimpan(true)
    })
  }

  return (
    <div className="model">
      <fieldset className="model-set" disabled={menunggu}>
        <legend className="model-legend">Penyedia</legend>

        {tersedia.map((p) => (
          <label key={p.id} className="model-baris" data-mati={!p.ada || undefined}>
            <input
              type="radio"
              name="penyedia"
              value={p.id}
              checked={nilai === p.id}
              disabled={!p.ada}
              onChange={() => pilih(p.id)}
            />
            <span className="model-nama">{p.nama}</span>

            {p.ada && <span className="model-versi">{p.versi}</span>}

            {/* Tiga keadaan yang berbeda artinya, dan dibedakan: terpasang,
                tidak terpasang, dan terpasang tapi tidak menjawab. Yang
                terakhir paling mudah disalahartikan sebagai yang kedua. */}
            {!p.ada && p.galat === null && (
              <span className="model-tiada">
                belum terpasang &middot; <code>{p.perintah}</code> tidak ditemukan di PATH
              </span>
            )}
            {p.galat !== null && <span className="model-galat">{p.galat}</span>}
          </label>
        ))}

        <label className="model-baris">
          <input
            type="radio"
            name="penyedia"
            value=""
            checked={nilai === ''}
            onChange={() => pilih('')}
          />
          <span className="model-nama">Tanpa AI</span>
          <span className="model-versi">pemindaian jalan tanpa rangkuman</span>
        </label>
      </fieldset>

      {/* Disimpan begitu dipilih, jadi tidak ada tombol Simpan yang bisa
          dilupakan. Yang menggantinya adalah penanda bahwa penyimpanan sudah
          terjadi — tanpa itu, tidak ada cara membedakan "tersimpan" dari
          "belum diklik". */}
      <p className="model-status" role="status">
        {menunggu ? 'Menyimpan…' : tersimpan ? 'Tersimpan.' : ''}
      </p>

      {galat && (
        <p className="model-galat" role="alert">
          {galat}
        </p>
      )}
    </div>
  )
}
