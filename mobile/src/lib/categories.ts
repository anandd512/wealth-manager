/** Mirrors src/shared/types.ts + src/renderer/src/lib/categories.ts in the Electron
 * app. Copied rather than imported — Metro's watchFolders is scoped to mobile/, so
 * reaching outside it would need a metro.config.js change. Keep these in sync by hand
 * if the desktop app's categories/subtypes ever change. */

export type AccountCategory = 'bank' | 'investment' | 'real_estate' | 'loan' | 'other_asset' | 'other_liability'

export type AccountSubtype =
  | 'savings'
  | 'checking'
  | 'fixed_deposit'
  | 'recurring_deposit'
  | 'stock'
  | 'rsu'
  | 'mutual_fund'
  | 'ppf'
  | 'epf'
  | 'nps'
  | 'sgb'
  | 'bond'
  | 'physical_gold'
  | 'crypto'
  | 'home'
  | 'vehicle'
  | 'land'
  | 'home_loan'
  | 'car_loan'
  | 'personal_loan'
  | 'credit_card'
  | 'other'

export const CATEGORY_LABELS: Record<AccountCategory, string> = {
  bank: 'Bank Accounts',
  investment: 'Investments',
  real_estate: 'Real Estate',
  loan: 'Loans',
  other_asset: 'Other Assets',
  other_liability: 'Other Liabilities'
}

export const SUBTYPES_BY_CATEGORY: Record<AccountCategory, { value: AccountSubtype; label: string }[]> = {
  bank: [
    { value: 'savings', label: 'Savings' },
    { value: 'checking', label: 'Checking' },
    { value: 'fixed_deposit', label: 'Fixed deposit' },
    { value: 'recurring_deposit', label: 'Recurring deposit' }
  ],
  investment: [
    { value: 'stock', label: 'Stocks' },
    { value: 'rsu', label: 'RSU / ESPP' },
    { value: 'mutual_fund', label: 'Mutual Funds / SIPs' },
    { value: 'ppf', label: 'PPF (Public Provident Fund)' },
    { value: 'epf', label: 'EPF (Employee Provident Fund)' },
    { value: 'nps', label: 'National Pension Scheme (NPS)' },
    { value: 'sgb', label: 'Sovereign Gold Bond (SGB)' },
    { value: 'bond', label: 'Bond' },
    { value: 'physical_gold', label: 'Physical Gold' },
    { value: 'crypto', label: 'Crypto' },
    { value: 'other', label: 'Other' }
  ],
  real_estate: [
    { value: 'home', label: 'Home' },
    { value: 'land', label: 'Land' },
    { value: 'other', label: 'Other' }
  ],
  loan: [
    { value: 'home_loan', label: 'Home' },
    { value: 'car_loan', label: 'Car' },
    { value: 'personal_loan', label: 'Personal' },
    { value: 'credit_card', label: 'Credit card' },
    { value: 'other', label: 'Other' }
  ],
  other_asset: [
    { value: 'vehicle', label: 'Vehicle' },
    { value: 'other', label: 'Other' }
  ],
  other_liability: [{ value: 'other', label: 'Other' }]
}

export const CATEGORY_IS_LIABILITY: Record<AccountCategory, boolean> = {
  bank: false,
  investment: false,
  real_estate: false,
  loan: true,
  other_asset: false,
  other_liability: true
}

export function getSubtypeLabel(category: AccountCategory, subtype: AccountSubtype): string {
  return SUBTYPES_BY_CATEGORY[category].find((s) => s.value === subtype)?.label ?? subtype
}

// Subtypes where check-in should also capture the ₹ amount invested as of that date
// (so gain/loss can be tracked over time), as opposed to a physical/share quantity.
export const CHECKIN_INVESTED_VALUE_SUBTYPES: AccountSubtype[] = ['fixed_deposit', 'recurring_deposit', 'mutual_fund']

// Subtypes where check-in should also capture a quantity (grams, shares) as of that date.
export const CHECKIN_QUANTITY_SUBTYPES: AccountSubtype[] = ['physical_gold', 'rsu']

export const VAULT_CATEGORIES = [
  'Finance & Banking',
  'Government & Identity',
  'Shopping & E-commerce',
  'Communication & Social',
  'Content & Media',
  'Work & Productivity',
  'Health',
  'Travel',
  'Other'
] as const

export type VaultCategory = (typeof VAULT_CATEGORIES)[number]
export type VaultEntryType = 'login' | 'note'


