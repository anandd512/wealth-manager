import { getDb } from '../db'
import { todayLocalDateString } from '../dateUtils'
import type { NetWorthSnapshot, Account } from '../../shared/types'

const todayStr = todayLocalDateString

type AccountTotalsRow = Pick<Account, 'is_liability' | 'current_value'> & { ownership_pct: number | null }

function effectiveValue(a: AccountTotalsRow): number {
  if (a.ownership_pct != null && a.ownership_pct < 100) {
    return a.current_value * a.ownership_pct / 100
  }
  return a.current_value
}

export function computeTotals(): { totalAssets: number; totalLiabilities: number; netWorth: number } {
  const accounts = getDb().prepare('SELECT is_liability, current_value, ownership_pct FROM accounts').all() as AccountTotalsRow[]
  let totalAssets = 0
  let totalLiabilities = 0
  for (const a of accounts) {
    const v = effectiveValue(a)
    if (a.is_liability) totalLiabilities += v
    else totalAssets += v
  }
  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities }
}

export function recordSnapshot(): NetWorthSnapshot {
  const { totalAssets, totalLiabilities, netWorth } = computeTotals()
  const date = todayStr()
  getDb()
    .prepare(
      `INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth)
       VALUES (@date, @totalAssets, @totalLiabilities, @netWorth)
       ON CONFLICT(snapshot_date) DO UPDATE SET
         total_assets=@totalAssets, total_liabilities=@totalLiabilities, net_worth=@netWorth`
    )
    .run({ date, totalAssets, totalLiabilities, netWorth })
  return getDb()
    .prepare('SELECT * FROM net_worth_snapshots WHERE snapshot_date = ?')
    .get(date) as NetWorthSnapshot
}

export function getHistory(): NetWorthSnapshot[] {
  return getDb()
    .prepare('SELECT * FROM net_worth_snapshots ORDER BY snapshot_date')
    .all() as NetWorthSnapshot[]
}

export function getBreakdownByCategory(): { category: string; value: number }[] {
  // Fixed/recurring deposits are split out of 'bank' so they don't get lumped in
  // with everyday savings/checking balances on the dashboard. Grouped in JS rather
  // than SQL: aliasing the grouping expression as "category" (same name as the real
  // column) makes SQLite's GROUP BY silently bind to the raw column instead of the
  // computed expression.
  const rows = getDb()
    .prepare(
      `SELECT category, subtype, current_value, ownership_pct FROM accounts WHERE is_liability = 0`
    )
    .all() as (Pick<Account, 'category' | 'subtype' | 'current_value'> & { ownership_pct: number | null })[]

  const totals = new Map<string, number>()
  for (const r of rows) {
    const key =
      r.category === 'bank' && (r.subtype === 'fixed_deposit' || r.subtype === 'recurring_deposit')
        ? 'fixed_deposits'
        : r.category
    const v = (r.ownership_pct != null && r.ownership_pct < 100)
      ? r.current_value * r.ownership_pct / 100
      : r.current_value
    totals.set(key, (totals.get(key) ?? 0) + v)
  }

  return Array.from(totals.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)
}
