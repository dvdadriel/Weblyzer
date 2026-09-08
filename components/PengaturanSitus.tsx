'use client'

import { useActionState } from 'react'
import { simpanPengaturan } from '../app/actions.ts'
import { perkiraanMenit } from '../lib/pengaturan-situs.ts'
import { Ikon } from './Ikon.tsx'

/**
 * Form pengaturan satu situs.
 *
 * `useActionState` seperti `TambahSitus`, bukan `useTransition` seperti
 * `PilihStrategi`: yang ini punya empat medan yang bisa gagal validasi, dan
 * nilai yang tadi diketik harus bertahan setelah gagal. React mengosongkan
 * input tak-terkontrol setelah sebuah action selesai — termasuk saat gagal —
 * jadi tanpa `defaultValue` dari hasil action, satu salah ketik menghapus
 * keempatnya.
 */
export function PengaturanSitus({
  siteId,
  awal,
  sedangDipindai,
}: {
  siteId: number
  awal: { max_pages: number; lighthouse_mode: string; sitemap_url: string | null; enabled: number }
  sedangDipindai: boolean
}) {
  const [hasil, kirim, menunggu] = useActionState(
    simpanPengaturan.bind(null, siteId),
    null,
  )

  return (
    <form action={kirim} className="atur">
      <fieldset className="atur-set" disabled={menunggu || sedangDipindai}>
        <legend className="model-legend">Pengaturan Situs</legend>

        <label className="atur-baris">
          <span className="atur-label">Batas halaman</span>
          <input
            className="atur-input"
            type="number"
            name="maxPages"
            min={1}
            max={2000}
            defaultValue={awal.max_pages}
            required
          />
          {/* Angkanya diterjemahkan ke waktu, karena "200" tidak memberi tahu
              apa pun sampai Anda pernah menjalankannya. Diturunkan dari ukuran
              nyata: Springair 141 halaman ≈ 3 menit crawl. */}
          <span className="atur-catatan">
            kira-kira {perkiraanMenit(awal.max_pages)} menit crawl, sebelum Lighthouse
          </span>
        </label>

        <label className="atur-baris">
          <span className="atur-label">Mode Lighthouse</span>
          <select className="atur-input" name="mode" defaultValue={awal.lighthouse_mode}>
            <option value="sample">sample — satu halaman per pola URL</option>
            <option value="full">full — setiap halaman</option>
          </select>
          <span className="atur-catatan">
            <code className="akun-perintah">full</code> mengukur tiap halaman dua kali
            per strategi; pada situs 141 halaman itu berjam-jam, bukan bermenit-menit
          </span>
        </label>

        <label className="atur-baris">
          <span className="atur-label">Alamat sitemap</span>
          <input
            className="atur-input"
            type="url"
            name="sitemap"
            placeholder="https://situs.com/sitemap.xml"
            defaultValue={awal.sitemap_url ?? ''}
          />
          {/* Disebut apa adanya bahwa nilainya belum dipakai. Medan yang
              tersimpan tapi tidak berpengaruh, tanpa keterangan, adalah
              pengaturan yang berbohong — orang mengisinya lalu menunggu
              sesuatu terjadi. */}
          <span className="atur-catatan">
            tersimpan tapi <strong>belum dipakai</strong> — aturan cakupan sitemap belum
            ada
          </span>
        </label>

        <label className="atur-baris atur-centang">
          <input type="checkbox" name="enabled" defaultChecked={awal.enabled === 1} />
          <span>
            <span className="atur-label">Ikut pemindaian terjadwal</span>
            <span className="atur-catatan">
              dimatikan berarti dilewati{' '}
              <code className="akun-perintah">scan -- jadwal</code>; riwayat dan
              temuannya tetap utuh, dan tombol pindai manual tetap jalan
            </span>
          </span>
        </label>

        <button className="tombol" type="submit">
          <Ikon nama="ceklis" ukuran={15} />
          {menunggu ? 'Menyimpan…' : 'Simpan'}
        </button>
      </fieldset>

      {sedangDipindai && (
        <p className="atur-galat" role="status">
          <Ikon nama="waktu" ukuran={13} />
          <span>
            Situs ini sedang dipindai. Pengaturan dikunci sampai selesai —{' '}
            <strong>batas halaman</strong> dibaca saat crawl dimulai, jadi mengubahnya
            di tengah jalan menghasilkan pemindaian yang setengah memakai nilai lama.
          </span>
        </p>
      )}

      {hasil?.error && (
        <p className="atur-galat" role="alert">
          <Ikon nama="alert" ukuran={13} />
          <span>{hasil.error}</span>
        </p>
      )}
    </form>
  )
}
