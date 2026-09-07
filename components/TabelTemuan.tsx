'use client'

import { useState, useTransition } from 'react'
import type { BarisTemuan } from '../lib/ui/queries.ts'
import { SeverityChip } from './SeverityChip.tsx'
import { ubahStatusTemuan } from '../app/actions.ts'
import { Ikon } from './Ikon.tsx'

/**
 * Membuang awalan domain dari URL yang ditampilkan.
 *
 * Domainnya sudah tertulis di header dua baris di atas, jadi mengulangnya di
 * setiap baris membuat 24 karakter pertama tiap baris identik — dan bagian yang
 * sebenarnya dipindai, yaitu path yang membedakan, baru mulai setelah itu.
 * URL utuh tetap tersimpan di `title` untuk saat dibutuhkan.
 */
function jalur(url: string, baseUrl: string): string {
  return url.startsWith(baseUrl) ? url.slice(baseUrl.length) || '/' : url
}

/**
 * `detail_json` datang dari pemindai dan tidak dijamin JSON valid. Kalau tidak
 * bisa di-parse, teks aslinya ditampilkan apa adanya — pengukuran yang ada
 * lebih berguna daripada pesan error yang menyembunyikannya.
 */
function rapikan(detail: string): string {
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}

function BarisDetail({
  b,
  status,
  path,
}: {
  b: BarisTemuan
  status: 'open' | 'ignored'
  path: string
}) {
  const [pending, mulai] = useTransition()
  return (
    <tr id={`detail-${b.id}`} className="baris-detail">
      {/* colSpan, bukan `display: block`: reflow lewat display menghapus
          semantik tabel di sebagian screen reader, dan navigasi per kolom
          adalah syarat di PRODUCT.md. */}
      <td colSpan={4}>
        <p className="detail-judul">{b.title}</p>
        <pre className="detail-json">{rapikan(b.detail_json)}</pre>
        <button
          type="button"
          className="tombol-teks"
          disabled={pending}
          onClick={() =>
            mulai(async () => {
              await ubahStatusTemuan(b.id, status === 'open' ? 'ignored' : 'open', path)
            })
          }
        >
          {status === 'open' ? 'Abaikan' : 'Buka Lagi'}
        </button>
      </td>
    </tr>
  )
}

export function TabelTemuan({
  baris,
  baseUrl,
  status = 'open',
  path,
  waktuScan,
}: {
  baris: BarisTemuan[]
  baseUrl: string
  status?: 'open' | 'ignored'
  path: string
  waktuScan: string | null
}) {
  const [terbuka, setTerbuka] = useState<number | null>(null)

  return (
    <div className="tabel-bungkus">
      <table className="tabel">
        {/* Urutan mengikuti kolom: severity, aturan, halaman, terlihat.
            Hanya `halaman` yang lentur — dialah yang panjang. */}
        <colgroup>
          <col className="k-sev" />
          <col className="k-rule" />
          <col />
          <col className="k-lihat" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Severity</th>
            <th scope="col">Aturan</th>
            <th scope="col">Halaman</th>
            <th scope="col">Terlihat</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => {
            const buka = terbuka === b.id
            return [
              <tr key={b.id}>
                <td>
                  <button
                    type="button"
                    className="tombol-sev"
                    aria-expanded={buka}
                    // Hanya saat terbuka: baris detail baru ada di DOM ketika
                    // mengembang, dan `aria-controls` yang menunjuk id yang
                    // tidak ada adalah referensi rusak — screen reader
                    // menawarkan "lompat ke elemen terkait" lalu tidak sampai
                    // ke mana pun. `aria-expanded` tetap selalu ada; itulah
                    // yang mengumumkan keadaannya.
                    aria-controls={buka ? `detail-${b.id}` : undefined}
                    onClick={() => setTerbuka(buka ? null : b.id)}
                  >
                    <SeverityChip severity={b.severity} />
                  </button>
                </td>
                <td className="sel-rule">{b.rule}</td>
                <td className="sel-url" title={b.url ?? undefined}>
                  {b.url === null ? b.title : jalur(b.url, baseUrl)}
                </td>
                <td className="sel-mikro">
                  run {b.first_seen_run}
                  {b.first_seen_run !== b.last_seen_run && `–${b.last_seen_run}`}
                </td>
              </tr>,
              // Dirender hanya saat mengembang: isinya tidak pernah ada di DOM
              // sambil disembunyikan menunggu animasi.
              buka ? (
                <BarisDetail key={`d-${b.id}`} b={b} status={status} path={path} />
              ) : null,
            ]
          })}
        </tbody>
      </table>
      {/* Waktu pemindaian ada di sini karena inilah pertanyaan yang dibawa
          pembaca tabel: apa yang saya lihat ini masih berlaku? Kolom
          `Terlihat run 2–10` tidak menjawabnya — nomor run bukan waktu, dan
          tidak ada apa pun di layar yang menerjemahkannya ke tanggal. */}
      <p className="tabel-kaki">
        {baris.length} temuan {status === 'open' ? 'terbuka' : 'diabaikan'}.
        {waktuScan !== null && (
          <span className="tabel-waktu">
            <Ikon nama="waktu" />
            dipindai {waktuScan}
          </span>
        )}
      </p>
    </div>
  )
}
