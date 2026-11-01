import { useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import { ChartColumn, Table as TableIcon } from 'lucide-react'
import type { CashFlowMonthSummary } from '../../../shared/types'
import { formatCurrency, formatMonthYear } from '../lib/format'

interface Props {
  summary: CashFlowMonthSummary[]
  onMonthClick?: (month: string) => void
}

// Colors are CSS custom properties (styles.css's :root / body.light-mode) resolved at
// render time, so the chart re-themes with the rest of the app. Each direction gets
// one validated ordinal ramp — green for income, red-orange for expense — stepping
// from most essential (salary/fixed) to discretionary; see the --cf-* comment there.
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

  // Range and chart/table switches stay put in both views, so flipping to the table
  // doesn't lose the range or move the controls under the cursor.
  const controls = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
      <div className="segmented small" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.label} type="button" aria-pressed={range.label === r.label} onClick={() => setRange(r)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="segmented small" role="group" aria-label="Display as">
        <button type="button" aria-pressed={!asTable} onClick={() => setAsTable(false)}>
          <ChartColumn /> Chart
        </button>
        <button type="button" aria-pressed={asTable} onClick={() => setAsTable(true)}>
          <TableIcon /> Table
        </button>
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
                <th className="num">Income</th>
                <th className="num">Expense</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.month}>
                  <td>{formatMonthYear(m.month)}</td>
                  <td className="num">{formatCurrency(m.income_total)}</td>
                  <td className="num">{formatCurrency(m.expense_total)}</td>
                  <td className="num" style={m.net < 0 ? { color: 'var(--red)' } : undefined}>
                    {formatCurrency(m.net)}
                  </td>
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
      {controls}
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
