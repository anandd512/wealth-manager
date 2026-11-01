import { useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import type { CashFlowBudget, CashFlowTransaction } from '../../../shared/types'
import { CASH_FLOW_SUBCATEGORIES } from '../../../shared/types'
import { api } from '../lib/api'
import { formatCurrency, parseIndianAmount } from '../lib/format'
import { categoryLabel, countsTowardPnl } from '../lib/cashFlowCategories'
import Popover from './Popover'

interface Props {
  transactions: CashFlowTransaction[]
  budgets: CashFlowBudget[]
  // Months the period on screen spans — budgets are stored per month and scaled.
  periodMonths: number
  onBudgetsChanged: (b: CashFlowBudget[]) => void
}

const VISIBLE_ROWS = 6
const UNCATEGORIZED = '__uncategorized__'

interface SpendRow {
  key: string
  label: string
  spent: number
  budget: CashFlowBudget | null
}

// Same matching rule budgets have always used: a budget key is either a top-level
// category or a subcategory name.
function spentFor(key: string, expenses: CashFlowTransaction[]): number {
  return expenses.filter((t) => t.category === key || t.subcategory?.trim() === key).reduce((s, t) => s + t.amount, 0)
}

// "Where the money went" as a ranked bar list instead of a donut — lengths are easy
// to compare, every row carries its ₹ and %, and a budget shows as a marker on the
// same bar rather than in a separate card further down the page.
export default function CashFlowSpending({ transactions, budgets, periodMonths, onBudgetsChanged }: Props): JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const expenses = transactions.filter((t) => t.direction === 'expense' && countsTowardPnl(t.category))
  const total = expenses.reduce((s, t) => s + t.amount, 0)

  // Group by the most specific name available: subcategory, else category.
  const groups = new Map<string, SpendRow>()
  for (const t of expenses) {
    const sub = t.subcategory?.trim()
    const key = sub || t.category || UNCATEGORIZED
    const label = sub || categoryLabel(t.category, 'expense') || 'Uncategorized'
    const row = groups.get(key) ?? { key, label, spent: 0, budget: null }
    row.spent += t.amount
    groups.set(key, row)
  }
  for (const b of budgets) {
    const row = groups.get(b.key)
    if (row) row.budget = b
    // A budget with nothing in its own group (no spend yet, or a category-level
    // budget while spending is split by subcategory) still gets a row.
    else groups.set(b.key, { key: b.key, label: b.label, spent: spentFor(b.key, expenses), budget: b })
  }

  const rows = [...groups.values()].sort((a, b) => b.spent - a.spent || a.label.localeCompare(b.label))
  const shown = showAll ? rows : rows.slice(0, VISIBLE_ROWS)
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.spent, (r.budget?.monthlyAmount ?? 0) * periodMonths)))

  const saveBudgets = async (next: CashFlowBudget[]): Promise<void> => {
    await api().cashFlow.setBudgets(next)
    onBudgetsChanged(next)
  }
  const setBudget = (key: string, label: string, monthlyAmount: number | null): Promise<void> => {
    const rest = budgets.filter((b) => b.key !== key)
    return saveBudgets(monthlyAmount === null ? rest : [...rest, { key, label, monthlyAmount }])
  }

  if (rows.length === 0) {
    return (
      <div className="cf-spend-empty">
        <p className="muted">No spending in this period yet.</p>
        <AddBudget existing={budgets} onSave={setBudget} />
      </div>
    )
  }

  return (
    <div>
      <div className="cf-spend-list">
        {shown.map((r) => {
          const periodBudget = r.budget ? r.budget.monthlyAmount * periodMonths : null
          const pct = periodBudget ? (r.spent / periodBudget) * 100 : null
          const status = pct === null ? null : pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok'
          return (
            <div key={r.key} className="cf-spend-row">
              <div className="cf-spend-head">
                <span className="cf-spend-label" title={r.label}>
                  {r.label}
                </span>
                <span className="num">
                  {formatCurrency(r.spent)}
                  <span className="cf-spend-pct">{total > 0 ? `${Math.round((r.spent / total) * 100)}%` : ''}</span>
                </span>
              </div>
              <div className="cf-spend-track">
                <div
                  className={`cf-spend-fill ${status === 'over' ? 'over' : status === 'near' ? 'near' : ''}`}
                  style={{ width: `${(r.spent / scale) * 100}%` }}
                />
                {periodBudget !== null && (
                  <div className="cf-spend-marker" style={{ left: `${Math.min(100, (periodBudget / scale) * 100)}%` }} title="Budget" />
                )}
              </div>
              <div className="cf-spend-sub">
                {periodBudget !== null && status === 'over' && (
                  <span className="cf-spend-over">
                    <AlertTriangle size={12} aria-hidden /> {formatCurrency(r.spent - periodBudget)} over the{' '}
                    {formatCurrency(periodBudget)} budget
                  </span>
                )}
                {periodBudget !== null && status !== 'over' && (
                  <span className={status === 'near' ? 'cf-spend-near' : undefined}>
                    {formatCurrency(periodBudget - r.spent)} left of {formatCurrency(periodBudget)}
                    {status === 'near' ? ' — nearly there' : ''}
                  </span>
                )}
                {r.key !== UNCATEGORIZED && (
                  <BudgetEditor
                    label={r.label}
                    current={r.budget?.monthlyAmount ?? null}
                    periodMonths={periodMonths}
                    onSave={(amount) => setBudget(r.key, r.label, amount)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="cf-spend-footer">
        {rows.length > VISIBLE_ROWS ? (
          <button type="button" className="cf-link-btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show top 6' : `Show all ${rows.length}`}
          </button>
        ) : (
          <span />
        )}
        <AddBudget existing={budgets} onSave={setBudget} />
      </div>
    </div>
  )
}

function AmountField({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <div className="cf-amount-field">
      <span aria-hidden>₹</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. 8,000" aria-label="Monthly amount" />
      <span className="muted">/month</span>
    </div>
  )
}

function BudgetEditor({
  label,
  current,
  periodMonths,
  onSave
}: {
  label: string
  current: number | null
  periodMonths: number
  onSave: (amount: number | null) => Promise<void>
}): JSX.Element {
  const [text, setText] = useState(current != null ? String(current) : '')
  const parsed = parseIndianAmount(text)
  const valid = parsed !== null && parsed > 0
  return (
    <Popover
      triggerClassName="cf-link-btn cf-spend-edit"
      trigger={current != null ? 'Edit budget' : 'Set budget'}
      ariaLabel={`Budget for ${label}`}
      align="right"
    >
      {(close) => (
        <form
          className="cf-popover-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            void onSave(parsed).then(close)
          }}
        >
          <div className="cf-popover-title">Monthly budget · {label}</div>
          <AmountField value={text} onChange={setText} />
          {periodMonths !== 1 && valid && (
            <div className="help-text">
              {formatCurrency(parsed * periodMonths)} for the period on screen ({periodMonths.toFixed(1)} months)
            </div>
          )}
          {text && !valid && <div className="help-text" style={{ color: 'var(--red)' }}>Enter an amount above zero.</div>}
          <div className="cf-popover-actions">
            {current != null && (
              <button type="button" className="btn secondary small cf-danger" onClick={() => void onSave(null).then(close)}>
                Remove
              </button>
            )}
            <button type="submit" className="btn small" disabled={!valid}>
              Save
            </button>
          </div>
        </form>
      )}
    </Popover>
  )
}

function AddBudget({
  existing,
  onSave
}: {
  existing: CashFlowBudget[]
  onSave: (key: string, label: string, amount: number | null) => Promise<void>
}): JSX.Element {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const parsed = parseIndianAmount(text)
  const valid = name.trim() !== '' && parsed !== null && parsed > 0
  const taken = new Set(existing.map((b) => b.key.toLowerCase()))
  return (
    <Popover
      triggerClassName="cf-link-btn"
      trigger={
        <>
          <Plus size={12} /> Add a budget
        </>
      }
      ariaLabel="Add a budget"
      align="right"
    >
      {(close) => (
        <form
          className="cf-popover-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            const key = name.trim()
            void onSave(key, key, parsed).then(() => {
              setName('')
              setText('')
              close()
            })
          }}
        >
          <div className="cf-popover-title">New monthly budget</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category, e.g. Groceries"
            list="cf-budget-names"
            aria-label="Budget category"
          />
          <datalist id="cf-budget-names">
            {CASH_FLOW_SUBCATEGORIES.filter((s) => !taken.has(s.toLowerCase())).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <AmountField value={text} onChange={setText} />
          <div className="help-text">Matches transactions whose subcategory has this name.</div>
          <div className="cf-popover-actions">
            <button type="submit" className="btn small" disabled={!valid}>
              Save
            </button>
          </div>
        </form>
      )}
    </Popover>
  )
}
