// Mirrors src/shared/types.ts's LoanScheduleExtraction — copied rather than
// imported, same convention as categories.ts (Metro's watchFolders is scoped to
// mobile/, so reaching outside it isn't possible without a metro.config.js change).

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
