import { randomUUID, createHash } from 'crypto'
import { readFileSync } from 'fs'
import { getDb } from '../db'
import { isValidLocalDate, toLocalDateString } from '../dateUtils'
import { convertToInr } from './exchangeRate'
import { isDocumentReferenced } from './cashFlowDocuments'
import { deleteStoredDocument } from '../fileStore'
import type {
  CashFlowAccountCoverage,
  CashFlowApplyExtractionInput,
  CashFlowCategory,
  CashFlowDirection,
  CashFlowImport,
  CashFlowMonthSummary,
  CashFlowRecurringInput,
  CashFlowRecurringTemplate,
  CashFlowTrackedAccount,
  CashFlowTransaction,
  CashFlowTransactionInput,
  IncomeCategory
} from '../../shared/types'

// A real transaction ledger — one row per individual income/expense transaction, each
// independently classifiable. See the cash_flow_transactions/cash_flow_imports/
// cash_flow_recurring table comments in db.ts and sync.ts's SYNCABLE_TABLES entries.

const INCOME_CATEGORIES: IncomeCategory[] = ['salary', 'other_fixed', 'discretionary', 'reimbursement']
const EXPENSE_CATEGORIES: CashFlowCategory[] = ['fixed_monthly', 'other_fixed', 'discretionary']

// Clamps a category to one valid for its direction — defends against a model (or a
// row edited mid-review after its direction was flipped) returning e.g. an expense
// category on an income row, which would otherwise silently drop that amount out of
// every category bucket in getMonthlySummary (it only matches direction+category together).
function normalizeCategory(direction: CashFlowDirection, category: string | null): CashFlowCategory | null {
  if (!category) return null
  const valid = direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  return (valid as string[]).includes(category) ? (category as CashFlowCategory) : null
}

export function listTransactions(month?: string): CashFlowTransaction[] {
  if (month) {
    return getDb()
      .prepare(
        `SELECT * FROM cash_flow_transactions WHERE deleted = 0 AND strftime('%Y-%m', txn_date) = ?
         ORDER BY txn_date DESC, id DESC`
      )
      .all(month) as CashFlowTransaction[]
  }
  return getDb()
    .prepare('SELECT * FROM cash_flow_transactions WHERE deleted = 0 ORDER BY txn_date DESC, id DESC')
    .all() as CashFlowTransaction[]
}

// Powers the Quarter/FY/YTD/custom-range period views — `start`/`end` are inclusive
// YYYY-MM-DD bounds. The single-month path above stays separate (and the common
// case) since it's a cheaper, simpler query and every existing call site already
// uses it.
export function listTransactionsInRange(start: string, end: string): CashFlowTransaction[] {
  return getDb()
    .prepare(
      `SELECT * FROM cash_flow_transactions WHERE deleted = 0 AND txn_date >= ? AND txn_date <= ?
       ORDER BY txn_date DESC, id DESC`
    )
    .all(start, end) as CashFlowTransaction[]
}

// Every tracked account a transaction can optionally link to — not just bank
// accounts (cards and other account types can receive a transfer or be the source
// of a payment too; see cashFlowParser.ts's buildInstructions).
export function listTrackedAccounts(): CashFlowTrackedAccount[] {
  return getDb()
    .prepare(
      `SELECT sync_id, name, institution, account_number FROM accounts
       WHERE deleted = 0 AND sync_id IS NOT NULL ORDER BY name`
    )
    .all() as CashFlowTrackedAccount[]
}

// Bank accounts specifically — the set a cash-flow transaction's "Bank account"
// field is scoped to (credit cards/"Cash" are added separately in the renderer).
export function listTrackedBankAccounts(): CashFlowTrackedAccount[] {
  return getDb()
    .prepare(
      `SELECT sync_id, name, institution, account_number FROM accounts
       WHERE category = 'bank' AND deleted = 0 AND sync_id IS NOT NULL ORDER BY name`
    )
    .all() as CashFlowTrackedAccount[]
}

export function listMonths(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT strftime('%Y-%m', txn_date) AS month FROM cash_flow_transactions
       WHERE deleted = 0 ORDER BY month DESC`
    )
    .all() as { month: string }[]
  return rows.map((r) => r.month)
}

function categorySum(direction: string, category: string): string {
  return `SUM(CASE WHEN direction = '${direction}' AND category = '${category}' THEN amount ELSE 0 END)`
}

function categorySumUncategorized(direction: string): string {
  return `SUM(CASE WHEN direction = '${direction}' AND category IS NULL THEN amount ELSE 0 END)`
}

export function getMonthlySummary(): CashFlowMonthSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT strftime('%Y-%m', txn_date) AS month,
         -- income_total deliberately excludes 'reimbursement' (money coming back to
         -- the user, not new income — see shared/types.ts's IncomeCategory comment).
         SUM(CASE WHEN direction = 'income' AND (category IS NULL OR category != 'reimbursement')
             THEN amount ELSE 0 END) AS income_total,
         SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END) AS expense_total,
         ${categorySum('income', 'salary')} AS income_salary,
         ${categorySum('income', 'other_fixed')} AS income_other_fixed,
         ${categorySum('income', 'discretionary')} AS income_discretionary,
         ${categorySum('income', 'reimbursement')} AS income_reimbursement,
         ${categorySumUncategorized('income')} AS income_uncategorized,
         ${categorySum('expense', 'fixed_monthly')} AS expense_fixed_monthly,
         ${categorySum('expense', 'other_fixed')} AS expense_other_fixed,
         ${categorySum('expense', 'discretionary')} AS expense_discretionary,
         ${categorySumUncategorized('expense')} AS expense_uncategorized
       FROM cash_flow_transactions WHERE deleted = 0 GROUP BY month ORDER BY month`
    )
    .all() as Omit<CashFlowMonthSummary, 'net'>[]
  return rows.map((r) => ({ ...r, net: r.income_total - r.expense_total }))
}

function getTransaction(id: number): CashFlowTransaction | undefined {
  return getDb().prepare('SELECT * FROM cash_flow_transactions WHERE id = ?').get(id) as
    | CashFlowTransaction
    | undefined
}

// Returns an error message, or null if valid — shared by every write path
// (manual create/update AND the AI-apply path) so nothing can skip it. Checked
// before any row is inserted, not after.
function validationError(input: { description: string; txn_date: string; amount: number }): string | null {
  if (!input.description.trim()) return 'Enter a description for this transaction'
  if (!isValidLocalDate(input.txn_date)) return 'Enter a valid date'
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'Enter a valid amount greater than zero'
  return null
}

function validateInput(input: CashFlowTransactionInput): void {
  const error = validationError(input)
  if (error) throw new Error(error)
}

// Converts to INR when a non-INR currency is given (via the same live-rate service
// built for RSU statements — see exchangeRate.ts); returns the input amount/nulls
// unchanged for INR (or no currency), with no network call in the common case.
async function resolveAmount(
  amount: number,
  currency: string | null
): Promise<{ amount: number; currency: string | null; amountNative: number | null }> {
  if (!currency || currency.trim().toUpperCase() === 'INR') {
    return { amount, currency: null, amountNative: null }
  }
  const { value } = await convertToInr(amount, currency)
  return { amount: Math.round(value * 100) / 100, currency: currency.trim().toUpperCase(), amountNative: amount }
}

interface InsertOptions {
  importId?: number | null
  documentPath?: string | null
  documentOriginalName?: string | null
  isSample?: boolean
}

function insertTransactionRow(
  input: CashFlowTransactionInput,
  resolved: { amount: number; currency: string | null; amountNative: number | null },
  now: string,
  opts: InsertOptions = {}
): CashFlowTransaction {
  const info = getDb()
    .prepare(
      `INSERT INTO cash_flow_transactions
        (txn_date, direction, description, account_sync_id, amount, currency, amount_native, category,
         subcategory, import_id, entry_method, is_sample, notes, document_path, document_original_name,
         sync_id, updated_at, created_at)
       VALUES (@txn_date, @direction, @description, @account_sync_id, @amount, @currency, @amount_native,
         @category, @subcategory, @import_id, @entry_method, @is_sample, @notes, @document_path,
         @document_original_name, @sync_id, @updated_at, @created_at)`
    )
    .run({
      txn_date: input.txn_date,
      direction: input.direction,
      description: input.description,
      account_sync_id: input.account_sync_id,
      amount: resolved.amount,
      currency: resolved.currency,
      amount_native: resolved.amountNative,
      category: normalizeCategory(input.direction, input.category),
      subcategory: input.subcategory ?? null,
      import_id: opts.importId ?? null,
      entry_method: input.entry_method,
      is_sample: opts.isSample ? 1 : 0,
      notes: input.notes,
      document_path: opts.documentPath ?? null,
      document_original_name: opts.documentOriginalName ?? null,
      sync_id: randomUUID(),
      updated_at: now,
      created_at: now
    })
  return getTransaction(Number(info.lastInsertRowid))!
}

export async function createTransaction(input: CashFlowTransactionInput): Promise<CashFlowTransaction> {
  validateInput(input)
  const resolved = await resolveAmount(input.amount, input.currency)
  return insertTransactionRow(input, resolved, new Date().toISOString())
}

export async function updateTransaction(id: number, input: CashFlowTransactionInput): Promise<CashFlowTransaction> {
  const existing = getTransaction(id)
  if (!existing) throw new Error('Transaction not found')
  validateInput(input)
  const resolved = await resolveAmount(input.amount, input.currency)
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `UPDATE cash_flow_transactions SET
         txn_date = @txn_date, direction = @direction, description = @description,
         account_sync_id = @account_sync_id, amount = @amount, currency = @currency,
         amount_native = @amount_native, category = @category, subcategory = @subcategory,
         notes = @notes, updated_at = @updated_at
       WHERE id = @id`
    )
    .run({
      txn_date: input.txn_date,
      direction: input.direction,
      description: input.description,
      account_sync_id: input.account_sync_id,
      amount: resolved.amount,
      currency: resolved.currency,
      amount_native: resolved.amountNative,
      category: normalizeCategory(input.direction, input.category),
      subcategory: input.subcategory ?? null,
      notes: input.notes,
      updated_at: now,
      id
    })
  return getTransaction(id)!
}

// Single-column update for the ledger's inline category picker — avoids forcing a
// full modal round-trip just to reclassify a row.
export function updateTransactionCategory(
  id: number,
  category: CashFlowCategory | null,
  subcategory: string | null
): CashFlowTransaction {
  const existing = getTransaction(id)
  if (!existing) throw new Error('Transaction not found')
  getDb()
    .prepare('UPDATE cash_flow_transactions SET category = ?, subcategory = ?, updated_at = ? WHERE id = ?')
    .run(normalizeCategory(existing.direction, category), subcategory, new Date().toISOString(), id)
  return getTransaction(id)!
}

export function bulkUpdateCategory(ids: number[], category: CashFlowCategory | null, subcategory: string | null): void {
  const now = new Date().toISOString()
  const stmt = getDb().prepare(
    'UPDATE cash_flow_transactions SET category = ?, subcategory = ?, updated_at = ? WHERE id = ? AND deleted = 0'
  )
  for (const id of ids) {
    const existing = getTransaction(id)
    if (!existing) continue
    stmt.run(normalizeCategory(existing.direction, category), subcategory, now, id)
  }
}

// Best-effort: once no non-deleted transaction/import references a stored statement
// file any more, the local copy is removed (see fileStore.ts's deleteStoredDocument
// doc comment for why this is local-only).
function cleanupDocumentIfOrphaned(documentPath: string | null): void {
  if (!documentPath) return
  if (!isDocumentReferenced(documentPath)) deleteStoredDocument(documentPath)
}

export function bulkDeleteTransactions(ids: number[]): void {
  const now = new Date().toISOString()
  const stmt = getDb().prepare('UPDATE cash_flow_transactions SET deleted = 1, updated_at = ? WHERE id = ?')
  for (const id of ids) {
    const existing = getTransaction(id)
    stmt.run(now, id)
    if (existing) cleanupDocumentIfOrphaned(existing.document_path)
  }
}

// Soft delete — see accounts.ts's deleteAccount for why (tombstone propagates via sync
// instead of just vanishing locally with nothing for other devices to learn from).
export function deleteTransaction(id: number): void {
  const existing = getTransaction(id)
  getDb()
    .prepare('UPDATE cash_flow_transactions SET deleted = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
  if (existing) cleanupDocumentIfOrphaned(existing.document_path)
}

export function restoreTransaction(id: number): CashFlowTransaction {
  getDb()
    .prepare('UPDATE cash_flow_transactions SET deleted = 0, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
  return getTransaction(id)!
}

// Distinct recent (description, category, subcategory, account) combos, most-recent
// first — powers the manual-entry description autocomplete AND (cashFlowParser.ts
// callers) pre-filling a category for an AI-extracted row matching a previously
// classified description. SQLite's GROUP BY picks an arbitrary row per group without
// an aggregate, so this orders first and relies on "first row wins" being the most
// recent one via a correlated MAX(id).
export function recentDescriptions(
  limit = 50
): { description: string; category: CashFlowCategory | null; subcategory: string | null; account_sync_id: string | null }[] {
  return getDb()
    .prepare(
      `SELECT description, category, subcategory, account_sync_id FROM cash_flow_transactions t1
       WHERE deleted = 0 AND id = (
         SELECT MAX(id) FROM cash_flow_transactions t2
         WHERE t2.deleted = 0 AND lower(t2.description) = lower(t1.description)
       )
       ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as {
    description: string
    category: CashFlowCategory | null
    subcategory: string | null
    account_sync_id: string | null
  }[]
}

// ---- Account deletion handoff (called from accounts.ts's deleteAccount flow via
// the renderer, which asks the user first — see Accounts.tsx) ----

export function countTransactionsForAccount(accountSyncId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM cash_flow_transactions WHERE account_sync_id = ? AND deleted = 0')
    .get(accountSyncId) as { n: number }
  return row.n
}

export function unlinkAccountFromTransactions(accountSyncId: string): void {
  getDb()
    .prepare(
      'UPDATE cash_flow_transactions SET account_sync_id = NULL, updated_at = ? WHERE account_sync_id = ? AND deleted = 0'
    )
    .run(new Date().toISOString(), accountSyncId)
}

export function deleteTransactionsForAccount(accountSyncId: string): void {
  const ids = (
    getDb()
      .prepare('SELECT id FROM cash_flow_transactions WHERE account_sync_id = ? AND deleted = 0')
      .all(accountSyncId) as { id: number }[]
  ).map((r) => r.id)
  bulkDeleteTransactions(ids)
}

// ---- Statement imports ----

export function fileHashOf(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

// Checked BEFORE the file is ever sent to an AI provider, so a re-upload of the exact
// same file is caught for free rather than after paying for the extraction. Not
// scoped to an account — at this point (right after picking the file, before
// extraction has even run) the account isn't known yet, since it's normally read
// from the statement itself; a match on file bytes alone is already a strong signal
// regardless of which account it ends up filed under.
export function findImportByHash(fileHash: string): CashFlowImport | undefined {
  return getDb()
    .prepare('SELECT * FROM cash_flow_imports WHERE file_hash = ? AND deleted = 0 ORDER BY id DESC LIMIT 1')
    .get(fileHash) as CashFlowImport | undefined
}

// This month's statement coverage per tracked account, from whichever import(s)
// touched it — lets the user see at a glance whether a month is only partially
// imported for a given account (e.g. a mid-month statement cut).
export function getAccountCoverage(month: string): CashFlowAccountCoverage[] {
  const accounts = listTrackedBankAccounts()
  const rows = getDb()
    .prepare(
      `SELECT account_sync_id, MIN(statement_period_start) AS start, MAX(statement_period_end) AS end
       FROM cash_flow_imports
       WHERE deleted = 0 AND (
         strftime('%Y-%m', statement_period_start) = ? OR strftime('%Y-%m', statement_period_end) = ?
       )
       GROUP BY account_sync_id`
    )
    .all(month, month) as { account_sync_id: string; start: string | null; end: string | null }[]
  const byAccount = new Map(rows.map((r) => [r.account_sync_id, r]))
  return accounts
    .filter((a) => byAccount.has(a.sync_id))
    .map((a) => {
      const r = byAccount.get(a.sync_id)!
      return {
        account_sync_id: a.sync_id,
        account_name: a.name,
        statement_period_start: r.start,
        statement_period_end: r.end
      }
    })
}

interface ApplyExtractionResult {
  importId: number
  transactions: CashFlowTransaction[]
}

// Applies an AI-extracted bank statement (after user review) into the ledger: every
// transaction is validated BEFORE any of them are inserted (so a bad row fails the
// whole save instead of silently landing with blank/invalid data), then inserted
// together with a new cash_flow_imports row that lets the whole batch be undone or
// reconciled as a unit later.
export async function applyCashFlowExtraction(input: CashFlowApplyExtractionInput): Promise<ApplyExtractionResult> {
  const { accountSyncId, transactions, excludedTransactions } = input
  if (transactions.length === 0) throw new Error('Nothing to save — add at least one transaction or cancel.')

  const errors: string[] = []
  transactions.forEach((t, i) => {
    const error = validationError(t)
    if (error) errors.push(`Row ${i + 1}: ${error}`)
  })
  if (errors.length > 0) throw new Error(errors.join('; '))

  const now = new Date().toISOString()
  const importInfo = getDb()
    .prepare(
      `INSERT INTO cash_flow_imports
        (account_sync_id, file_hash, document_path, document_original_name, statement_period_start,
         statement_period_end, opening_balance, closing_balance, transaction_count, excluded_json,
         sync_id, updated_at, created_at)
       VALUES (@account_sync_id, @file_hash, @document_path, @document_original_name, @statement_period_start,
         @statement_period_end, @opening_balance, @closing_balance, @transaction_count, @excluded_json,
         @sync_id, @updated_at, @created_at)`
    )
    .run({
      account_sync_id: accountSyncId,
      file_hash: input.fileHash,
      document_path: input.documentPath,
      document_original_name: input.documentOriginalName,
      statement_period_start: input.statementPeriodStart,
      statement_period_end: input.statementPeriodEnd,
      opening_balance: input.openingBalance,
      closing_balance: input.closingBalance,
      transaction_count: transactions.length,
      excluded_json: excludedTransactions.length > 0 ? JSON.stringify(excludedTransactions) : null,
      sync_id: randomUUID(),
      updated_at: now,
      created_at: now
    })
  const importId = Number(importInfo.lastInsertRowid)

  const saved: CashFlowTransaction[] = []
  for (const t of transactions) {
    const resolved = await resolveAmount(t.amount, t.currency)
    saved.push(
      insertTransactionRow(
        {
          txn_date: t.txn_date,
          direction: t.direction,
          description: t.description,
          account_sync_id: accountSyncId,
          amount: t.amount,
          currency: t.currency,
          category: t.category,
          subcategory: t.subcategory,
          entry_method: 'ai_extracted',
          notes: t.raw_text
        },
        resolved,
        now,
        { importId, documentPath: input.documentPath, documentOriginalName: input.documentOriginalName }
      )
    )
  }
  return { importId, transactions: saved }
}

// Deletes every transaction from one statement upload in one action, plus the import
// record itself — the recovery path for "I imported the wrong file" or an accidental
// duplicate import, without hunting down every row by hand.
export function deleteImport(importId: number): void {
  const now = new Date().toISOString()
  const txns = getDb()
    .prepare('SELECT document_path FROM cash_flow_transactions WHERE import_id = ? AND deleted = 0')
    .all(importId) as { document_path: string | null }[]
  getDb()
    .prepare('UPDATE cash_flow_transactions SET deleted = 1, updated_at = ? WHERE import_id = ?')
    .run(now, importId)
  getDb().prepare('UPDATE cash_flow_imports SET deleted = 1, updated_at = ? WHERE id = ?').run(now, importId)
  const path = txns[0]?.document_path ?? null
  cleanupDocumentIfOrphaned(path)
}

// ---- Recurring templates (db.ts's cash_flow_recurring comment explains why this
// never auto-creates a real transaction) ----

export function listRecurring(): CashFlowRecurringTemplate[] {
  return getDb()
    .prepare('SELECT * FROM cash_flow_recurring WHERE deleted = 0 ORDER BY day_of_month, description')
    .all() as CashFlowRecurringTemplate[]
}

export function createRecurring(input: CashFlowRecurringInput): CashFlowRecurringTemplate {
  const now = new Date().toISOString()
  const info = getDb()
    .prepare(
      `INSERT INTO cash_flow_recurring
        (direction, description, account_sync_id, amount, category, subcategory, day_of_month,
         sync_id, updated_at, created_at)
       VALUES (@direction, @description, @account_sync_id, @amount, @category, @subcategory, @day_of_month,
         @sync_id, @updated_at, @created_at)`
    )
    .run({ ...input, category: normalizeCategory(input.direction, input.category), sync_id: randomUUID(), updated_at: now, created_at: now })
  return getDb()
    .prepare('SELECT * FROM cash_flow_recurring WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as CashFlowRecurringTemplate
}

export function deleteRecurring(id: number): void {
  getDb()
    .prepare('UPDATE cash_flow_recurring SET deleted = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

// Templates not yet "handled" (added or dismissed) for the given month — the
// dashboard/ledger nudge's data source. Marking one handled (whether the user added
// it or dismissed the nudge) just records the month so it stops being surfaced,
// without ever inserting a transaction on the user's behalf.
export function dueRecurring(month: string): CashFlowRecurringTemplate[] {
  return getDb()
    .prepare(
      `SELECT * FROM cash_flow_recurring
       WHERE deleted = 0 AND (last_created_month IS NULL OR last_created_month != ?)
       ORDER BY day_of_month`
    )
    .all(month) as CashFlowRecurringTemplate[]
}

export function markRecurringHandled(id: number, month: string): void {
  getDb()
    .prepare('UPDATE cash_flow_recurring SET last_created_month = ?, updated_at = ? WHERE id = ?')
    .run(month, new Date().toISOString(), id)
}

// ---- Sample data ----

const SAMPLE_DESCRIPTIONS: { direction: CashFlowDirection; description: string; category: CashFlowCategory; subcategory: string; amount: number }[] = [
  { direction: 'income', description: 'Salary', category: 'salary', subcategory: 'Salary', amount: 85000 },
  { direction: 'income', description: 'Savings account interest', category: 'other_fixed', subcategory: 'Interest / Dividends', amount: 450 },
  { direction: 'expense', description: 'Rent', category: 'fixed_monthly', subcategory: 'Rent / Housing', amount: 22000 },
  { direction: 'expense', description: 'Electricity bill', category: 'fixed_monthly', subcategory: 'Bills & Utilities', amount: 1800 },
  { direction: 'expense', description: 'Mobile recharge', category: 'fixed_monthly', subcategory: 'Bills & Utilities', amount: 599 },
  { direction: 'expense', description: 'Groceries', category: 'discretionary', subcategory: 'Groceries', amount: 4200 },
  { direction: 'expense', description: 'Swiggy order', category: 'discretionary', subcategory: 'Food & Dining', amount: 420 },
  { direction: 'expense', description: 'Uber ride', category: 'discretionary', subcategory: 'Transport', amount: 260 },
  { direction: 'expense', description: 'Movie tickets', category: 'discretionary', subcategory: 'Entertainment', amount: 900 },
  { direction: 'expense', description: 'Annual health insurance premium', category: 'other_fixed', subcategory: 'Healthcare', amount: 1200 }
]

// Seeds 3 months of realistic-looking demo transactions, each tagged is_sample so
// they can all be found and removed in one action later — never mixed silently into
// real totals without the user knowing, since the ledger badges them (see
// CashFlow.tsx).
export function generateSampleData(): number {
  const now = new Date().toISOString()
  let count = 0
  for (let monthsAgo = 0; monthsAgo < 3; monthsAgo++) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - monthsAgo)
    for (const item of SAMPLE_DESCRIPTIONS) {
      const day = 1 + Math.floor(Math.random() * 27)
      const txnDate = toLocalDateString(new Date(d.getFullYear(), d.getMonth(), day))
      const jitter = 1 + (Math.random() * 0.2 - 0.1)
      insertTransactionRow(
        {
          txn_date: txnDate,
          direction: item.direction,
          description: item.description,
          account_sync_id: null,
          amount: Math.round(item.amount * jitter),
          currency: null,
          category: item.category,
          subcategory: item.subcategory,
          entry_method: 'manual',
          notes: null
        },
        { amount: Math.round(item.amount * jitter), currency: null, amountNative: null },
        now,
        { isSample: true }
      )
      count++
    }
  }
  return count
}

export function removeSampleData(): void {
  const ids = (
    getDb().prepare('SELECT id FROM cash_flow_transactions WHERE is_sample = 1 AND deleted = 0').all() as {
      id: number
    }[]
  ).map((r) => r.id)
  bulkDeleteTransactions(ids)
}

export function hasSampleData(): boolean {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM cash_flow_transactions WHERE is_sample = 1 AND deleted = 0')
    .get() as { n: number }
  return row.n > 0
}

// ---- Export ----

function csvCell(value: string | number | null): string {
  const s = value === null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildCsv(month?: string): string {
  const rows = listTransactions(month)
  const accounts = new Map(listTrackedAccounts().map((a) => [a.sync_id, a.name]))
  const header = [
    'Date', 'Direction', 'Description', 'Amount', 'Currency', 'Native amount', 'Category', 'Subcategory',
    'Account', 'Source', 'Statement file'
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.txn_date,
        r.direction,
        r.description,
        r.amount,
        r.currency ?? 'INR',
        r.amount_native ?? '',
        r.category ?? '',
        r.subcategory ?? '',
        r.account_sync_id ? (accounts.get(r.account_sync_id) ?? '') : '',
        r.entry_method,
        r.document_original_name ?? ''
      ]
        .map(csvCell)
        .join(',')
    )
  }
  return lines.join('\r\n')
}
