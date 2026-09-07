import type { BarisTemuan } from '../lib/ui/queries.ts'
import { SeverityChip } from './SeverityChip.tsx'

export function TabelTemuan({ baris }: { baris: BarisTemuan[] }) {
  return (
    <div className="tabel-bungkus">
      <table className="tabel">
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
              <td className="sel-url">{b.url ?? b.title}</td>
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
