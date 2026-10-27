import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { extractStructured } from './extraction'
import { listTrackedAccounts } from './cashFlow'
import { getPdfToolkit } from './pdfToolkit'
import { todayLocalDateString } from '../dateUtils'
import { CASH_FLOW_SUBCATEGORIES } from '../../shared/types'
import type { CashFlowBalanceCheck, CashFlowDirection, CashFlowStatementExtraction, CashFlowTrackedAccount } from '../../shared/types'

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
    `Completeness matters most: EVERY single row printed in the transaction table must appear in transactions ` +
    `— never skip, merge, or leave out a row for any reason, including ones that look like a transfer to ` +
    `another of the user's own accounts, a refund, or a reversal (see the "transfer" category below — it ` +
    `stays IN transactions, just categorized differently; it never means leaving a row out). Don't skip a row ` +
    `because it looks minor, repetitive, or hard to categorize; when genuinely unsure how to categorize one, ` +
    `still include it with your best guess and confidence: "low" rather than leaving it out. ` +
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
    '"discretionary" (bonuses, gifts, refunds, one-off credits), "reimbursement" (ONLY when the description ' +
    'clearly shows someone paying back a shared cost, e.g. a flatmate\'s UPI note mentioning rent/bill split ' +
    '— if in doubt, use "discretionary" instead), or "transfer" (see below); for expense, one of ' +
    '"fixed_monthly" (rent, EMIs, subscriptions, utility bills), "other_fixed" (annual insurance, school ' +
    'fees, taxes), "discretionary" (everything else, including ATM cash withdrawals, bank charges/GST on ' +
    'fees, and a credit-card bill payment, unless you have reason to call any of those fixed), or "transfer" ' +
    '(see below). For an EMI line, if the statement breaks it into principal and interest components, report ' +
    'the principal portion as "fixed_monthly" and treat interest as part of the same line\'s amount (do not ' +
    'split one EMI into two transactions). — subcategory: ' +
    `your best guess from this list: ${subcategoryList} — or null if nothing fits well. ` +
    '"transfer" category: use this (not "discretionary") ONLY for a line that is obviously, by its own ' +
    'printed description, a movement to/from one of the OTHER tracked accounts listed above by name — e.g. a ' +
    'NEFT/IMPS/UPI transfer whose narration names a tracked investment or retirement account, or a bank-to-' +
    'bank transfer to an account you can tell is one of the others listed. It is NOT for a credit card bill ' +
    'payment (that is genuine spending from this account\'s point of view, since the card\'s own detailed ' +
    'spending is never imported separately — always categorize it under the expense rules above, never ' +
    '"transfer", even though a card may be one of the tracked accounts listed). When you can\'t tell from the ' +
    'description alone whether something is a transfer to a tracked account, categorize it normally instead ' +
    'of guessing "transfer" — a separate, more reliable check (matching this account\'s debit against the ' +
    'other account\'s own recorded credit) runs afterward and will correct the category then. Likewise, do ' +
    'NOT try to net, merge, or omit a same-day/next-day refund or reversal pair yourself — report BOTH lines ' +
    'as ordinary, separate transactions (never merged into one, never both omitted); that same afterward check ' +
    'also catches an exact-amount reversal within the same account and recategorizes both sides then. ' +
    'confidence_notes (top-level) — a brief note on anything ambiguous.'
  )
}

const DIRECTION_ENUM = ['income', 'expense']
const CATEGORY_ENUM = ['salary', 'other_fixed', 'discretionary', 'reimbursement', 'fixed_monthly', 'transfer']
const STATEMENT_TYPE_ENUM = ['bank', 'credit_card', 'unclear']

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
  'confidence_notes'
]

// One JSON object per transaction (9 required fields, including the full raw_text
// narration) rather than per month means output scales with transaction COUNT, not
// page count — a dense UPI/NACH-heavy statement can run ~20+ transactions per page,
// so page-count-based chunking alone (below) isn't a reliable proxy for staying under
// the token ceiling. Raised from 8192 after a real 9-page/186-transaction statement
// (well under MAX_PAGES_PER_CALL) still truncated. Safe to size generously: both
// providers bill for tokens actually generated, not the ceiling.
const MAX_TOKENS = 16384

// balanceCheck is computed in code after the model responds (see computeBalanceCheck
// below) — this is what the model itself actually returns, per chunk.
type ModelStatementExtraction = Omit<CashFlowStatementExtraction, 'balanceCheck'>

async function runOneExtraction(
  filePath: string,
  trackedAccounts: CashFlowTrackedAccount[],
  todayIso: string
): Promise<ModelStatementExtraction> {
  return extractStructured<ModelStatementExtraction>({
    filePath,
    instructions: buildInstructions(trackedAccounts, todayIso),
    schemaName: 'extract_cash_flow_statement',
    properties: EXTRACTION_PROPERTIES,
    requiredFields: REQUIRED_FIELDS,
    maxTokens: MAX_TOKENS
  })
}

// Retries one chunk's call on a transient provider-side error (rate limit or 5xx)
// before giving up on the whole statement — several chunks run concurrently (below),
// so without this, one flaky call among many would fail the entire import (forcing a
// full re-upload) even though every other chunk succeeded. Never retries our own
// semantic errors (truncation, missing API key, etc.) — those have no HTTP status and
// would just fail identically on a second try, so retrying them would only waste time.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const status = (err as { status?: number } | undefined)?.status
      const retryable = status === 429 || (typeof status === 'number' && status >= 500)
      if (!retryable || i === attempts - 1) throw err
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** i))
    }
  }
  throw lastErr
}

// Smaller per-call chunks that run concurrently finish faster in wall-clock time than
// one large serial call for the same total content — the model generates output
// tokens sequentially either way, so splitting the work across parallel calls (rather
// than one call doing it all) is a straightforward latency win with no change to what
// any individual call is asked to do, so no accuracy tradeoff. Every line is now a full
// transaction object (no more lightweight excluded-line shortcut), so this is sized a
// little smaller than before for extra margin: a dense 3-page chunk (~60-65
// transactions) still clears the MAX_TOKENS ceiling above with plenty to spare.
const MAX_PAGES_PER_CALL = 3
const CHUNK_CONCURRENCY = 5

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
function mergeExtractions(parts: ModelStatementExtraction[]): ModelStatementExtraction {
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
    confidence_notes: notes.length > 0 ? notes.join(' ') : null
  }
}

// A bank statement's own printed opening/closing balance is a free, independent check
// on completeness: opening_balance plus the net of every transaction (every line is
// now always included, whatever its category) should land exactly on closing_balance.
// A non-zero gap means something was missed, duplicated, or misread — a concrete,
// verifiable signal rather than just trusting the model's recall. Computed here in
// code, never asked of the model itself. Skipped (null) when either balance wasn't
// printed on the statement — absence of the check isn't evidence of a problem.
const RECONCILE_TOLERANCE = 1 // rupee, to absorb rounding noise across many summed lines

function computeBalanceCheck(e: ModelStatementExtraction): CashFlowBalanceCheck | null {
  if (e.opening_balance == null || e.closing_balance == null) return null
  const signed = (amount: number, direction: CashFlowDirection): number => (direction === 'income' ? amount : -amount)
  const txnNet = e.transactions.reduce((sum, t) => sum + signed(t.amount, t.direction), 0)
  const expectedClosing = Math.round((e.opening_balance + txnNet) * 100) / 100
  const gap = Math.round((e.closing_balance - expectedClosing) * 100) / 100
  return { expectedClosing, gap, reconciled: Math.abs(gap) <= RECONCILE_TOLERANCE }
}

export async function extractCashFlowStatement(
  filePath: string,
  onProgress?: (completed: number, total: number) => void
): Promise<CashFlowStatementExtraction> {
  const trackedAccounts = listTrackedAccounts()
  const todayIso = todayLocalDateString()
  const chunked = await splitIntoChunks(filePath)

  let merged: ModelStatementExtraction
  if (!chunked) {
    // A single call has no meaningful partial progress to report — the caller falls
    // back to an indeterminate spinner rather than a fabricated percentage.
    merged = await withRetry(() => runOneExtraction(filePath, trackedAccounts, todayIso))
  } else {
    try {
      const total = chunked.paths.length
      let completed = 0
      onProgress?.(0, total)
      const parts = await mapWithConcurrency(chunked.paths, CHUNK_CONCURRENCY, async (p) => {
        const result = await withRetry(() => runOneExtraction(p, trackedAccounts, todayIso))
        completed++
        onProgress?.(completed, total)
        return result
      })
      merged = mergeExtractions(parts)
    } finally {
      rmSync(chunked.dir, { recursive: true, force: true })
    }
  }
  return { ...merged, balanceCheck: computeBalanceCheck(merged) }
}
