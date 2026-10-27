import { readFileSync } from 'fs'
import type { CashFlowExtractedTransaction, CashFlowStatementExtraction } from '../../shared/types'

// A lite, local, no-AI path for a bank's own CSV export — recognizes common header
// names rather than offering full column-mapping UI (XLS/XLSX and arbitrary column
// mapping are deliberately out of scope here, see the project plan). Feeds the exact
// same CashFlowStatementExtraction shape the AI path produces, so it goes through
// the identical review modal.

const DATE_HEADERS = ['date', 'txn date', 'transaction date', 'value date']
const DESC_HEADERS = ['description', 'narration', 'particulars', 'details', 'remarks']
const AMOUNT_HEADERS = ['amount']
const DEBIT_HEADERS = ['debit', 'withdrawal', 'withdrawal amt', 'dr']
const CREDIT_HEADERS = ['credit', 'deposit', 'deposit amt', 'cr']

// Minimal RFC4180-style split: handles quoted fields with embedded commas/quotes,
// which is as far as a bank CSV export typically goes.
function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      cells.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur)
  return cells.map((c) => c.trim())
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((h) => candidates.includes(h.toLowerCase().trim()))
}

function parseAmount(s: string): number | null {
  const cleaned = s
    .trim()
    .replace(/[₹,\s]/g, '')
    .replace(/^\((.+)\)$/, '-$1') // "(123.45)" accounting notation -> "-123.45"
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseDate(s: string): string | null {
  const trimmed = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

export function parseCsvStatement(filePath: string): CashFlowStatementExtraction {
  const text = readFileSync(filePath, 'utf-8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) throw new Error('This CSV has no data rows.')

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
  const dateCol = findColumn(headers, DATE_HEADERS)
  const descCol = findColumn(headers, DESC_HEADERS)
  const amountCol = findColumn(headers, AMOUNT_HEADERS)
  const debitCol = findColumn(headers, DEBIT_HEADERS)
  const creditCol = findColumn(headers, CREDIT_HEADERS)

  if (dateCol === -1 || descCol === -1) {
    throw new Error(
      `Couldn't recognize this CSV's columns — expected a date column (one of: ${DATE_HEADERS.join(', ')}) and a ` +
        `description column (one of: ${DESC_HEADERS.join(', ')}).`
    )
  }
  if (amountCol === -1 && (debitCol === -1 || creditCol === -1)) {
    throw new Error('Expected an "Amount" column, or separate "Debit"/"Credit" columns.')
  }

  const transactions: CashFlowExtractedTransaction[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const txnDate = parseDate(cells[dateCol] ?? '')
    const rawDesc = cells[descCol] ?? ''
    if (!txnDate || !rawDesc.trim()) continue

    let direction: 'income' | 'expense'
    let amount: number

    if (amountCol !== -1) {
      const parsed = parseAmount(cells[amountCol] ?? '')
      if (parsed === null || parsed === 0) continue
      direction = parsed >= 0 ? 'income' : 'expense'
      amount = Math.abs(parsed)
    } else {
      const debit = parseAmount(cells[debitCol] ?? '') ?? 0
      const credit = parseAmount(cells[creditCol] ?? '') ?? 0
      if (debit > 0) {
        direction = 'expense'
        amount = debit
      } else if (credit > 0) {
        direction = 'income'
        amount = credit
      } else {
        continue
      }
    }

    transactions.push({
      txn_date: txnDate,
      direction,
      raw_text: rawDesc,
      description: rawDesc.length > 60 ? `${rawDesc.slice(0, 57)}...` : rawDesc,
      amount,
      currency: 'INR',
      // CSV parsing is mechanical pattern-matching, not AI judgment — flagging every
      // row "medium" (not "high") steers the review table's confidence filter toward
      // showing these for a closer look, since categories below are only a guess.
      confidence: 'medium',
      category: 'discretionary',
      subcategory: null
    })
  }

  if (transactions.length === 0) throw new Error('No valid transaction rows found in this CSV.')

  const dates = [...transactions.map((t) => t.txn_date)].sort()
  return {
    account_label: null,
    statement_type: 'bank',
    statement_period_start: dates[0] ?? null,
    statement_period_end: dates[dates.length - 1] ?? null,
    opening_balance: null,
    closing_balance: null,
    transactions,
    confidence_notes: 'Imported from CSV — categories are a generic guess, not AI-read; review before saving.',
    // A CSV export almost never prints opening/closing balance columns, and this path
    // reads every row mechanically rather than exercising any judgment that could skip
    // one — there's nothing to reconcile against.
    balanceCheck: null
  }
}
