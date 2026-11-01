import { PiggyBank, Tag, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CashFlowTransaction } from '../../../shared/types'
import { formatCurrency } from '../lib/format'
import { categoryLabel, countsTowardPnl } from '../lib/cashFlowCategories'

interface Props {
  transactions: CashFlowTransaction[]
  // The like-for-like previous period (null when there isn't one, e.g. custom ranges).
  prevTransactions: CashFlowTransaction[] | null
  comparisonLabel: string | null
  periodPhrase: string // "this month", "this quarter", …
}

interface Sentence {
  icon: LucideIcon
  tone?: 'good' | 'bad'
  text: JSX.Element
}

function groupLabel(t: CashFlowTransaction): string {
  return t.subcategory?.trim() || categoryLabel(t.category, 'expense') || 'Uncategorized'
}

function spendByGroup(rows: CashFlowTransaction[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of rows) m.set(groupLabel(t), (m.get(groupLabel(t)) ?? 0) + t.amount)
  return m
}

const counted = (rows: CashFlowTransaction[], direction: 'income' | 'expense'): CashFlowTransaction[] =>
  rows.filter((t) => t.direction === direction && countsTowardPnl(t.category))

// Two or three plain sentences that say what the numbers mean — the thing a
// newcomer can't read off a chart, and a quick sanity check for an expert.
export default function CashFlowInsights({ transactions, prevTransactions, comparisonLabel, periodPhrase }: Props): JSX.Element | null {
  const income = counted(transactions, 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = counted(transactions, 'expense')
  const spent = expenses.reduce((s, t) => s + t.amount, 0)
  if (income === 0 && spent === 0) return null

  const sentences: Sentence[] = []

  // 1. What was left over.
  const net = income - spent
  if (income > 0 && net >= 0) {
    sentences.push({
      icon: PiggyBank,
      tone: 'good',
      text: (
        <>
          You kept <strong>{formatCurrency(net)}</strong> of the {formatCurrency(income)} that came in {periodPhrase} — a{' '}
          {Math.round((net / income) * 100)}% savings rate.
        </>
      )
    })
  } else if (income > 0) {
    sentences.push({
      icon: PiggyBank,
      tone: 'bad',
      text: (
        <>
          You spent <strong>{formatCurrency(-net)} more</strong> than came in {periodPhrase}.
        </>
      )
    })
  } else {
    sentences.push({
      icon: PiggyBank,
      text: (
        <>
          {formatCurrency(spent)} went out {periodPhrase}, with no money in recorded yet.
        </>
      )
    })
  }

  // 2. How spending moved, and what moved it most.
  const prevExpenses = prevTransactions ? counted(prevTransactions, 'expense') : []
  const prevSpent = prevExpenses.reduce((s, t) => s + t.amount, 0)
  if (comparisonLabel && prevSpent > 0 && spent > 0) {
    const pct = ((spent - prevSpent) / prevSpent) * 100
    if (Math.abs(pct) < 3) {
      sentences.push({ icon: Minus, text: <>Spending was about the same as {comparisonLabel}.</> })
    } else {
      const now = spendByGroup(expenses)
      const before = spendByGroup(prevExpenses)
      const up = pct > 0
      let driver: [string, number] | null = null
      for (const key of new Set([...now.keys(), ...before.keys()])) {
        const diff = (now.get(key) ?? 0) - (before.get(key) ?? 0)
        // Only a change in the same direction as the total explains it.
        if ((up ? diff > 0 : diff < 0) && (!driver || Math.abs(diff) > Math.abs(driver[1]))) driver = [key, diff]
      }
      sentences.push({
        icon: up ? TrendingUp : TrendingDown,
        tone: up ? 'bad' : 'good',
        text: (
          <>
            Spending was <strong>{Math.round(Math.abs(pct))}% {up ? 'higher' : 'lower'}</strong> than {comparisonLabel}
            {driver && (
              <>
                , mostly {up ? 'more' : 'less'} on {driver[0]} ({up ? '+' : '−'}
                {formatCurrency(Math.abs(driver[1]))})
              </>
            )}
            .
          </>
        )
      })
    }
  }

  // 3. Where most of it went.
  if (spent > 0) {
    const [topLabel, topAmount] = [...spendByGroup(expenses).entries()].sort((a, b) => b[1] - a[1])[0]
    sentences.push({
      icon: Tag,
      text: (
        <>
          <strong>{topLabel}</strong> was the biggest expense at {formatCurrency(topAmount)} ({Math.round((topAmount / spent) * 100)}% of
          spending).
        </>
      )
    })
  }

  return (
    <div className="card cf-insights section">
      {sentences.map((s, i) => {
        const Icon = s.icon
        return (
          <div key={i} className="cf-insight">
            <Icon className={`cf-insight-icon ${s.tone ?? ''}`} aria-hidden />
            <span>{s.text}</span>
          </div>
        )
      })}
    </div>
  )
}
