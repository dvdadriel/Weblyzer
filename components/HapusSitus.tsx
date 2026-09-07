'use client'

import { useState, useTransition } from 'react'
import { hapusSitus } from '../app/actions.ts'

/**
 * Menghapus satu situs, dengan konfirmasi di tempat.
 *
 * Dua langkah, bukan satu: penghapusannya menarik seluruh riwayat pemindaian
 * situs itu dan tidak bisa dibatalkan. Satu klik yang salah sasaran akan
 * menghapus data berbulan-bulan.
 *
 * Konfirmasinya mengembang di tempat, bukan modal — DESIGN.md menolak
 * modal-first — dan bukan `confirm()` bawaan browser, yang memblokir seluruh
 * halaman dan tidak bisa diberi gaya maupun dibaca konsisten oleh screen
 * reader.
 *
 * Yang disebut adalah jumlah yang akan hilang, bukan "Anda yakin?".
 * Pertanyaan itu tidak menambah satu pun informasi; angkanya menambah.
 */
export function HapusSitus({
  siteId,
  nama,
  jumlahTemuan,
}: {
  siteId: number
  nama: string
  jumlahTemuan: number
}) {
  const [tanya, setTanya] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  const [menunggu, mulai] = useTransition()

  if (!tanya) {
    return (
      <div className="hapus">
        <button
          className="hapus-pemicu"
          type="button"
          /* Nama situs masuk ke label aksesibilitas, karena di daftar dengan
             dua belas situs "Hapus" sendirian tidak menyebut yang mana. */
          aria-label={`Hapus ${nama}`}
          onClick={() => setTanya(true)}
        >
          Hapus
        </button>
      </div>
    )
  }

  return (
    <div className="hapus hapus-tanya" role="group" aria-label={`Konfirmasi hapus ${nama}`}>
      <p className="hapus-teks">
        Hapus {nama}?{' '}
        {jumlahTemuan > 0
          ? `${jumlahTemuan} temuan terbuka dan seluruh riwayat pemindaiannya ikut hilang.`
          : 'Seluruh riwayat pemindaiannya ikut hilang.'}{' '}
        Tidak bisa dibatalkan.
      </p>

      <p className="hapus-aksi">
        <button
          className="tombol tombol-bahaya"
          type="button"
          disabled={menunggu}
          onClick={() =>
            mulai(async () => {
              const hasil = await hapusSitus(siteId)
              // Kalau gagal, panelnya tetap terbuka dengan alasannya. Menutup
              // diri sambil membiarkan situsnya ada akan terbaca seperti
              // penghapusan yang berhasil.
              if (hasil?.error) setGalat(hasil.error)
            })
          }
        >
          {menunggu ? 'Menghapus…' : 'Hapus Permanen'}
        </button>
        <button
          className="hapus-batal"
          type="button"
          disabled={menunggu}
          onClick={() => {
            setTanya(false)
            setGalat(null)
          }}
        >
          Batal
        </button>
      </p>

      {galat && (
        <p className="hapus-galat" role="alert">
          {galat}
        </p>
      )}
    </div>
  )
}
