import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import type { CashFlowMonthSummary } from '../../../shared/types'
import { formatCurrency, formatMonthYear } from '../lib/format'

interface Props {
  summary: CashFlowMonthSummary[]
  months?: number
}

const SERIES_LABELS: Record<string, string> = {
  income_total: 'Income',
  expense_total: 'Expense',
  net: 'Net'
}

// A simple 3-line overview (not the detailed per-category breakdown — see
// CashFlowTrendChart for that) — income/expense use the app's own established
// positive/negative semantic colors (same as the stat cards elsewhere), which is the
// intuitive choice here and doesn't collide with anything.
export default function IncomeExpenseTrendChart({ summary, months = 6 }: Props): JSX.Element {
  const data = summary.slice(-months)
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid stroke="var(--border-soft)" strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          stroke="var(--text-faint)"
          fontSize={11}
          tickFormatter={(m: string) => formatMonthYear(m, 'short')}
        />
        <YAxis stroke="var(--text-faint)" fontSize={11} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} width={40} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}
          labelStyle={{ color: 'var(--text-faint)' }}
          itemStyle={{ color: 'var(--text)' }}
          labelFormatter={(m) => formatMonthYear(String(m))}
          formatter={(v: unknown, name: unknown) => [formatCurrency(Number(v)), SERIES_LABELS[String(name)] ?? String(name)]}
        />
        <Legend formatter={(value: string) => SERIES_LABELS[value] ?? value} wrapperStyle={{ fontSize: 12, color: 'var(--text-faint)' }} />
        <Line type="monotone" dataKey="income_total" stroke="var(--green)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="expense_total" stroke="var(--red)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="net" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
