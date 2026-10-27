/**
 * tourApi.ts — a complete mock of window.api used during the product tour.
 * All data belongs to "Dev Sharma", a fictional user.
 * The tour renders real product pages; this mock provides the data layer.
 */

import type {
  Account,
  InsurancePolicy,
  IdentityDocument,
  CreditCard,
  VaultEntry,
  NetWorthSnapshot,
  UpcomingItem,
} from '../../../shared/types'

// ─── Fields that are always null across all demo accounts ─────────────────────

const NEVER_USED = {
  debit_card_number: null,
  debit_card_network: null,
  debit_card_expiry_month: null,
  debit_card_expiry_year: null,
  debit_card_cvv: null,
  debit_card_name_on_card: null,
  document_path: null,
  document_original_name: null,
  notes: null,
} as const

// ─── Demo accounts ────────────────────────────────────────────────────────────

export const DEMO_ACCOUNTS: Account[] = [
  {
    ...NEVER_USED,
    id: 1, name: 'HDFC Savings Account', category: 'bank', subtype: 'savings',
    institution: 'HDFC Bank', currency: 'INR', is_liability: 0, current_value: 245000,
    quantity: null,
    account_number: '30985678****', ifsc_code: 'HDFC0001234',
    principal_amount: null, interest_rate: null, tenure_months: null,
    emi_amount: null, loan_start_date: null,
    last_updated: '2026-10-15T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
  },
  {
    ...NEVER_USED,
    id: 2, name: 'Zerodha Demat', category: 'investment', subtype: 'stock',
    institution: 'Zerodha', currency: 'INR', is_liability: 0, current_value: 1200000,
    quantity: null,
    account_number: null, ifsc_code: null,
    principal_amount: null, interest_rate: null, tenure_months: null,
    emi_amount: null, loan_start_date: null,
    last_updated: '2026-10-15T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
  },
  {
    ...NEVER_USED,
    id: 3, name: 'SBI Fixed Deposit', category: 'bank', subtype: 'fixed_deposit',
    institution: 'State Bank of India', currency: 'INR', is_liability: 0, current_value: 500000,
    quantity: null,
    account_number: null, ifsc_code: null,
    principal_amount: null, interest_rate: null, tenure_months: null,
    emi_amount: null, loan_start_date: null,
    last_updated: '2026-09-01T00:00:00Z', created_at: '2026-03-01T00:00:00Z',
  },
  {
    ...NEVER_USED,
    id: 4, name: 'Axis Blue Chip Fund', category: 'investment', subtype: 'mutual_fund',
    institution: 'Axis AMC', currency: 'INR', is_liability: 0, current_value: 875000,
    quantity: null,
    account_number: null, ifsc_code: null,
    principal_amount: null, interest_rate: null, tenure_months: null,
    emi_amount: null, loan_start_date: null,
    last_updated: '2026-10-15T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
  },
  {
    ...NEVER_USED,
    id: 5, name: 'Flat — Whitefield', category: 'real_estate', subtype: 'home',
    institution: null, currency: 'INR', is_liability: 0, current_value: 8500000,
    quantity: null,
    account_number: null, ifsc_code: null,
    principal_amount: null, interest_rate: null, tenure_months: null,
    emi_amount: null, loan_start_date: null,
    last_updated: '2026-07-01T00:00:00Z', created_at: '2025-06-01T00:00:00Z',
  },
  {
    ...NEVER_USED,
    id: 6, name: 'HDFC Home Loan', category: 'loan', subtype: 'home_loan',
    institution: 'HDFC Bank', currency: 'INR', is_liability: 1, current_value: 4500000,
    quantity: null,
    account_number: null, ifsc_code: null,
    principal_amount: 5500000, interest_rate: 8.6, tenure_months: 240,
    emi_amount: 48200, loan_start_date: '2023-06-01',
    last_updated: '2026-10-01T00:00:00Z', created_at: '2023-06-01T00:00:00Z',
  },
]

// ─── Demo insurance ───────────────────────────────────────────────────────────

export const DEMO_INSURANCE: InsurancePolicy[] = [
  {
    id: 1, policy_number: 'LIC-936-7654321', policy_type: 'term_life',
    insurer: 'LIC of India', insured_name: 'Dev Sharma', vehicle_number: null,
    sum_assured: 10000000, premium_amount: 12500, premium_frequency: 'yearly',
    start_date: '2015-04-01', expiry_date: '2040-04-01', renewal_date: '2026-04-01',
    document_path: null, document_original_name: null,
    last_reminder_sent: null, notes: null, created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2, policy_number: 'SH-FAM-20251234', policy_type: 'health',
    insurer: 'Star Health Insurance', insured_name: 'Dev Sharma & Family', vehicle_number: null,
    sum_assured: 1500000, premium_amount: 22000, premium_frequency: 'yearly',
    start_date: '2026-01-20', expiry_date: '2027-01-20', renewal_date: '2027-01-10',
    document_path: null, document_original_name: null,
    last_reminder_sent: null, notes: null, created_at: '2026-01-20T00:00:00Z',
  },
  {
    id: 3, policy_number: 'OG-24-1234-5678-01', policy_type: 'vehicle_4w',
    insurer: 'Bajaj Allianz General Insurance', insured_name: 'Dev Sharma',
    vehicle_number: 'KA 01 AB 1234',
    sum_assured: 600000, premium_amount: 8500, premium_frequency: 'yearly',
    start_date: '2025-03-10', expiry_date: '2026-03-10', renewal_date: '2026-03-01',
    document_path: null, document_original_name: null,
    last_reminder_sent: null, notes: null, created_at: '2025-03-10T00:00:00Z',
  },
]

// ─── Demo identity documents ──────────────────────────────────────────────────

const ID_COMMON = {
  label: null, additional_info: null, vehicle_class: null, vehicle_model: null,
  insurance_valid_upto: null, constituency: null, voter_serial_number: null,
  document_path: null, document_original_name: null,
  last_reminder_sent: null, notes: null,
} as const

export const DEMO_IDENTITY_DOCS: IdentityDocument[] = [
  {
    ...ID_COMMON,
    id: 1, doc_type: 'aadhaar', id_number: '9876 5432 1098',
    full_name: 'Dev Sharma', date_of_birth: '1990-07-14',
    issued_date: '2015-06-01', expiry_date: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    ...ID_COMMON,
    id: 2, doc_type: 'pan', id_number: 'ABCDS1234F',
    full_name: 'Dev Sharma', date_of_birth: '1990-07-14',
    issued_date: '2012-03-15', expiry_date: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    ...ID_COMMON,
    id: 3, doc_type: 'passport', id_number: 'P12345678',
    full_name: 'Dev Sharma', date_of_birth: '1990-07-14',
    issued_date: '2020-05-20', expiry_date: '2030-05-20',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    ...ID_COMMON,
    id: 4, doc_type: 'driving_license', id_number: 'KA0120230001234',
    full_name: 'Dev Sharma', date_of_birth: '1990-07-14',
    issued_date: '2023-11-15', expiry_date: '2028-11-15',
    vehicle_class: 'LMV',
    created_at: '2026-01-01T00:00:00Z',
  },
]

// ─── Demo credit cards ────────────────────────────────────────────────────────

export const DEMO_CREDIT_CARDS: CreditCard[] = [
  {
    id: 1, nickname: 'HDFC Regalia', network: 'Visa', issuer: 'HDFC Bank',
    card_number: '4532015112834521', name_on_card: 'DEV SHARMA',
    expiry_month: 9, expiry_year: 2028, cvv: null,
    credit_limit: 500000, statement_day: 5,
    last_reminder_sent: null, notes: null, status: 'active', created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2, nickname: 'Axis Bank Miles & More', network: 'Mastercard', issuer: 'Axis Bank',
    card_number: '5425233430108834', name_on_card: 'DEV SHARMA',
    expiry_month: 4, expiry_year: 2027, cvv: null,
    credit_limit: 300000, statement_day: 15,
    last_reminder_sent: null, notes: null, status: 'active', created_at: '2026-01-01T00:00:00Z',
  },
]

// ─── Demo vault ───────────────────────────────────────────────────────────────

export const DEMO_VAULT: VaultEntry[] = [
  {
    id: 1, service_name: 'Gmail', category: 'Communication & Social',
    url: 'mail.google.com', username: 'dev.sharma@gmail.com',
    password: 'Gmail@Dev2024!', notes: null, password_changed_at: '2026-06-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2, service_name: 'HDFC NetBanking', category: 'Finance & Banking',
    url: 'netbanking.hdfcbank.com', username: '30985678****',
    password: 'HDFC@Bank#99', notes: null, password_changed_at: '2026-08-15T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 3, service_name: 'Zerodha', category: 'Finance & Banking',
    url: 'kite.zerodha.com', username: 'DS1234',
    password: 'Zr0dh@Secur3!', notes: null, password_changed_at: '2026-09-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 4, service_name: 'Amazon', category: 'Shopping & E-commerce',
    url: 'amazon.in', username: 'dev.sharma@gmail.com',
    password: 'Amazon@Shop24', notes: null, password_changed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
]

// ─── Demo net worth history ───────────────────────────────────────────────────

const DEMO_NW_HISTORY: NetWorthSnapshot[] = [
  { id: 1,  snapshot_date: '2025-10-15', total_assets: 9200000,  total_liabilities: 5000000, net_worth: 4200000 },
  { id: 2,  snapshot_date: '2025-11-15', total_assets: 9480000,  total_liabilities: 4900000, net_worth: 4580000 },
  { id: 3,  snapshot_date: '2025-12-15', total_assets: 9700000,  total_liabilities: 4800000, net_worth: 4900000 },
  { id: 4,  snapshot_date: '2026-01-15', total_assets: 9950000,  total_liabilities: 4750000, net_worth: 5200000 },
  { id: 5,  snapshot_date: '2026-02-15', total_assets: 10200000, total_liabilities: 4700000, net_worth: 5500000 },
  { id: 6,  snapshot_date: '2026-03-15', total_assets: 10500000, total_liabilities: 4680000, net_worth: 5820000 },
  { id: 7,  snapshot_date: '2026-04-15', total_assets: 10800000, total_liabilities: 4650000, net_worth: 6150000 },
  { id: 8,  snapshot_date: '2026-05-15', total_assets: 10950000, total_liabilities: 4620000, net_worth: 6330000 },
  { id: 9,  snapshot_date: '2026-06-15', total_assets: 11100000, total_liabilities: 4600000, net_worth: 6500000 },
  { id: 10, snapshot_date: '2026-07-15', total_assets: 11280000, total_liabilities: 4580000, net_worth: 6700000 },
  { id: 11, snapshot_date: '2026-08-15', total_assets: 11500000, total_liabilities: 4560000, net_worth: 6940000 },
  { id: 12, snapshot_date: '2026-09-15', total_assets: 11750000, total_liabilities: 4530000, net_worth: 7220000 },
  { id: 13, snapshot_date: '2026-10-15', total_assets: 11320000, total_liabilities: 4500000, net_worth: 6820000 },
]

// ─── Demo upcoming ────────────────────────────────────────────────────────────

const DEMO_UPCOMING: UpcomingItem[] = [
  {
    itemType: 'insurance', itemId: 3, title: 'Bajaj Allianz Motor',
    subtitle: 'KA 01 AB 1234', typeLabel: 'Motor Insurance',
    dueDate: '2026-03-10', daysLeft: 42, actionLabel: 'Renew',
  },
  {
    itemType: 'credit_card', itemId: 1, title: 'HDFC Regalia',
    subtitle: 'Statement due', typeLabel: 'Credit Card',
    dueDate: '2026-11-05', daysLeft: 17, actionLabel: 'Mark paid',
  },
]

// ─── Mutable store (supports create() during tour) ───────────────────────────

const store = {
  accounts:     [...DEMO_ACCOUNTS],
  insurance:    [...DEMO_INSURANCE],
  identityDocs: [...DEMO_IDENTITY_DOCS],
  creditCards:  [...DEMO_CREDIT_CARDS],
  vault:        [...DEMO_VAULT],
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTourApi(): typeof window.api {
  return {
    auth: {
      status:                  async () => ({ initialized: true, unlocked: true }),
      setup:                   async () => ({ ok: true }),
      unlock:                  async () => ({ ok: true }),
      lock:                    async () => ({ ok: true }),
      changePassword:          async () => ({ ok: true }),
      windowsHelloAvailable:   async () => false,
      windowsHelloEnabled:     async () => false,
      enableWindowsHello:      async () => ({ ok: false }),
      disableWindowsHello:     async () => ({ ok: true }),
      unlockWithWindowsHello:  async () => ({ ok: false, error: 'Not available in tour' }),
      resetData:               async () => {},
    },
    storageMode: {
      status: async () => ({ mode: 'local' as const }),
      set:    async () => ({ ok: false, error: 'Not available in tour' }),
    },
    sync: {
      status:                     async () => ({ connected: false, email: null }),
      requestEmailVerification:   async () => ({ ok: false, error: 'Not available in tour' }),
      confirmEmailVerification:   async () => ({ ok: false, error: 'Not available in tour' }),
      register:                   async () => ({ ok: false, error: 'Not available in tour' }),
      login:                      async () => ({ ok: false, error: 'Not available in tour' }),
      logout:                     async () => {},
      now:                        async () => ({ ok: false, error: 'Not available in tour' }),
    },
    notify: {
      status:              async () => ({ verified: false, email: null }),
      requestVerification: async () => ({ ok: false, error: 'Not available in tour' }),
      confirmVerification: async () => ({ ok: false, error: 'Not available in tour' }),
      disconnect:          async () => {},
    },
    accounts: {
      list:                async () => [...store.accounts],
      create:              async (input) => {
        const a = { id: Date.now(), ...input, last_updated: new Date().toISOString(), created_at: new Date().toISOString() } as Account
        store.accounts.push(a)
        return a
      },
      update:              async (id, input) => {
        const idx = store.accounts.findIndex(a => a.id === id)
        if (idx >= 0) store.accounts[idx] = { ...store.accounts[idx], ...input, last_updated: new Date().toISOString() }
        return store.accounts.find(a => a.id === id)!
      },
      remove:              async () => {},
      history:             async () => [],
      checkIn:             async () => {},
      updateValueHistory:  async () => {},
      deleteValueHistory:  async () => {},
      categoryHistory:     async () => [],
      pickDocument:        async () => null,
      extractLoanSchedule: async () => null,
      reExtractLoanSchedule: async () => null,
      extractRsuStatement: async () => null,
      reExtractRsuStatement: async () => null,
      openDocument:        async () => {},
      downloadDocument:    async () => ({ ok: false }),
      syncId:              async () => null,
    },
    netWorth: {
      summary:   async () => ({ totalAssets: 11320000, totalLiabilities: 4500000, netWorth: 6820000 }),
      history:   async () => DEMO_NW_HISTORY,
      breakdown: async () => [
        { category: 'real_estate', value: 8500000 },
        { category: 'investment',  value: 2075000 },
        { category: 'bank',        value: 745000  },
      ],
    },
    dashboard: {
      upcoming: async () => DEMO_UPCOMING,
      dismiss:  async () => {},
    },
    insurance: {
      list:             async () => [...store.insurance],
      create:           async (input) => {
        const p = { id: Date.now(), ...input, last_reminder_sent: null, created_at: new Date().toISOString() } as InsurancePolicy
        store.insurance.push(p)
        return p
      },
      update:           async () => {},
      remove:           async () => {},
      pickFile:         async () => null,
      extract:          async () => { throw new Error('Not available in tour') },
      reExtract:        async () => { throw new Error('Not available in tour') },
      openDocument:     async () => {},
      downloadDocument: async () => ({ ok: false }),
    },
    identityDocs: {
      list:             async () => [...store.identityDocs],
      create:           async (input) => {
        const d = { id: Date.now(), ...input, last_reminder_sent: null, created_at: new Date().toISOString() } as IdentityDocument
        store.identityDocs.push(d)
        return d
      },
      update:           async () => {},
      remove:           async () => {},
      pickFile:         async () => null,
      extract:          async () => { throw new Error('Not available in tour') },
      reExtract:        async () => { throw new Error('Not available in tour') },
      openDocument:     async () => {},
      downloadDocument: async () => ({ ok: false }),
    },
    creditCards: {
      list:     async () => [...store.creditCards],
      create:   async (input) => {
        const c = { id: Date.now(), ...input, last_reminder_sent: null, created_at: new Date().toISOString() } as CreditCard
        store.creditCards.push(c)
        return c
      },
      update:   async () => {},
      remove:   async () => {},
      dueDates: async () => [],
    },
    // Not part of the tour (no /cashflow route registered in TourMode's own Routes) —
    // stubbed only so this mock satisfies the real preload Api type.
    cashFlow: {
      list:                  async () => [],
      listRange:             async () => [],
      months:                async () => [],
      summary:               async () => [],
      trackedAccounts:       async () => [],
      coverage:              async () => [],
      create:                async () => { throw new Error('Not available in tour') },
      update:                async () => { throw new Error('Not available in tour') },
      remove:                async () => {},
      restore:               async () => { throw new Error('Not available in tour') },
      updateCategory:        async () => { throw new Error('Not available in tour') },
      bulkUpdateCategory:    async () => ({ ok: true }),
      bulkRemove:            async () => ({ ok: true }),
      recentDescriptions:    async () => [],
      deleteImport:          async () => ({ ok: true }),
      listImports:           async () => [],
      exportCsv:             async () => ({ ok: false }),
      consentStatus:         async () => ({ given: true }),
      setConsent:            async () => ({ ok: true }),
      accountTransactionCount: async () => 0,
      unlinkAccount:         async () => ({ ok: true }),
      deleteForAccount:      async () => ({ ok: true }),
      recurringList:         async () => [],
      recurringCreate:       async () => { throw new Error('Not available in tour') },
      recurringDelete:       async () => ({ ok: true }),
      recurringDue:          async () => [],
      recurringMarkHandled:  async () => ({ ok: true }),
      generateSampleData:    async () => ({ count: 0 }),
      removeSampleData:      async () => ({ ok: true }),
      hasSampleData:         async () => ({ hasSampleData: false }),
      getBudgets:            async () => [],
      setBudgets:            async () => ({ ok: true }),
      getSavingsGoal:        async () => ({ monthlyTarget: null }),
      setSavingsGoal:        async () => ({ ok: true }),
      pickStatement:         async () => [],
      combineImages:         async () => { throw new Error('Not available in tour') },
      extractStatement:      async () => { throw new Error('Not available in tour') },
      onExtractionProgress:  () => () => {},
      applyExtraction:       async () => ({ importId: 0, transactions: [] }),
      discardDocument:       async () => ({ ok: true }),
      openDocument:          async () => ({ ok: true }),
      downloadDocument:      async () => ({ ok: true }),
    },
    // Stubbed only so this mock satisfies the real preload Api type — password-
    // protected PDFs aren't part of the tour.
    documents: {
      checkEncrypted: async () => ({ requiresPassword: false }),
      decryptPdf:     async () => ({ decryptedPath: '' }),
    },
    vault: {
      list:   async () => [...store.vault],
      create: async (input) => {
        const v = { id: Date.now(), ...input, created_at: new Date().toISOString() } as VaultEntry
        store.vault.push(v)
        return v
      },
      update: async () => {},
      remove: async () => {},
    },
    settings: {
      get: async () => ({
        reminderDaysBefore: 30, checkInDayOfMonth: 15,
        extractionProvider: 'anthropic' as const,
        smtpConfigured: false, windowsHelloEnabled: false,
      }),
      setReminders:           async () => {},
      setCheckInSchedule:     async () => {},
      setExtractionProvider:  async () => {},
      setAnthropicKey:        async () => {},
      clearAnthropicKey:      async () => {},
      setOpenAiKey:           async () => {},
      clearOpenAiKey:         async () => {},
      setOpenAiBaseUrl:       async () => {},
      setOpenAiModel:         async () => {},
      testEmail:              async () => ({ ok: false, error: 'Not in tour' }),
      testAnthropicKey:       async () => ({ ok: false, error: 'Not in tour' }),
      testOpenAiKey:          async () => ({ ok: false, error: 'Not in tour' }),
    },
    reminders: {
      checkNow: async () => {},
    },
    backup: {
      export:   async () => ({ ok: false }),
      pickFile: async () => null,
      summary:  async () => ({ exportedAt: '', documentCount: 0, hasSecrets: false }),
      import:   async () => {},
    },
    updates: {
      status:       async () => ({ supported: false, autoCheck: false, version: '' }),
      setAutoCheck: async () => ({ supported: false, autoCheck: false, version: '' }),
      checkNow:     async () => ({ status: 'unsupported' as const }),
    },
  }
}
