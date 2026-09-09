'use client'

import { useState } from 'react'
import type { TemuanDemo } from '../lib/demo.ts'
import { SeverityChip } from './SeverityChip.tsx'

/**
 * Tabel temuan untuk halaman demo.
 *
 * Salinan yang DIPERKECIL dari `TabelTemuan`, bukan `TabelTemuan` dengan prop
 * `demo`. Duplikasi ini dipilih dengan sadar: `TabelTemuan` mengimpor server
 * action yang menulis (`ubahStatusTemuan`, `periksaTemuan`), dan menambahkan
 * mode ke sana berarti komponen produksi punya cabang yang, kalau salah,
 * menulis ke database sungguhan dari halaman publik.
 *
 * Yang hilang di sini memang seluruh alasannya: tidak ada Abaikan, tidak ada
 * Periksa Lagi, tidak ada satu pun jalur tulis. Yang tersisa persis yang
 * dibutuhkan demo — melihat temuan dan membuka detailnya.
 */
function jalur(url: string, baseUrl: string): string {
  return url.startsWith(baseUrl) ? url.slice(baseUrl.length) || '/' : url
}

function rapikan(detail: string): string {
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}

export function TabelDemo({
  baris,
  baseUrl,
  waktu,
}: {
  baris: TemuanDemo[]
  baseUrl: string
  waktu: string | null
}) {
  const [terbuka, setTerbuka] = useState<number | null>(null)

  if (baris.length === 0) {
    return (
      <div className="kosong">
        <h2 className="kosong-judul">Tidak ada temuan terbuka di kategori ini</h2>
        <p className="kosong-teks">
          Pemindaian berjalan dan tidak menemukan apa pun. Itu berbeda dari belum
          pernah dipindai — dan pembedaan itu dijaga di seluruh aplikasi.
        </p>
      </div>
    )
  }

  return (
    <div className="tabel-bungkus">
      <table className="tabel">
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
                    aria-controls={buka ? `demo-${b.id}` : undefined}
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
              buka ? (
                <tr key={`d-${b.id}`} id={`demo-${b.id}`} className="baris-detail">
                  <td colSpan={4}>
                    <p className="detail-judul">{b.title}</p>
                    <pre className="detail-json">{rapikan(b.detail_json)}</pre>
                  </td>
                </tr>
              ) : null,
            ]
          })}
        </tbody>
      </table>

      {/* Kaki tabel menyebut kapan kategori itu terakhir dipindai. Kolom
          "terlihat run 2–10" bukan waktu, dan di demo tidak ada apa pun lain
          yang menerjemahkannya. */}
      <p className="tabel-kaki">
        {baris.length} temuan terbuka.
        {waktu !== null && <span className="tabel-waktu">dipindai {waktu}</span>}
      </p>
    </div>
  )
}
