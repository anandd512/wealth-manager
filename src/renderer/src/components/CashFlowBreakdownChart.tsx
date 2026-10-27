import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import type { CashFlowTransaction } from '../../../shared/types'
import { formatCurrency } from '../lib/format'

interface Props {
  transactions: CashFlowTransaction[]
}

// Same validated categorical order as the rest of the cash flow page (styles.css's
// --cf-cat-N, light/dark aware) — reused here rather than re-picked, so a
// subcategory reads as the same color wherever it shows up. Subcategories are free
// text (unbounded), so this caps at the palette's safe count and folds the rest into
// "Other" rather than cycling hues.
const PALETTE = [
  'var(--cf-cat-1)',
  'var(--cf-cat-2)',
  'var(--cf-cat-3)',
  'var(--cf-cat-4)',
  'var(--cf-cat-5)',
  'var(--cf-cat-6)',
  'var(--cf-cat-7)'
]
const MAX_SLICES = 7

export default function CashFlowBreakdownChart({ transactions }: Props): JSX.Element | null {
  const expense = transactions.filter((t) => t.direction === 'expense')
  if (expense.length === 0) return null

  const byLabel = new Map<string, number>()
  for (const t of expense) {
    const label = t.subcategory?.trim() || t.category || 'Uncategorized'
    byLabel.set(label, (byLabel.get(label) ?? 0) + t.amount)
  }
  const sorted = [...byLabel.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, MAX_SLICES)
  const rest = sorted.slice(MAX_SLICES)
  const data = [...top]
  if (rest.length > 0) {
    data.push(['Other', rest.reduce((sum, [, v]) => sum + v, 0)])
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data.map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map(([name], i) => (
            // "Other" gets the dedicated neutral (same role as Uncategorized
            // elsewhere) rather than wrapping back to PALETTE[0] and colliding with
            // whichever top category actually holds that slot.
            <Cell key={i} fill={name === 'Other' ? 'var(--cf-uncategorized)' : PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}
          labelStyle={{ color: 'var(--text-faint)' }}
          itemStyle={{ color: 'var(--text)' }}
          formatter={(v: unknown) => formatCurrency(Number(v))}
        />
        <Legend
          layout="horizontal"
          verticalAlign="bottom"
          wrapperStyle={{ fontSize: 12, color: 'var(--text-faint)', paddingTop: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
