import type { CashFlowCategory, CashFlowDirection } from '../../../shared/types'

interface CategoryOption {
  value: CashFlowCategory
  label: string
}

// Full descriptive wording — used wherever there's room for one option per line
// (the manual entry modal, the bulk-categorize dropdown).
export const INCOME_CATEGORIES_LONG: CategoryOption[] = [
  { value: 'salary', label: 'Salary' },
  { value: 'other_fixed', label: 'Other fixed income (interest, rent, dividends)' },
  { value: 'discretionary', label: 'Discretionary income (bonus, gift, refund)' },
  { value: 'reimbursement', label: 'Reimbursement (someone paying you back)' },
  { value: 'transfer', label: 'Transfer (from one of your own accounts)' }
]

export const EXPENSE_CATEGORIES_LONG: CategoryOption[] = [
  { value: 'fixed_monthly', label: 'Fixed monthly (rent, EMI, subscriptions)' },
  { value: 'other_fixed', label: 'Other fixed (insurance, fees, taxes)' },
  { value: 'discretionary', label: 'Discretionary (everything else)' },
  { value: 'transfer', label: 'Transfer (to one of your own accounts)' }
]

// Compact wording — used in dense table cells (the statement review table, inline
// category pickers in the ledger) where the long form would overflow a narrow column.
export const INCOME_CATEGORIES_SHORT: CategoryOption[] = [
  { value: 'salary', label: 'Salary' },
  { value: 'other_fixed', label: 'Other fixed' },
  { value: 'discretionary', label: 'Discretionary' },
  { value: 'reimbursement', label: 'Reimbursement' },
  { value: 'transfer', label: 'Transfer' }
]

export const EXPENSE_CATEGORIES_SHORT: CategoryOption[] = [
  { value: 'fixed_monthly', label: 'Fixed monthly' },
  { value: 'other_fixed', label: 'Other fixed' },
  { value: 'discretionary', label: 'Discretionary' },
  { value: 'transfer', label: 'Transfer' }
]

// Tracked and shown in the ledger like any other transaction, but excluded from
// income/expense totals and category breakdowns: 'reimbursement' is money coming back
// to the user, not new income; 'transfer' is money moving between the user's own
// accounts (a confirmed cross-account transfer or same-account reversal — see
// cashFlow.ts's reconcileTransfers) — neither is real income or real spending.
const PNL_EXCLUDED: CashFlowCategory[] = ['reimbursement', 'transfer']

export function countsTowardPnl(category: CashFlowCategory | null): boolean {
  return category === null || !PNL_EXCLUDED.includes(category)
}

// 'other_fixed' and 'discretionary' are valid for BOTH directions with different
// meanings — any lookup of a category's label must take direction into account
// rather than a single flat value->label map, or it'll show the wrong one.
export function categoriesFor(direction: CashFlowDirection, style: 'long' | 'short' = 'long'): CategoryOption[] {
  if (direction === 'income') return style === 'long' ? INCOME_CATEGORIES_LONG : INCOME_CATEGORIES_SHORT
  return style === 'long' ? EXPENSE_CATEGORIES_LONG : EXPENSE_CATEGORIES_SHORT
}

export function categoryLabel(
  category: CashFlowCategory | null,
  direction: CashFlowDirection,
  style: 'long' | 'short' = 'short'
): string | null {
  if (!category) return null
  return categoriesFor(direction, style).find((c) => c.value === category)?.label ?? category
}
