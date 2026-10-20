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
  ticker: string | null
  quantity: number | null
  last_price: number | null
  last_price_at: string | null
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
  outstanding_balance: number | null
  statement_day: number | null
  last_reminder_sent: string | null
  notes: string | null
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
  totp_secret: string | null
  password_changed_at: string | null
  notes: string | null
  created_at: string
}

export type VaultEntryInput = Omit<VaultEntry, 'id' | 'created_at' | 'password_changed_at'>

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  fromAddress: string
  toAddress: string
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
  hasSmtpPassword: boolean
  smtp: Omit<SmtpConfig, 'user'> & { user: string }
}

export interface AuthStatus {
  initialized: boolean
  unlocked: boolean
}

export interface PriceQuote {
  ticker: string
  price: number | null
  currency: string | null
  asOf: string | null
  error: string | null
  // Populated when the quote's currency isn't INR and was converted using a live
  // FX rate so the stored account value stays in rupees.
  fxRate: number | null
  convertedValueInr: number | null
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
