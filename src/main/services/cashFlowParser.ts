import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { extractStructured } from './extraction'
import { listTrackedAccounts } from './cashFlow'
import { getPdfToolkit } from './pdfToolkit'
import { todayLocalDateString } from '../dateUtils'
import { CASH_FLOW_SUBCATEGORIES } from '../../shared/types'
import type { CashFlowStatementExtraction, CashFlowTrackedAccount } from '../../shared/types'

// Reads a bank statement (one account, possibly spanning several months) and has the
// model report every individual transaction line on it — a real ledger, not a monthly
// aggregate. No payslip or credit card statement is ever shared — this is the only
// source for income. The model is given ALL the user's other tracked accounts (not
// just bank accounts — cards, PPF/NPS, investment/brokerage too) so it can recognize
// transfers to any of them and exclude those entirely (both sides never appear in
// the ledger) — paying a card bill is itself a debit line here, so a credit card's
// own statement is never needed either.

function describeAccount(a: CashFlowTrackedAccount): string {
  const last4 = a.account_number ? a.account_number.slice(-4) : null
  const parts = [a.name, a.institution, last4 ? `ending ${last4}` : null].filter(Boolean)
  return parts.join(', ')
}

function buildInstructions(trackedAccounts: CashFlowTrackedAccount[], todayIso: string): string {
  const accountList =
    trackedAccounts.length > 0
      ? trackedAccounts.map(describeAccount).join('; ')
      : '(none on file yet)'
  const subcategoryList = CASH_FLOW_SUBCATEGORIES.join(', ')

  return (
    `This is a bank account statement (it may be only a portion of a longer statement, split by page — read ` +
    `whatever pages are included and report only what's actually on them, don't guess at pages you can't see). ` +
    `Today's date is ${todayIso}. Dates on Indian bank statements are DD-MM-YYYY or DD-MMM-YYYY (day first, ` +
    `never month-first MM-DD) — convert every date to YYYY-MM-DD accordingly. The user's other tracked ` +
    `accounts (bank, cards, investment/retirement) are: ${accountList}.\n\n` +
    'Report: ' +
    'account_label (as printed on this statement, so the user can match it to one of their accounts; null if ' +
    "you can't tell) — " +
    'statement_type: "bank" for a savings/checking account statement, "credit_card" if this is actually a ' +
    'credit card statement (outstanding balance, minimum due, purchase/cash-advance structure), "unclear" if ' +
    'you genuinely can\'t tell. This matters: a credit card statement read as a bank statement double-counts ' +
    'spending the user already captured from their bank statement paying the card bill. — ' +
    'statement_period_start / statement_period_end — the statement\'s own stated period (YYYY-MM-DD), or the ' +
    'earliest/latest transaction date you actually see if no period is printed. — ' +
    'opening_balance / closing_balance — the balance figures printed on the statement (not computed by you), ' +
    'null if not printed. — ' +
    'transactions — one entry per individual transaction line, with: txn_date (YYYY-MM-DD, the line\'s own ' +
    'date) — direction ("income" for a credit line, "expense" for a debit line) — raw_text (the line\'s own ' +
    'original text/narration exactly as printed, unedited) — description (a short, cleaned-up label derived ' +
    'from raw_text, e.g. "Salary - Acme Corp", "Swiggy order", "Electricity bill") — amount (always positive) ' +
    '— currency: the ISO code the amount is actually denominated in (e.g. "INR", "USD") — almost always "INR" ' +
    'for an Indian bank statement; only use something else if the statement itself is in a foreign currency ' +
    '(e.g. an NRE/foreign-currency account) — confidence: "high" (clear, unambiguous line), "medium" (readable ' +
    'but you had to interpret something), or "low" (hard to read, guessed at a field) — category: for income, ' +
    'one of "salary" (regular employer pay), "other_fixed" (interest, dividends, rent received), ' +
    '"discretionary" (bonuses, gifts, refunds, one-off credits), or "reimbursement" (ONLY when the description ' +
    'clearly shows someone paying back a shared cost, e.g. a flatmate\'s UPI note mentioning rent/bill split ' +
    '— if in doubt, use "discretionary" instead); for expense, one of "fixed_monthly" (rent, EMIs, ' +
    'subscriptions, utility bills), "other_fixed" (annual insurance, school fees, taxes), or "discretionary" ' +
    '(everything else, including ATM cash withdrawals, bank charges/GST on fees, and a credit-card bill ' +
    'payment, unless you have reason to call any of those fixed). For an EMI line, if the statement breaks it ' +
    'into principal and interest components, report the principal portion as "fixed_monthly" and treat ' +
    'interest as part of the same line\'s amount (do not split one EMI into two transactions). — subcategory: ' +
    `your best guess from this list: ${subcategoryList} — or null if nothing fits well. ` +
    'A same-day or next-day reversal pair (e.g. a UPI payment immediately auto-refunded, or a failed-then-' +
    'retried transfer) should be netted into a single reduced-amount entry, or both sides omitted entirely if ' +
    'they fully cancel out — never recorded as a full-amount expense plus a full-amount income. ' +
    'excluded_transactions — every line you deliberately left out of transactions, with txn_date, description, ' +
    'amount, and reason: any transfer to/from one of the other tracked accounts listed above (either ' +
    'direction), and any debit to an account not in that list that looks like a transfer to savings/' +
    'investment/brokerage/FD rather than genuine spending. Also exclude (and list here) any credit that is ' +
    'simply a transfer FROM one of the tracked accounts. ' +
    'confidence_notes (top-level) — a brief note on anything ambiguous.'
  )
}

const DIRECTION_ENUM = ['income', 'expense']
const CATEGORY_ENUM = ['salary', 'other_fixed', 'discretionary', 'reimbursement', 'fixed_monthly']
const STATEMENT_TYPE_ENUM = ['bank', 'credit_card', 'unclear']

const EXCLUDED_PROPERTIES = {
  txn_date: { type: 'string' },
  description: { type: 'string' },
  amount: { type: 'number' },
  reason: { type: 'string' }
}

const EXTRACTION_PROPERTIES = {
  account_label: { type: ['string', 'null'], description: 'Account name/label as printed on the statement' },
  statement_type: { type: 'string', enum: STATEMENT_TYPE_ENUM },
  statement_period_start: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
  statement_period_end: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
  opening_balance: { type: ['number', 'null'] },
  closing_balance: { type: ['number', 'null'] },
  transactions: {
    type: 'array',
    description: 'Every individual transaction line on the statement, per the instructions',
    items: {
      type: 'object',
      properties: {
        txn_date: { type: 'string', description: "The line's own date, 'YYYY-MM-DD'" },
        direction: { type: 'string', enum: DIRECTION_ENUM },
        raw_text: { type: ['string', 'null'], description: "The line's original text/narration, unedited" },
        description: { type: 'string', description: 'Short, cleaned-up label for this transaction' },
        amount: { type: 'number', description: 'Always positive' },
        currency: { type: 'string', description: "ISO code, e.g. 'INR', 'USD' — almost always INR" },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        category: { type: 'string', enum: CATEGORY_ENUM },
        subcategory: { type: ['string', 'null'] }
      },
      required: [
        'txn_date', 'direction', 'raw_text', 'description', 'amount', 'currency', 'confidence', 'category', 'subcategory'
      ],
      additionalProperties: false
    }
  },
  excluded_transactions: {
    type: 'array',
    description: 'Lines deliberately left out of transactions (transfers etc.), per the instructions',
    items: {
      type: 'object',
      properties: EXCLUDED_PROPERTIES,
      required: ['txn_date', 'description', 'amount', 'reason'],
      additionalProperties: false
    }
  },
  confidence_notes: { type: ['string', 'null'], description: 'Overall notes, e.g. fields you were unsure about' }
}

const REQUIRED_FIELDS = [
  'account_label',
  'statement_type',
  'statement_period_start',
  'statement_period_end',
  'opening_balance',
  'closing_balance',
  'transactions',
  'excluded_transactions',
  'confidence_notes'
]

// One JSON object per transaction rather than per month means output can be large for
// a statement with many lines. Combined with page-chunking below (which keeps any
// single call to at most MAX_PAGES_PER_CALL pages), this comfortably covers even a
// heavy UPI-era statement without truncating.
const MAX_TOKENS = 8192

async function runOneExtraction(filePath: string, trackedAccounts: CashFlowTrackedAccount[], todayIso: string) {
  return extractStructured<CashFlowStatementExtraction>({
    filePath,
    instructions: buildInstructions(trackedAccounts, todayIso),
    schemaName: 'extract_cash_flow_statement',
    properties: EXTRACTION_PROPERTIES,
    requiredFields: REQUIRED_FIELDS,
    maxTokens: MAX_TOKENS
  })
}

const MAX_PAGES_PER_CALL = 12
const CHUNK_CONCURRENCY = 3

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// A long statement risks truncating a single extraction call (see extraction.ts's
// TRUNCATED_MESSAGE) long before it risks confusing the model — splitting it into
// page-bounded chunks and extracting each independently keeps every call well under
// that ceiling. Only ever applies to an actual multi-page PDF; a single photographed
// page is always one call. Returns null (don't chunk) on anything that stops this
// from working cleanly, including a page count under the threshold.
async function splitIntoChunks(filePath: string): Promise<{ dir: string; paths: string[] } | null> {
  if (!filePath.toLowerCase().endsWith('.pdf')) return null
  try {
    const toolkit = await getPdfToolkit()
    const bytes = new Uint8Array(readFileSync(filePath))
    const pageCount = await toolkit.pageCount(bytes)
    if (pageCount <= MAX_PAGES_PER_CALL) return null
    const parts = await toolkit.split(bytes, { pagesPerFile: MAX_PAGES_PER_CALL })
    const dir = mkdtempSync(join(tmpdir(), 'artha-statement-'))
    const paths = parts.map((part, i) => {
      const p = join(dir, `part-${i}.pdf`)
      writeFileSync(p, part)
      return p
    })
    return { dir, paths }
  } catch {
    return null
  }
}

// Balances and the statement's own period are typically printed once (opening
// balance near the top, closing balance at the end) — only the first/last chunk's
// value is trustworthy for those; everything else concatenates across chunks.
function mergeExtractions(parts: CashFlowStatementExtraction[]): CashFlowStatementExtraction {
  if (parts.length === 1) return parts[0]
  const first = parts[0]
  const last = parts[parts.length - 1]
  const notes = parts
    .map((p, i) => (p.confidence_notes ? `Part ${i + 1}/${parts.length}: ${p.confidence_notes}` : null))
    .filter((n): n is string => n !== null)
  return {
    account_label: parts.find((p) => p.account_label)?.account_label ?? null,
    statement_type: parts.find((p) => p.statement_type !== 'unclear')?.statement_type ?? first.statement_type,
    statement_period_start: first.statement_period_start,
    statement_period_end: last.statement_period_end,
    opening_balance: first.opening_balance,
    closing_balance: last.closing_balance,
    transactions: parts.flatMap((p) => p.transactions),
    excluded_transactions: parts.flatMap((p) => p.excluded_transactions),
    confidence_notes: notes.length > 0 ? notes.join(' ') : null
  }
}

export async function extractCashFlowStatement(filePath: string): Promise<CashFlowStatementExtraction> {
  const trackedAccounts = listTrackedAccounts()
  const todayIso = todayLocalDateString()
  const chunked = await splitIntoChunks(filePath)
  if (!chunked) {
    return runOneExtraction(filePath, trackedAccounts, todayIso)
  }
  try {
    const parts = await mapWithConcurrency(chunked.paths, CHUNK_CONCURRENCY, (p) =>
      runOneExtraction(p, trackedAccounts, todayIso)
    )
    return mergeExtractions(parts)
  } finally {
    rmSync(chunked.dir, { recursive: true, force: true })
  }
}
