import type { BarisTemuan } from '../lib/ui/queries.ts'
import { SeverityChip } from './SeverityChip.tsx'

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

export function TabelTemuan({
  baris,
  baseUrl,
}: {
  baris: BarisTemuan[]
  baseUrl: string
}) {
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
            <th scope="col">severity</th>
            <th scope="col">aturan</th>
            <th scope="col">halaman</th>
            <th scope="col">terlihat</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => (
            <tr key={b.id}>
              <td><SeverityChip severity={b.severity} /></td>
              <td className="sel-rule">{b.rule}</td>
              <td className="sel-url" title={b.url ?? undefined}>
                {b.url === null ? b.title : jalur(b.url, baseUrl)}
              </td>
              <td className="sel-mikro">
                run {b.first_seen_run}
                {b.first_seen_run !== b.last_seen_run && `–${b.last_seen_run}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tabel-kaki">{baris.length} temuan terbuka.</p>
    </div>
  )
}
