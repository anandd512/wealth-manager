import type { CashFlowTransaction } from '../../../shared/types'
import { formatCurrency, formatDate } from '../lib/format'

interface Props {
  transactions: CashFlowTransaction[]
  previousMonthExpenseTotal: number | null
}

export default function CashFlowInsights({ transactions, previousMonthExpenseTotal }: Props): JSX.Element | null {
  const expenses = transactions.filter((t) => t.direction === 'expense')
  if (expenses.length === 0) return null

  const topExpenses = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5)

  const byCategory = new Map<string, number>()
  for (const t of expenses) {
    const key = t.subcategory || t.category || 'Uncategorized'
    byCategory.set(key, (byCategory.get(key) ?? 0) + t.amount)
  }
  const biggestCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]

  const thisMonthTotal = expenses.reduce((sum, t) => sum + t.amount, 0)
  const vsLastMonth =
    previousMonthExpenseTotal != null && previousMonthExpenseTotal > 0
      ? ((thisMonthTotal - previousMonthExpenseTotal) / previousMonthExpenseTotal) * 100
      : null

  return (
    <div className="card section">
      <div className="section-header">
        <h2>Insights</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Top expenses this month</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
            {topExpenses.map((t) => (
              <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span>
                  {t.description} <span className="muted" style={{ fontSize: 11 }}>{formatDate(t.txn_date)}</span>
                </span>
                <span>{formatCurrency(t.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {biggestCategory && (
            <div style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>Biggest category</div>
              <div style={{ fontWeight: 600 }}>{biggestCategory[0]} — {formatCurrency(biggestCategory[1])}</div>
            </div>
          )}
          {vsLastMonth !== null && (
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Spending vs last month</div>
              <div style={{ fontWeight: 600, color: vsLastMonth > 0 ? 'var(--red)' : 'var(--green)' }}>
                {vsLastMonth > 0 ? '+' : ''}
                {vsLastMonth.toFixed(0)}%
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
