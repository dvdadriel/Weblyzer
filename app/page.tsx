const SEVERITY = ['critical', 'high', 'medium', 'low', 'fixed', 'ignored'] as const
// Enam penanda untuk enam tingkat. Bobot visualnya menurun berurutan, jadi
// urutannya terbaca tanpa warna. Lihat DESIGN.md "Aturan warna".
const PENANDA: Record<string, string> = {
  critical: '[!!]', high: '[!]', medium: '[~]',
  low: '[.]', fixed: '[ok]', ignored: '[--]',
}

export default function Page() {
  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: 'var(--s-6) var(--s-4)' }}>
      <p style={{ fontFamily: 'var(--font-mark)', fontSize: 'var(--t-mark)', margin: 0 }}>
        audit
      </p>
      <p style={{ color: 'var(--ink-2)', fontSize: 'var(--t-data)' }}>
        Wordmark di atas adalah satu-satunya tempat Space Mono muncul.
      </p>

      <div
        style={{
          marginTop: 'var(--s-6)',
          padding: 'var(--s-4)',
          background: 'var(--surface)',
          borderRadius: 'var(--r-panel)',
          display: 'grid',
          gap: 'var(--s-2)',
        }}
      >
        {SEVERITY.map((s) => (
          <div key={s} style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'baseline' }}>
            <span
              style={{
                color: `var(--sev-${s})`,
                fontSize: 'var(--t-mikro)',
                fontWeight: 500,
              }}
            >
              {PENANDA[s]}
            </span>
            <span style={{ color: `var(--sev-${s})`, fontWeight: 500 }}>{s}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: 'var(--t-data)' }}>
              HTTP 500 pada /american-collection/accessories/divan
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}
