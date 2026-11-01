import { useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts'
import { ChartColumn, Table as TableIcon } from 'lucide-react'
import type { CashFlowMonthSummary } from '../../../shared/types'
import { formatCurrency, formatMonthYear } from '../lib/format'

interface Props {
  summary: CashFlowMonthSummary[]
  onMonthClick?: (month: string) => void
  // The period on screen — its months render at full strength, the rest recede.
  highlight?: { start: string; end: string }
}

// Deliberately just two bars a month — money in vs money out. The per-category
// stack (7 series + a smoothed net line) was too much to read at a glance, and the
// smoothing drew net dips between months that never happened. Net and the split
// live in the tooltip and the table view; categories live in "Where the money went".
// --cf-in / --cf-out are a validated pair (styles.css).
const RANGES: { label: string; months: number | null }[] = [
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'All', months: null }
]

// Months outside the period on screen stay readable but recede.
const DIMMED = 0.45

function compactRupees(v: number): string {
  if (v === 0) return '0'
  if (Math.abs(v) >= 100000) return `${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`
  return String(v)
}

interface Row {
  month: string
  income_total: number
  expense_total: number
  net: number
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }): JSX.Element | null {
  if (!active || !payload?.length) return null
  const m = payload[0].payload
  return (
    <div className="cf-tooltip">
      <div className="cf-tooltip-title">{formatMonthYear(m.month)}</div>
      <div className="cf-tooltip-row">
        <span className="chip-dot" style={{ background: 'var(--cf-in)' }} />
        Money in <span className="num">{formatCurrency(m.income_total)}</span>
      </div>
      <div className="cf-tooltip-row">
        <span className="chip-dot" style={{ background: 'var(--cf-out)' }} />
        Money out <span className="num">{formatCurrency(m.expense_total)}</span>
      </div>
      <div className="cf-tooltip-row cf-tooltip-total">
        Left over
        <span className="num" style={m.net < 0 ? { color: 'var(--red)' } : undefined}>
          {m.net < 0 ? '−' : ''}
          {formatCurrency(Math.abs(m.net))}
        </span>
      </div>
    </div>
  )
}

export default function CashFlowTrendChart({ summary, onMonthClick, highlight }: Props): JSX.Element {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0])
  const [asTable, setAsTable] = useState(false)

  const data: Row[] = (range.months ? summary.slice(-range.months) : summary).map((m) => ({
    month: m.month,
    income_total: m.income_total,
    expense_total: m.expense_total,
    net: m.income_total - m.expense_total
  }))

  // "Jun" is enough within one year; once the range crosses a year, "Jun '26".
  const spansYears = new Set(data.map((m) => m.month.slice(0, 4))).size > 1
  const tickLabel = (m: string): string => {
    const [mon, yr] = formatMonthYear(m, 'short').split(' ')
    return spansYears ? `${mon} '${yr.slice(2)}` : mon
  }

  const inHighlight = (month: string): boolean =>
    !highlight || (month >= highlight.start.slice(0, 7) && month <= highlight.end.slice(0, 7))

  const controls = (
    <div className="cf-chart-controls">
      <div className="cf-legend" aria-hidden={asTable}>
        {!asTable && (
          <>
            <span>
              <span className="chip-dot" style={{ background: 'var(--cf-in)' }} /> Money in
            </span>
            <span>
              <span className="chip-dot" style={{ background: 'var(--cf-out)' }} /> Money out
            </span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <div className="segmented small" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.label} type="button" aria-pressed={range.label === r.label} onClick={() => setRange(r)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="segmented small" role="group" aria-label="Display as">
          <button type="button" aria-pressed={!asTable} onClick={() => setAsTable(false)} title="Chart" aria-label="Chart">
            <ChartColumn />
          </button>
          <button type="button" aria-pressed={asTable} onClick={() => setAsTable(true)} title="Table" aria-label="Table">
            <TableIcon />
          </button>
        </div>
      </div>
    </div>
  )

  if (asTable) {
    return (
      <div>
        {controls}
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">In</th>
                <th className="num">Out</th>
                <th className="num">Left over</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{formatMonthYear(m.month)}</td>
                  <td className="num">{formatCurrency(m.income_total)}</td>
                  <td className="num">{formatCurrency(m.expense_total)}</td>
                  <td className="num" style={m.net < 0 ? { color: 'var(--red)' } : undefined}>
                    {m.net < 0 ? '−' : ''}
                    {formatCurrency(Math.abs(m.net))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const clickable = onMonthClick
    ? {
        cursor: 'pointer',
        onClick: (d: { payload?: { month?: string } }) => {
          if (d.payload?.month) onMonthClick(d.payload.month)
        }
      }
    : {}

  return (
    <div>
      {controls}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={3} barCategoryGap="28%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border-soft)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--text-faint)' }}
            tickFormatter={tickLabel}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-faint)' }}
            tickFormatter={compactRupees}
            width={36}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--bg-card-hover)' }} />
          <Bar dataKey="income_total" name="Money in" fill="var(--cf-in)" radius={[4, 4, 0, 0]} maxBarSize={16} {...clickable}>
            {data.map((m) => (
              <Cell key={m.month} fillOpacity={inHighlight(m.month) ? 1 : DIMMED} />
            ))}
          </Bar>
          <Bar dataKey="expense_total" name="Money out" fill="var(--cf-out)" radius={[4, 4, 0, 0]} maxBarSize={16} {...clickable}>
            {data.map((m) => (
              <Cell key={m.month} fillOpacity={inHighlight(m.month) ? 1 : DIMMED} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {onMonthClick && <div className="cf-chart-hint">Click a month to open it</div>}
    </div>
  )
}
