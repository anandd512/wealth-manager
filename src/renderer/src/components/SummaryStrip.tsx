import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

export interface SummaryStat {
  label: string
  value: ReactNode
  // Plain-language explanation shown on hover of the ⓘ.
  hint?: string
  // Small line under the value (a comparison, a caveat, a name).
  note?: ReactNode
  // Colours the value — only for states that matter (owed, overdue, at risk).
  tone?: 'good' | 'bad' | 'warn'
}

// The row of headline numbers at the top of a tab — the same cards Cash Flow's
// summary uses, so every tab answers "where do I stand?" before the detail.
// Reflows from 4 across to 2×2 to a single column as the window narrows.
export default function SummaryStrip({ stats }: { stats: SummaryStat[] }): JSX.Element {
  return (
    <div className="cf-kpis section">
      {stats.map((s) => (
        <div key={s.label} className="card stat-card">
          <div className="label" title={s.hint}>
            {s.label}
            {s.hint && <Info aria-label={s.hint} className="cf-kpi-info" />}
          </div>
          <div className={`value ${s.tone === 'bad' ? 'negative' : s.tone === 'good' ? 'positive' : ''}`} style={s.tone === 'warn' ? { color: 'var(--amber)' } : undefined}>
            {s.value}
          </div>
          {s.note && <div className="cf-kpi-note">{s.note}</div>}
        </div>
      ))}
    </div>
  )
}
