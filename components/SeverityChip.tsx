import type { Severity } from '../lib/findings.ts'
import { GLIF } from '../lib/glif.ts'

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className="chip" style={{ color: `var(--sev-${severity})` }}>
      {/* `aria-hidden` karena kata di sebelahnya sudah menyebutkan tingkatnya;
          tanpa itu screen reader mengumumkan "tanda silang critical". */}
      <span aria-hidden="true" className="chip-glif">
        {GLIF[severity]}
      </span>
      <span>{severity}</span>
    </span>
  )
}
