type BarisSkor = {
  url: string
  strategy: string
  perf: number | null
  a11y: number | null
  best_practices: number | null
  seo: number | null
}

/**
 * Membuang awalan domain dari URL yang ditampilkan — sama seperti di
 * `TabelTemuan`. Domainnya sudah tertulis di header, jadi mengulangnya membuat
 * dua puluhan karakter pertama tiap baris identik. URL utuh tetap di `title`.
 */
function jalur(url: string, baseUrl: string): string {
  return url.startsWith(baseUrl) ? url.slice(baseUrl.length) || '/' : url
}

/**
 * Pita skor Lighthouse: >= 90 baik, >= 50 sedang, sisanya buruk.
 *
 * Warnanya hanya penguat; angkanya selalu tercetak, jadi urutannya tetap
 * terbaca tanpa warna. `null` bukan nol — pengukuran yang tidak terjadi bukan
 * pengukuran bernilai nol — jadi ditulis `—` dengan `--ink-2`, bukan diberi
 * warna pita apa pun.
 */
function warna(n: number): string {
  if (n >= 90) return 'var(--sev-fixed)'
  if (n >= 50) return 'var(--sev-medium)'
  return 'var(--sev-critical)'
}

function SelSkor({ n }: { n: number | null }) {
  if (n === null) return <td className="sel-skor sel-kosong">—</td>
  return (
    <td className="sel-skor" style={{ color: warna(n) }}>
      {n}
    </td>
  )
}

export function GridSkor({ baris, baseUrl }: { baris: BarisSkor[]; baseUrl: string }) {
  return (
    <div className="tabel-bungkus">
      <table className="tabel">
        {/* Hanya `halaman` yang lentur; empat kolom skor berlebar sama supaya
            angkanya berbaris per kolom. */}
        <colgroup>
          <col />
          <col className="k-strategy" />
          <col className="k-skor" />
          <col className="k-skor" />
          <col className="k-skor" />
          <col className="k-skor" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">halaman</th>
            <th scope="col">strategy</th>
            <th scope="col" className="th-skor">perf</th>
            <th scope="col" className="th-skor">a11y</th>
            <th scope="col" className="th-skor">best</th>
            <th scope="col" className="th-skor">seo</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => (
            <tr key={`${b.url} ${b.strategy}`}>
              <td className="sel-url" title={b.url}>
                {jalur(b.url, baseUrl)}
              </td>
              <td>{b.strategy}</td>
              <SelSkor n={b.perf} />
              <SelSkor n={b.a11y} />
              <SelSkor n={b.best_practices} />
              <SelSkor n={b.seo} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tabel-kaki">{baris.length} pengukuran.</p>
    </div>
  )
}
