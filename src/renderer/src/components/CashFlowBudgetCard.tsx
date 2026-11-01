import { useState } from 'react'
import { api } from '../lib/api'
import { Plus, Trash2 } from 'lucide-react'
import type { CashFlowBudget, CashFlowCategory, CashFlowSavingsGoal, CashFlowTransaction } from '../../../shared/types'
import { formatCurrency, parseIndianAmount } from '../lib/format'
import { categoriesFor } from '../lib/cashFlowCategories'

interface Props {
  budgets: CashFlowBudget[]
  savingsGoal: CashFlowSavingsGoal
  transactions: CashFlowTransaction[]
  netThisPeriod: number
  // Months the period on screen spans — budgets and the goal are stored per month
  // and scaled by this, so a quarter is measured against 3× the monthly amount.
  periodMonths: number
  periodPhrase: string
  onBudgetsChanged: (b: CashFlowBudget[]) => void
  onGoalChanged: (g: CashFlowSavingsGoal) => void
}

// Same parser as the entry modal, so "20,000" or "₹20000" isn't saved as NaN.
function parsePositiveAmount(text: string): number | null {
  const n = parseIndianAmount(text)
  return n !== null && n > 0 ? n : null
}

// 'transfer' is excluded here specifically — budgeting for money moving to your own
// other accounts doesn't mean anything, even though it's a selectable category
// elsewhere in the ledger.
const EXPENSE_CATEGORIES = categoriesFor('expense', 'short').filter((c) => c.value !== 'transfer')

function spentFor(key: string, transactions: CashFlowTransaction[]): number {
  return transactions
    .filter((t) => t.direction === 'expense' && (t.category === key || t.subcategory === key))
    .reduce((sum, t) => sum + t.amount, 0)
}

function barColor(pct: number): string {
  if (pct >= 100) return 'var(--red)'
  if (pct >= 80) return 'var(--amber)'
  return 'var(--green)'
}

export default function CashFlowBudgetCard({
  budgets,
  savingsGoal,
  transactions,
  netThisPeriod,
  periodMonths,
  periodPhrase,
  onBudgetsChanged,
  onGoalChanged
}: Props): JSX.Element {
  const [newCategory, setNewCategory] = useState<CashFlowCategory | ''>('')
  const [newAmount, setNewAmount] = useState('')
  const [goalText, setGoalText] = useState(savingsGoal.monthlyTarget != null ? String(savingsGoal.monthlyTarget) : '')
  const [goalError, setGoalError] = useState<string | null>(null)

  const newAmountParsed = parsePositiveAmount(newAmount)
  const periodGoal = savingsGoal.monthlyTarget != null ? savingsGoal.monthlyTarget * periodMonths : null

  const addBudget = async (): Promise<void> => {
    if (!newCategory || newAmountParsed === null) return
    const label = EXPENSE_CATEGORIES.find((c) => c.value === newCategory)?.label ?? newCategory
    const next = [...budgets.filter((b) => b.key !== newCategory), { key: newCategory, label, monthlyAmount: newAmountParsed }]
    await api().cashFlow.setBudgets(next)
    onBudgetsChanged(next)
    setNewCategory('')
    setNewAmount('')
  }

  const removeBudget = async (key: string): Promise<void> => {
    const next = budgets.filter((b) => b.key !== key)
    await api().cashFlow.setBudgets(next)
    onBudgetsChanged(next)
  }

  const saveGoal = async (): Promise<void> => {
    const trimmed = goalText.trim()
    const parsed = trimmed ? parsePositiveAmount(trimmed) : null
    if (trimmed && parsed === null) {
      setGoalError('Enter an amount greater than zero, e.g. 20,000.')
      return
    }
    setGoalError(null)
    const goal = { monthlyTarget: parsed }
    await api().cashFlow.setSavingsGoal(goal)
    onGoalChanged(goal)
  }

  return (
    <div className="card section">
      <div className="section-header">
        <h2>Budgets & savings goal</h2>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Monthly savings goal</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            onBlur={saveGoal}
            placeholder="e.g. 20000"
            style={{ width: 120 }}
            aria-label="Monthly savings goal"
          />
          {periodGoal != null && periodGoal > 0 && (
            <span style={{ fontSize: 12 }} className="muted">
              {Math.max(0, Math.round((netThisPeriod / periodGoal) * 100))}% of {formatCurrency(periodGoal)} reached{' '}
              {periodPhrase}
            </span>
          )}
        </div>
        {/* Progress toward the goal is shown on the "Left over" summary card. */}
        {goalError && <div className="help-text" style={{ color: 'var(--red)' }}>{goalError}</div>}
      </div>

      {budgets.map((b) => {
        const spent = spentFor(b.key, transactions)
        const periodBudget = b.monthlyAmount * periodMonths
        const pct = periodBudget > 0 ? (spent / periodBudget) * 100 : 0
        return (
          <div key={b.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span>{b.label}</span>
              <span title={periodMonths !== 1 ? `${formatCurrency(b.monthlyAmount)}/month × ${periodMonths.toFixed(1)} months` : undefined}>
                {formatCurrency(spent)} / {formatCurrency(periodBudget)}
                <button type="button" className="icon-btn" style={{ marginLeft: 6 }} onClick={() => removeBudget(b.key)} title="Remove budget">
                  <Trash2 size={12} />
                </button>
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-inset)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: barColor(pct) }} />
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as CashFlowCategory | '')} aria-label="New budget category">
          <option value="">Add a budget…</option>
          {EXPENSE_CATEGORIES.filter((c) => !budgets.some((b) => b.key === c.value)).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
          placeholder="₹/month"
          style={{ width: 90 }}
          aria-label="Budget amount"
        />
        <button type="button" className="btn secondary small" onClick={addBudget} disabled={!newCategory || newAmountParsed === null}>
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  )
}
