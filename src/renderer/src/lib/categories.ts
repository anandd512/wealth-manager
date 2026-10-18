import type { LucideIcon } from 'lucide-react'
import {
  PiggyBank,
  Landmark,
  Lock,
  Repeat,
  TrendingUp,
  Target,
  BarChart3,
  Briefcase,
  UserRound,
  ScrollText,
  Gem,
  Bitcoin,
  Home,
  Car,
  Map as MapIcon,
  HandCoins,
  CreditCard,
  Folder
} from 'lucide-react'
import type { AccountCategory, AccountSubtype } from '../../../shared/types'

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
    { value: 'ppf', label: 'Provident Fund' },
    { value: 'nps', label: 'National Pension Scheme (NPS)' },
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

export const SUBTYPE_ICONS: Record<AccountSubtype, LucideIcon> = {
  savings: PiggyBank,
  checking: Landmark,
  fixed_deposit: Lock,
  recurring_deposit: Repeat,
  stock: TrendingUp,
  rsu: Target,
  mutual_fund: BarChart3,
  ppf: Landmark,
  epf: Briefcase,
  nps: UserRound,
  bond: ScrollText,
  physical_gold: Gem,
  crypto: Bitcoin,
  home: Home,
  vehicle: Car,
  land: MapIcon,
  home_loan: Home,
  car_loan: Car,
  personal_loan: HandCoins,
  credit_card: CreditCard,
  other: Folder
}

export function getSubtypeIcon(subtype: AccountSubtype): LucideIcon {
  return SUBTYPE_ICONS[subtype] ?? Folder
}

export const SUPPORTS_TICKER: AccountSubtype[] = ['stock']

// Subtypes where quantity is meaningful but there's no ticker-based auto-sync —
// value is entered manually (e.g. RSUs from a broker portal like Morgan Stanley
// StockConnect, which already reports quantity and INR value directly).
export const MANUAL_QUANTITY_SUBTYPES: AccountSubtype[] = ['physical_gold', 'rsu']

// Subtypes (besides 'bank', which always shows it) where an account/folio/PRAN
// reference number is meaningful enough to ask for.
export const SUBTYPES_WITH_ACCOUNT_NUMBER: AccountSubtype[] = ['ppf', 'nps', 'mutual_fund', 'bond']

// Subtypes where check-in should also capture the ₹ amount invested as of that date
// (so gain/loss can be tracked over time), as opposed to a physical/share quantity.
export const CHECKIN_INVESTED_VALUE_SUBTYPES: AccountSubtype[] = [
  'fixed_deposit',
  'recurring_deposit',
  'mutual_fund'
]

// Subtypes where check-in should also capture a quantity (grams, shares) as of that date.
export const CHECKIN_QUANTITY_SUBTYPES: AccountSubtype[] = ['physical_gold', 'rsu']
