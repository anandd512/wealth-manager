import type { Account } from '../db/accountsRepo'

/** Ported line-for-line from src/main/services/netWorth.ts's computeTotals/effectiveValue,
 * so mobile's total matches the desktop Dashboard's number exactly. */
function effectiveValue(a: Pick<Account, 'current_value' | 'ownership_pct'>): number {
  if (a.ownership_pct != null && a.ownership_pct < 100) {
    return (a.current_value * a.ownership_pct) / 100
  }
  return a.current_value
}

export function computeTotals(accounts: Account[]): {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
} {
  let totalAssets = 0
  let totalLiabilities = 0
  for (const a of accounts) {
    const v = effectiveValue(a)
    if (a.is_liability) totalLiabilities += v
    else totalAssets += v
  }
  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities }
}

/** Ported line-for-line from src/main/services/netWorth.ts's getBreakdownByCategory —
 * fixed/recurring deposits are split out of 'bank' so they don't get lumped in with
 * everyday savings/checking balances, same as desktop. */
export function getBreakdownByCategory(accounts: Account[]): { category: string; value: number }[] {
  const totals = new Map<string, number>()
  for (const a of accounts) {
    if (a.is_liability) continue
    const key = a.category === 'bank' && (a.subtype === 'fixed_deposit' || a.subtype === 'recurring_deposit') ? 'fixed_deposits' : a.category
    totals.set(key, (totals.get(key) ?? 0) + effectiveValue(a))
  }
  return Array.from(totals.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)
}
