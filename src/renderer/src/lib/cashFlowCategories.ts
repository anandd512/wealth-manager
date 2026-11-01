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

// The names people actually think in ("Groceries", "Rent"), each with the
// category it counts toward by default. Picking one of these sets both fields, so
// a newcomer never has to know what "discretionary" means — and an expert can
// still override the category for any transaction. Grouped by category in the
// picker, in this order.
export interface EverydayCategory {
  name: string
  category: CashFlowCategory
}

export const EVERYDAY_CATEGORIES: Record<CashFlowDirection, EverydayCategory[]> = {
  expense: [
    { name: 'Rent / Housing', category: 'fixed_monthly' },
    { name: 'Bills & Utilities', category: 'fixed_monthly' },
    { name: 'EMI / Loans', category: 'fixed_monthly' },
    { name: 'Subscriptions', category: 'fixed_monthly' },
    { name: 'Insurance', category: 'other_fixed' },
    { name: 'Taxes & Fees', category: 'other_fixed' },
    { name: 'Education', category: 'other_fixed' },
    { name: 'Groceries', category: 'discretionary' },
    { name: 'Food & Dining', category: 'discretionary' },
    { name: 'Transport', category: 'discretionary' },
    { name: 'Shopping', category: 'discretionary' },
    { name: 'Healthcare', category: 'discretionary' },
    { name: 'Entertainment', category: 'discretionary' },
    { name: 'Travel', category: 'discretionary' },
    { name: 'Other', category: 'discretionary' },
    { name: 'Transfers', category: 'transfer' }
  ],
  income: [
    { name: 'Salary', category: 'salary' },
    { name: 'Interest / Dividends', category: 'other_fixed' },
    { name: 'Rental income', category: 'other_fixed' },
    { name: 'Bonus', category: 'discretionary' },
    { name: 'Gifts', category: 'discretionary' },
    { name: 'Other', category: 'discretionary' },
    { name: 'Refunds', category: 'reimbursement' },
    { name: 'Transfers', category: 'transfer' }
  ]
}

// Plain-language name for each category when it heads a group in the picker.
export const CATEGORY_GROUP_TITLE: Record<CashFlowDirection, Partial<Record<CashFlowCategory, string>>> = {
  expense: {
    fixed_monthly: 'Fixed every month',
    other_fixed: 'Fixed, but not monthly',
    discretionary: 'Everyday spending',
    transfer: 'Not counted — your own money moving'
  },
  income: {
    salary: 'Salary',
    other_fixed: 'Regular income',
    discretionary: 'One-off income',
    reimbursement: 'Not counted — money paid back to you',
    transfer: 'Not counted — your own money moving'
  }
}

// Default category for a name typed or picked by the user: the mapped one if it's
// a known everyday name (case-insensitive), otherwise the catch-all.
export function defaultCategoryFor(name: string, direction: CashFlowDirection): CashFlowCategory {
  const match = EVERYDAY_CATEGORIES[direction].find((e) => e.name.toLowerCase() === name.trim().toLowerCase())
  return match?.category ?? 'discretionary'
}

// A category's dot color (styles.css --cf-income-N / --cf-expense-N): green or
// red-orange by direction, stronger for more essential categories. Transfers and
// reimbursements don't count toward totals, so they get no color.
const RAMP_STEP: Partial<Record<CashFlowCategory, number>> = {
  salary: 1,
  fixed_monthly: 1,
  other_fixed: 2,
  discretionary: 3
}

export function categoryColor(category: CashFlowCategory | null, direction: CashFlowDirection): string | null {
  if (!category) return 'var(--cf-uncategorized)'
  const step = RAMP_STEP[category]
  return step ? `var(--cf-${direction}-${step})` : null
}

export function categoryLabel(
  category: CashFlowCategory | null,
  direction: CashFlowDirection,
  style: 'long' | 'short' = 'short'
): string | null {
  if (!category) return null
  return categoriesFor(direction, style).find((c) => c.value === category)?.label ?? category
}
