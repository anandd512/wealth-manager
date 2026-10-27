import { useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import type { CashFlowMonthSummary } from '../../../shared/types'
import { formatCurrency, formatMonthYear } from '../lib/format'

interface Props {
  summary: CashFlowMonthSummary[]
  onMonthClick?: (month: string) => void
}

// Colors are CSS custom properties (styles.css's :root / body.light-mode), each a
// dataviz-skill-validated categorical slot for its respective surface — resolved at
// render time so the chart re-themes automatically with the rest of the app instead
// of staying hardcoded dark. Each direction's three categories are an ordinal "how
// essential" sequence (salary/fixed first, discretionary last) riding that order.
const SERIES: { key: keyof CashFlowMonthSummary; label: string; color: string }[] = [
  { key: 'income_salary', label: 'Salary', color: 'var(--cf-income-1)' },
  { key: 'income_other_fixed', label: 'Other fixed income', color: 'var(--cf-income-2)' },
  { key: 'income_discretionary', label: 'Discretionary income', color: 'var(--cf-income-3)' },
  { key: 'income_uncategorized', label: 'Uncategorized', color: 'var(--cf-uncategorized)' },
  { key: 'expense_fixed_monthly', label: 'Fixed monthly expense', color: 'var(--cf-expense-1)' },
  { key: 'expense_other_fixed', label: 'Other fixed expense', color: 'var(--cf-expense-2)' },
  { key: 'expense_discretionary', label: 'Discretionary expense', color: 'var(--cf-expense-3)' },
  // Same color/label as income_uncategorized by design (#111) — legendType="none"
  // below keeps it off the legend so "Uncategorized" doesn't appear twice; the
  // segment itself still renders and is still named correctly in the tooltip.
  { key: 'expense_uncategorized', label: 'Uncategorized', color: 'var(--cf-uncategorized)' }
]

const RANGES: { label: string; months: number | null }[] = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'All', months: null }
]

function compactRupees(v: number): string {
  if (v === 0) return '0'
  if (Math.abs(v) >= 100000) return `${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`
  return String(v)
}

export default function CashFlowTrendChart({ summary, onMonthClick }: Props): JSX.Element {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1])
  const [asTable, setAsTable] = useState(false)

  const data = (range.months ? summary.slice(-range.months) : summary).map((m) => ({ ...m, net: m.income_total - m.expense_total }))

  // Only show a series (and its legend entry) if some month in the visible range
  // actually has it — "Uncategorized" in particular should disappear once
  // everything is classified.
  const activeSeries = SERIES.filter((s) => data.some((m) => (m[s.key] as number) > 0))
  const labelByKey = Object.fromEntries(activeSeries.map((s) => [s.key, s.label]))
  const lastIncomeIdx = activeSeries.map((s) => s.key.toString().startsWith('income_')).lastIndexOf(true)
  const lastExpenseIdx = activeSeries.map((s) => s.key.toString().startsWith('expense_')).lastIndexOf(true)

  if (asTable) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button type="button" className="btn secondary small" onClick={() => setAsTable(false)}>
            View as chart
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expense</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.month}>
                  <td>{formatMonthYear(m.month)}</td>
                  <td>{formatCurrency(m.income_total)}</td>
                  <td>{formatCurrency(m.expense_total)}</td>
                  <td>{formatCurrency(m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              className={`btn small ${range.label === r.label ? '' : 'secondary'}`}
              onClick={() => setRange(r)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn secondary small" onClick={() => setAsTable(true)}>
          View as table
        </button>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(m: string) => formatMonthYear(m, 'short')} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={compactRupees} width={40} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}
            labelStyle={{ color: 'var(--text-faint)' }}
            itemStyle={{ color: 'var(--text)' }}
            labelFormatter={(m) => formatMonthYear(String(m))}
            // Zero-value series (a category with nothing that month) are dropped
            // from the tooltip entirely rather than listed as "₹0" (#108).
            formatter={(v: unknown, name: unknown) => {
              if (Number(v) === 0) return null
              return [formatCurrency(Number(v)), name === 'net' ? 'Net' : labelByKey[String(name)] ?? String(name)]
            }}
          />
          <Legend formatter={(value: string) => (value === 'net' ? 'Net' : labelByKey[value] ?? value)} wrapperStyle={{ fontSize: 12, color: 'var(--text-faint)' }} />
          {activeSeries.map((s, i) => (
            <Bar
              key={String(s.key)}
              dataKey={s.key as string}
              stackId={s.key.toString().startsWith('income_') ? 'income' : 'expense'}
              fill={s.color}
              stroke="var(--bg-card)"
              strokeWidth={2}
              radius={i === lastIncomeIdx || i === lastExpenseIdx ? [4, 4, 0, 0] : 0}
              legendType={s.key === 'expense_uncategorized' ? 'none' : 'square'}
              cursor={onMonthClick ? 'pointer' : undefined}
              onClick={
                onMonthClick
                  ? (d: { payload?: { month?: string } }) => {
                      if (d.payload?.month) onMonthClick(d.payload.month)
                    }
                  : undefined
              }
            />
          ))}
          <Line type="monotone" dataKey="net" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
