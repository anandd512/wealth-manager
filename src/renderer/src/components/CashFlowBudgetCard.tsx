import { useState } from 'react'
import { api } from '../lib/api'
import { Plus, Trash2 } from 'lucide-react'
import type { CashFlowBudget, CashFlowCategory, CashFlowSavingsGoal, CashFlowTransaction } from '../../../shared/types'
import { formatCurrency } from '../lib/format'
import { categoriesFor } from '../lib/cashFlowCategories'

interface Props {
  budgets: CashFlowBudget[]
  savingsGoal: CashFlowSavingsGoal
  transactions: CashFlowTransaction[]
  netThisMonth: number
  onBudgetsChanged: (b: CashFlowBudget[]) => void
  onGoalChanged: (g: CashFlowSavingsGoal) => void
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
  netThisMonth,
  onBudgetsChanged,
  onGoalChanged
}: Props): JSX.Element {
  const [newCategory, setNewCategory] = useState<CashFlowCategory | ''>('')
  const [newAmount, setNewAmount] = useState('')
  const [goalText, setGoalText] = useState(savingsGoal.monthlyTarget != null ? String(savingsGoal.monthlyTarget) : '')

  const addBudget = async (): Promise<void> => {
    if (!newCategory || !newAmount) return
    const label = EXPENSE_CATEGORIES.find((c) => c.value === newCategory)?.label ?? newCategory
    const next = [...budgets.filter((b) => b.key !== newCategory), { key: newCategory, label, monthlyAmount: Number(newAmount) }]
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
    const goal = { monthlyTarget: goalText ? Number(goalText) : null }
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
          {savingsGoal.monthlyTarget != null && savingsGoal.monthlyTarget > 0 && (
            <span style={{ fontSize: 12 }} className="muted">
              {Math.max(0, Math.round((netThisMonth / savingsGoal.monthlyTarget) * 100))}% reached this month
            </span>
          )}
        </div>
        {savingsGoal.monthlyTarget != null && savingsGoal.monthlyTarget > 0 && (
          <div style={{ height: 6, background: 'var(--bg-inset)', borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, (netThisMonth / savingsGoal.monthlyTarget) * 100))}%`,
                background: netThisMonth >= savingsGoal.monthlyTarget ? 'var(--green)' : 'var(--accent)'
              }}
            />
          </div>
        )}
      </div>

      {budgets.map((b) => {
        const spent = spentFor(b.key, transactions)
        const pct = b.monthlyAmount > 0 ? (spent / b.monthlyAmount) * 100 : 0
        return (
          <div key={b.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span>{b.label}</span>
              <span>
                {formatCurrency(spent)} / {formatCurrency(b.monthlyAmount)}
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
        <button type="button" className="btn secondary small" onClick={addBudget} disabled={!newCategory || !newAmount}>
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  )
}
