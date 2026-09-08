import type { Severity } from '../lib/findings.ts'

const PENANDA: Record<Severity, string> = {
  critical: '[!!]', high: '[!]', medium: '[~]', low: '[.]', info: '[i]',
}

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span
      className="chip"
      style={{
        color: `var(--sev-${severity})`,
        backgroundColor: `var(--sev-${severity}-bg)`,
        borderColor: `var(--sev-${severity})`,
      }}
    >
      <span aria-hidden="true" style={{ fontWeight: 700 }}>{PENANDA[severity]}</span>
      <span>{severity}</span>
    </span>
  )
}
