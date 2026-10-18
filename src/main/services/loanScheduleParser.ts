import { extractStructured } from './extraction'
import { todayLocalDateString } from '../dateUtils'
import type { LoanScheduleExtraction } from '../../shared/types'

// Reads a loan repayment/amortization schedule and has the model work out the
// current paid/pending split itself, rather than us extracting every row and doing
// the date math in code — the model reads the whole table as input and just reports
// back the few numbers we actually need. Critically, the model has no innate sense
// of the current date, so "today" is injected into the instructions explicitly.

function buildInstructions(todayIso: string): string {
  return (
    `This is a loan repayment / amortization schedule. Today's date is ${todayIso}. ` +
    'Extract the loan details, and using the installment table in the document, work out: ' +
    'the current outstanding principal balance as of today (the closing balance of the most ' +
    'recent installment due on or before today — if no installment is due yet, this is the ' +
    'original principal), how many installments are due on or before today (installments_paid), ' +
    'and how many installments remain after today (installments_remaining). ' +
    'If a field is not present in the document, use null rather than guessing. Dates must be ' +
    'YYYY-MM-DD. interest_rate is the annual percentage rate if stated.'
  )
}

const EXTRACTION_PROPERTIES = {
  lender: { type: ['string', 'null'], description: 'Name of the bank/lender' },
  principal_amount: { type: ['number', 'null'], description: 'Original loan amount disbursed' },
  interest_rate: { type: ['number', 'null'], description: 'Annual interest rate, percent, numeric only' },
  tenure_months: { type: ['number', 'null'], description: 'Total number of installments in the schedule' },
  emi_amount: { type: ['number', 'null'], description: 'The (typically constant) EMI amount' },
  loan_start_date: {
    type: ['string', 'null'],
    description: 'Disbursement date or first installment date, YYYY-MM-DD'
  },
  outstanding_balance: {
    type: ['number', 'null'],
    description: "Outstanding principal as of today's date, per the instructions above"
  },
  installments_paid: {
    type: ['number', 'null'],
    description: 'Count of installments due on or before today'
  },
  installments_remaining: {
    type: ['number', 'null'],
    description: 'Count of installments due after today'
  },
  confidence_notes: {
    type: ['string', 'null'],
    description: 'Brief note on any fields you were unsure about or could not find'
  }
}

const EXTRACTION_FIELD_NAMES = Object.keys(EXTRACTION_PROPERTIES)

export async function extractLoanSchedule(filePath: string): Promise<LoanScheduleExtraction> {
  const todayIso = todayLocalDateString()
  return extractStructured<LoanScheduleExtraction>({
    filePath,
    instructions: buildInstructions(todayIso),
    schemaName: 'extract_loan_schedule',
    properties: EXTRACTION_PROPERTIES,
    requiredFields: EXTRACTION_FIELD_NAMES
  })
}
