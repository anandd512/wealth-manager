export type AccountCategory =
  | 'bank'
  | 'investment'
  | 'real_estate'
  | 'loan'
  | 'other_asset'
  | 'other_liability'

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

export interface Account {
  id: number
  name: string
  category: AccountCategory
  subtype: AccountSubtype
  institution: string | null
  currency: string
  is_liability: 0 | 1
  current_value: number
  quantity: number | null
  account_number: string | null
  ifsc_code: string | null
  debit_card_number: string | null
  debit_card_network: string | null
  debit_card_expiry_month: number | null
  debit_card_expiry_year: number | null
  debit_card_cvv: string | null
  debit_card_name_on_card: string | null
  principal_amount: number | null
  interest_rate: number | null
  tenure_months: number | null
  emi_amount: number | null
  loan_start_date: string | null
  document_path: string | null
  document_original_name: string | null
  purchase_price: number | null
  purchase_date: string | null  // YYYY-MM-DD ISO string
  ownership_pct: number | null
  last_updated: string
  notes: string | null
  created_at: string
}

export type AccountInput = Omit<Account, 'id' | 'created_at' | 'last_updated'>

export interface LoanScheduleExtraction {
  lender: string | null
  principal_amount: number | null
  interest_rate: number | null
  tenure_months: number | null
  emi_amount: number | null
  loan_start_date: string | null
  outstanding_balance: number | null
  installments_paid: number | null
  installments_remaining: number | null
  confidence_notes: string | null
}

export interface RsuStatementExtraction {
  total_value: number | null // Vested portfolio value, converted to INR using a live exchange rate
  total_value_native: number | null // As printed on the statement, in its own currency
  currency: string | null // ISO code of the statement's native currency, e.g. 'USD'
  exchange_rate_used: number | null // native currency -> INR rate actually applied, for transparency
  vested_shares: number | null // Counts toward current_value/quantity — unvested isn't the holder's yet
  unvested_shares: number | null // Shown as a separate info line, not counted in net worth
  cash_balance_native: number | null // The plan's own cash-awaiting-investment/dividend balance, in `currency`
  as_of_date: string | null // YYYY-MM-DD, the statement's "as of" / period-end date
  confidence_notes: string | null
}

export interface ValueHistoryRow {
  id: number
  account_id: number
  value: number
  recorded_at: string
  source: string
  invested_value: number | null
  quantity: number | null
}

export interface NetWorthSnapshot {
  id: number
  snapshot_date: string
  total_assets: number
  total_liabilities: number
  net_worth: number
}

export type InsurancePolicyType =
  | 'term_life'
  | 'life'
  | 'health'
  | 'vehicle_2w'
  | 'vehicle_4w'
  | 'home'
  | 'travel'
  | 'personal_accident'
  | 'other'

export interface InsurancePolicy {
  id: number
  policy_number: string | null
  policy_type: string | null
  insurer: string | null
  insured_name: string | null
  additional_insured: string | null
  nominee_name: string | null
  vehicle_number: string | null
  sum_assured: number | null
  premium_amount: number | null
  premium_frequency: string | null
  start_date: string | null
  expiry_date: string | null
  renewal_date: string | null
  riders: string | null
  document_path: string | null
  document_original_name: string | null
  last_reminder_sent: string | null
  notes: string | null
  created_at: string
}

export type InsurancePolicyInput = Omit<
  InsurancePolicy,
  'id' | 'created_at' | 'last_reminder_sent'
>

export interface PolicyExtraction {
  policy_number: string | null
  policy_type: InsurancePolicyType | null
  insurer: string | null
  insured_name: string | null
  additional_insured: string | null
  vehicle_number: string | null
  sum_assured: number | null
  premium_amount: number | null
  premium_frequency: string | null
  start_date: string | null
  expiry_date: string | null
  renewal_date: string | null
  confidence_notes: string | null
}

export type IdentityDocType =
  | 'aadhaar'
  | 'pan'
  | 'passport'
  | 'driving_license'
  | 'voter_id'
  | 'birth_certificate'
  | 'rc'
  | 'other'

export interface IdentityDocument {
  id: number
  doc_type: IdentityDocType
  label: string | null
  id_number: string | null
  full_name: string | null
  date_of_birth: string | null
  issued_date: string | null
  expiry_date: string | null
  additional_info: string | null
  // Driving License + RC
  vehicle_class: string | null
  // RC only
  vehicle_model: string | null
  insurance_valid_upto: string | null
  // Voter ID only
  constituency: string | null
  voter_serial_number: string | null
  document_path: string | null
  document_original_name: string | null
  last_reminder_sent: string | null
  notes: string | null
  created_at: string
}

export type IdentityDocumentInput = Omit<
  IdentityDocument,
  'id' | 'created_at' | 'last_reminder_sent'
>

export interface IdentityDocExtraction {
  doc_type: IdentityDocType | null
  label: string | null
  id_number: string | null
  full_name: string | null
  date_of_birth: string | null
  issued_date: string | null
  expiry_date: string | null
  additional_info: string | null
  vehicle_class: string | null
  vehicle_model: string | null
  insurance_valid_upto: string | null
  constituency: string | null
  voter_serial_number: string | null
  confidence_notes: string | null
}

export type CreditCardStatus = 'active' | 'disabled'

export interface CreditCard {
  id: number
  nickname: string
  network: string | null
  issuer: string | null
  card_number: string | null
  name_on_card: string | null
  expiry_month: number | null
  expiry_year: number | null
  cvv: string | null
  credit_limit: number | null
  statement_day: number | null
  last_reminder_sent: string | null
  notes: string | null
  status: CreditCardStatus
  created_at: string
}

export type CreditCardInput = Omit<CreditCard, 'id' | 'created_at' | 'last_reminder_sent'>

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

export interface VaultEntry {
  id: number
  entry_type: 'login' | 'note'
  service_name: string
  category: VaultCategory | null
  url: string | null
  username: string | null
  password: string | null
  password_changed_at: string | null
  notes: string | null
  created_at: string
}

export type VaultEntryInput = Omit<VaultEntry, 'id' | 'created_at' | 'password_changed_at'>

// Reminder emails go through the backend's Azure Communication Services Email
// (see backend/src/functions/notifySend.ts) rather than a user-configured SMTP
// server — `email` just needs a one-time OTP verification (src/main/services/
// notify.ts), independent of whether cloud sync is set up at all.
export interface NotifyStatus {
  verified: boolean
  email: string | null
}

export interface ReminderSettings {
  daysBefore: number
  desktopNotifications: boolean
  emailNotifications: boolean
}

export type ExtractionProvider = 'anthropic' | 'openai'

// A monthly schedule rule.
// scheduleType 'weekday' (default when undefined): Nth weekday, e.g. occurrence=1, weekday=6
//   is "the first Saturday of every month". weekday follows Date#getDay (0=Sunday..6=Saturday).
// scheduleType 'day_of_month': a fixed day number (1-28) every month.
export interface CheckInScheduleSettings {
  enabled: boolean
  occurrence: 1 | 2 | 3 | 4
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  scheduleType?: 'weekday' | 'day_of_month'
  dayOfMonth?: number // 1-28, used when scheduleType === 'day_of_month'
}

export interface AppSettings {
  reminders: ReminderSettings
  checkInSchedule: CheckInScheduleSettings
  extractionProvider: ExtractionProvider
  hasAnthropicKey: boolean
  hasOpenAiKey: boolean
  openAiBaseUrl: string
  openAiModel: string
}

export interface AuthStatus {
  initialized: boolean
  unlocked: boolean
}


export type UpcomingItemType = 'insurance' | 'identity' | 'credit_card' | 'check_in'
export type UpcomingAction = 'paid' | 'dismissed'

export interface UpcomingItem {
  itemType: UpcomingItemType
  itemId: number
  typeLabel: string
  title: string
  subtitle: string | null
  dueDate: string
  daysLeft: number
  actionLabel: string
}

export interface UpdateStatus {
  supported: boolean
  autoCheck: boolean
  version: string
}

export type UpdateCheckResult =
  | { status: 'unsupported' }
  | { status: 'up-to-date' }
  | { status: 'downloading'; version: string }
  | { status: 'error'; message: string }

export type CashFlowDirection = 'income' | 'expense'
export type CashFlowEntryMethod = 'manual' | 'ai_extracted'

// Classifies a cash flow row within its direction, driving both the manual
// classification UI and the trend chart's per-category colors — null means
// "uncategorized" (shown as its own neutral bucket rather than guessed at).
// 'reimbursement' (income-only) is money coming back to the user (e.g. a roommate
// repaying rent) — tracked but excluded from income_total/the colored chart, since
// it isn't real income. See cashFlow.ts's getMonthlySummary.
export type IncomeCategory = 'salary' | 'other_fixed' | 'discretionary' | 'reimbursement'
export type ExpenseCategory = 'fixed_monthly' | 'other_fixed' | 'discretionary'
export type CashFlowCategory = IncomeCategory | ExpenseCategory

// A curated, non-exhaustive list offered as a <datalist> alongside a free-text
// field — not a closed enum, so a user's own term is never rejected.
export const CASH_FLOW_SUBCATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Transport',
  'Shopping',
  'Bills & Utilities',
  'Rent / Housing',
  'Healthcare',
  'Entertainment',
  'Travel',
  'Education',
  'Transfers',
  'Salary',
  'Interest / Dividends',
  'Other'
] as const

// One row per individual statement upload — see db.ts's cash_flow_imports comment.
export interface CashFlowImport {
  id: number
  account_sync_id: string
  file_hash: string
  document_path: string | null
  document_original_name: string | null
  statement_period_start: string | null
  statement_period_end: string | null
  opening_balance: number | null
  closing_balance: number | null
  transaction_count: number
  excluded_json: string | null
  updated_at: string
  created_at: string
}

// One row per individual income/expense transaction — a real ledger, not a monthly
// aggregate. Each transaction is independently classifiable via category.
export interface CashFlowTransaction {
  id: number
  txn_date: string // 'YYYY-MM-DD'
  direction: CashFlowDirection
  description: string
  account_sync_id: string | null // optional link to a tracked bank account, either direction
  amount: number // always in INR — the account's/app's working currency
  currency: string | null // set only when the original was non-INR, e.g. 'USD'
  amount_native: number | null // the original amount in `currency`, before conversion
  category: CashFlowCategory | null
  subcategory: string | null
  import_id: number | null // the statement upload this came from, if any (null = manual)
  entry_method: CashFlowEntryMethod
  is_sample: 0 | 1 // seeded by "Try with sample data" (CashFlow.tsx) — excluded from
  // real totals/charts is NOT done (sample data is meant to populate them for a
  // preview) but every sample row can be identified and bulk-removed in one action
  notes: string | null
  // Set only when this row came from an AI-read statement — points at the stored
  // upload (fileStore.ts) so it can be viewed/downloaded again later.
  document_path: string | null
  document_original_name: string | null
  updated_at: string
  created_at: string
}

export type CashFlowTransactionInput = Omit<
  CashFlowTransaction,
  | 'id'
  | 'updated_at'
  | 'created_at'
  | 'document_path'
  | 'document_original_name'
  | 'import_id'
  | 'amount_native'
  | 'is_sample'
>

// One row per recurring-transaction template (rent, SIP, salary) — see db.ts's
// cash_flow_recurring comment for why this never auto-creates a transaction itself.
export interface CashFlowRecurringTemplate {
  id: number
  direction: CashFlowDirection
  description: string
  account_sync_id: string | null
  amount: number
  category: CashFlowCategory | null
  subcategory: string | null
  day_of_month: number
  last_created_month: string | null
  updated_at: string
  created_at: string
}

export type CashFlowRecurringInput = Omit<
  CashFlowRecurringTemplate,
  'id' | 'updated_at' | 'created_at' | 'last_created_month'
>

// A single category/subcategory's monthly budget — stored as a JSON array under one
// kv_settings key (settings.ts), not a dedicated table; this is a short, rarely-
// changed list a user edits by hand, not something queried/joined against.
export interface CashFlowBudget {
  key: string // a CashFlowCategory, or 'category:subcategory' for a finer budget
  label: string
  monthlyAmount: number
}

export interface CashFlowSavingsGoal {
  monthlyTarget: number | null
}

export interface CashFlowAccountCoverage {
  account_sync_id: string
  account_name: string
  statement_period_start: string | null
  statement_period_end: string | null
}

export interface CashFlowMonthSummary {
  month: string
  income_total: number
  expense_total: number
  net: number
  income_salary: number
  income_other_fixed: number
  income_discretionary: number
  income_reimbursement: number
  income_uncategorized: number
  expense_fixed_monthly: number
  expense_other_fixed: number
  expense_discretionary: number
  expense_uncategorized: number
}

export interface CashFlowExtractedTransaction {
  txn_date: string // 'YYYY-MM-DD'
  direction: CashFlowDirection
  description: string // short, cleaned-up label
  raw_text: string | null // the statement's own original line text, kept for audit/search
  amount: number // in the statement's own currency — see `currency`
  currency: string // ISO code, e.g. 'INR', 'USD'
  confidence: 'high' | 'medium' | 'low'
  category: CashFlowCategory
  subcategory: string | null
  // Everything below is set client-side after extraction (comparing against the
  // existing ledger / the batch's own amounts / tracked credit cards) — never by the
  // model. Shown as warnings in the review table, never auto-excluded or auto-fixed.
  possibleDuplicate?: boolean
  isOutlier?: boolean
  possibleCardBillDouble?: boolean
}

export interface CashFlowExcludedLine {
  txn_date: string
  description: string
  amount: number
  reason: string
}

export interface CashFlowStatementExtraction {
  account_label: string | null
  statement_type: 'bank' | 'credit_card' | 'unclear'
  statement_period_start: string | null
  statement_period_end: string | null
  opening_balance: number | null
  closing_balance: number | null
  transactions: CashFlowExtractedTransaction[]
  excluded_transactions: CashFlowExcludedLine[]
  confidence_notes: string | null
}

// Either the file matches one already imported (returned instead of ever calling the
// AI, unless the caller explicitly passes force: true) or a fresh extraction.
export type CashFlowExtractStatementResult =
  | { duplicate: true; fileHash: string; importedAt: string; transactionCount: number }
  | { duplicate: false; extraction: CashFlowStatementExtraction; storedPath: string; originalName: string; fileHash: string }

export interface CashFlowApplyExtractionInput {
  accountSyncId: string
  transactions: CashFlowExtractedTransaction[]
  fileHash: string
  documentPath: string | null
  documentOriginalName: string | null
  statementPeriodStart: string | null
  statementPeriodEnd: string | null
  openingBalance: number | null
  closingBalance: number | null
  excludedTransactions: CashFlowExcludedLine[]
}

// A minimal projection of bank accounts for cash-flow use (picking which account an
// expense row belongs to, resolving account_sync_id to a display name) — `sync_id`
// isn't on the Account type itself (see sync.ts: it's a sync-bookkeeping column kept
// out of the general API), so this is a purpose-built shape instead of widening Account.
export interface CashFlowTrackedAccount {
  sync_id: string
  name: string
  institution: string | null
  account_number: string | null
}
