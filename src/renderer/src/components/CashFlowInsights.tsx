import type { CashFlowTransaction } from '../../../shared/types'
import { formatCurrency, formatDate } from '../lib/format'
import { categoryLabel, countsTowardPnl } from '../lib/cashFlowCategories'

interface Props {
  transactions: CashFlowTransaction[]
  // Expense total for the period before the one on screen (same length), and how to
  // name it — null when there's nothing like-for-like to compare against.
  previousExpenseTotal: number | null
  comparisonLabel: string | null
}

export default function CashFlowInsights({ transactions, previousExpenseTotal, comparisonLabel }: Props): JSX.Element | null {
  const expenses = transactions.filter((t) => t.direction === 'expense' && countsTowardPnl(t.category))
  if (expenses.length === 0) return null

  const topExpenses = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5)

  const byCategory = new Map<string, number>()
  for (const t of expenses) {
    const key = t.subcategory?.trim() || categoryLabel(t.category, 'expense') || 'Uncategorized'
    byCategory.set(key, (byCategory.get(key) ?? 0) + t.amount)
  }
  const biggestCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]

  const periodTotal = expenses.reduce((sum, t) => sum + t.amount, 0)
  const vsPrevious =
    previousExpenseTotal != null && previousExpenseTotal > 0
      ? ((periodTotal - previousExpenseTotal) / previousExpenseTotal) * 100
      : null

  return (
    <div className="card section">
      <div className="section-header">
        <h2>Insights</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Largest expenses</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
            {topExpenses.map((t) => (
              <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span>
                  {t.description} <span className="muted" style={{ fontSize: 11 }}>{formatDate(t.txn_date)}</span>
                </span>
                <span className="num">{formatCurrency(t.amount)}</span>
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
          {vsPrevious !== null && comparisonLabel && (
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Spending vs {comparisonLabel}</div>
              <div style={{ fontWeight: 600, color: vsPrevious > 0 ? 'var(--red)' : 'var(--green)' }}>
                {vsPrevious > 0 ? '+' : ''}
                {vsPrevious.toFixed(0)}%
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
