import type { Severity } from '../lib/findings.ts'

const PENANDA: Record<Severity, string> = {
  critical: '[!!]', high: '[!]', medium: '[~]', low: '[.]', info: '[--]',
}

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className="chip" style={{ color: `var(--sev-${severity})` }}>
      <span aria-hidden="true">{PENANDA[severity]}</span>
      <span>{severity}</span>
    </span>
  )
}
