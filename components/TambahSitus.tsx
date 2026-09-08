'use client'

import { useActionState } from 'react'
import { tambahSitus } from '../app/actions.ts'
import { Ikon } from './Ikon.tsx'

/**
 * Form tambah situs, disembunyikan di balik `<details>`.
 *
 * `<details>` dan bukan modal: DESIGN.md menolak modal-first, dan pilihan ini
 * juga menghapus seluruh state buka/tutup — tidak ada `useState`, tidak ada
 * penanganan Escape, tidak ada focus trap, dan keyboard sudah jalan sejak
 * karakter pertama karena browser yang menanganinya.
 *
 * Dashboard adalah layar "apa yang rusak semalam", jadi form ini tertutup
 * secara default: menambah situs itu pekerjaan sesekali, sedangkan membaca
 * daftar situs pekerjaan harian. Yang harian tidak boleh digeser ke bawah oleh
 * yang sesekali.
 */
export function TambahSitus() {
  const [hasil, kirim, menunggu] = useActionState(tambahSitus, null)

  return (
    <details className="tambah">
      <summary className="tambah-pemicu">
        <Ikon nama="tambah" ukuran={14} />
        Tambah Situs Baru
      </summary>

      <form action={kirim} className="tambah-form">
        <p className="tambah-baris">
          <label className="tambah-label" htmlFor="nama">
            Nama Situs
          </label>
          {/* `defaultValue` dari state, bukan string kosong: lihat catatan di
              `HasilAksi`. Simpan yang gagal tidak boleh menghapus apa yang
              sudah diketik. */}
          <input
            className="kontrol"
            id="nama"
            name="nama"
            placeholder="Misal: Toko Online Saya"
            defaultValue={hasil?.nama ?? ''}
            required
            autoComplete="off"
          />
        </p>

        <p className="tambah-baris">
          <label className="tambah-label" htmlFor="url">
            Alamat URL (Basis)
          </label>
          {/* `type="url"` memberi keyboard yang benar di ponsel, tapi validasi
              sebenarnya tetap di server: `normalizeBaseUrl` yang memutuskan,
              supaya situs dari tombol dan dari terminal tersimpan sama. */}
          <input
            className="kontrol"
            id="url"
            name="url"
            type="url"
            defaultValue={hasil?.url ?? ''}
            placeholder="https://situs.com"
            required
            autoComplete="off"
          />
        </p>

        <p className="tambah-aksi">
          <button className="tombol" type="submit" disabled={menunggu}>
            <Ikon nama="ceklis" ukuran={14} />
            {menunggu ? 'Menyimpan…' : 'Simpan Situs'}
          </button>
        </p>

        {/* `role="alert"` supaya screen reader mengumumkannya tanpa perlu
            memindahkan fokus. Pesannya menyebut apa yang salah, bukan minta
            maaf — PRODUCT.md. */}
        {hasil?.error && (
          <p className="tambah-galat" role="alert" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <Ikon nama="alert" ukuran={13} />
            {hasil.error}
          </p>
        )}
      </form>
    </details>
  )
}
