import { randomUUID } from 'crypto'
import { getDb } from '../db'
import type { Account, AccountCategory, AccountInput, ValueHistoryRow } from '../../shared/types'
import { recordSnapshot } from './netWorth'

export function listAccounts(): Account[] {
  return getDb().prepare('SELECT * FROM accounts WHERE deleted = 0 ORDER BY category, name').all() as Account[]
}

export function getAccount(id: number): Account | undefined {
  return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined
}

// sync_id is deliberately absent from the public Account type (see sync.ts) — this
// is the one place that needs it anyway, to hand off to cashFlow.ts's account-delete
// orphan check (see Accounts.tsx).
export function getAccountSyncId(id: number): string | null {
  const row = getDb().prepare('SELECT sync_id FROM accounts WHERE id = ?').get(id) as { sync_id: string | null } | undefined
  return row?.sync_id ?? null
}

export function createAccount(input: AccountInput): Account {
  const now = new Date().toISOString()
  const info = getDb()
    .prepare(
      `INSERT INTO accounts
        (name, category, subtype, institution, currency, is_liability, current_value,
         ticker, quantity, last_price, last_price_at, account_number, ifsc_code,
         debit_card_number, debit_card_network, debit_card_expiry_month, debit_card_expiry_year,
         debit_card_cvv, debit_card_name_on_card, principal_amount, interest_rate, tenure_months,
         emi_amount, loan_start_date, document_path, document_original_name, purchase_price, purchase_date,
         ownership_pct, last_updated, notes, created_at, sync_id)
       VALUES (@name, @category, @subtype, @institution, @currency, @is_liability, @current_value,
               @ticker, @quantity, @last_price, @last_price_at, @account_number, @ifsc_code,
               @debit_card_number, @debit_card_network, @debit_card_expiry_month, @debit_card_expiry_year,
               @debit_card_cvv, @debit_card_name_on_card, @principal_amount, @interest_rate, @tenure_months,
               @emi_amount, @loan_start_date, @document_path, @document_original_name, @purchase_price, @purchase_date,
               @ownership_pct, @last_updated, @notes, @created_at, @sync_id)`
    )
    .run({ ...input, last_updated: now, created_at: now, sync_id: randomUUID() })
  const account = getAccount(Number(info.lastInsertRowid))!
  recordValueHistory(account.id, account.current_value, 'manual', account.principal_amount, account.quantity)
  recordSnapshot()
  return account
}

export function updateAccount(id: number, input: Partial<AccountInput>): Account {
  const existing = getAccount(id)
  if (!existing) throw new Error('Account not found')
  const merged = { ...existing, ...input, last_updated: new Date().toISOString() }
  getDb()
    .prepare(
      `UPDATE accounts SET
        name=@name, category=@category, subtype=@subtype, institution=@institution,
        currency=@currency, is_liability=@is_liability, current_value=@current_value,
        ticker=@ticker, quantity=@quantity, last_price=@last_price, last_price_at=@last_price_at,
        account_number=@account_number, ifsc_code=@ifsc_code,
        debit_card_number=@debit_card_number, debit_card_network=@debit_card_network,
        debit_card_expiry_month=@debit_card_expiry_month, debit_card_expiry_year=@debit_card_expiry_year,
        debit_card_cvv=@debit_card_cvv, debit_card_name_on_card=@debit_card_name_on_card,
        principal_amount=@principal_amount, interest_rate=@interest_rate, tenure_months=@tenure_months,
        emi_amount=@emi_amount, loan_start_date=@loan_start_date, document_path=@document_path,
        document_original_name=@document_original_name, purchase_price=@purchase_price,
        purchase_date=@purchase_date, ownership_pct=@ownership_pct, last_updated=@last_updated, notes=@notes
       WHERE id=@id`
    )
    .run({ ...merged, id })
  if (input.current_value !== undefined && input.current_value !== existing.current_value) {
    recordValueHistory(id, input.current_value, 'manual', merged.principal_amount, merged.quantity)
  }
  recordSnapshot()
  return getAccount(id)!
}

// Soft delete: a hard DELETE has nothing to replicate — another device that already
// pulled this row would never learn it was removed. Flagging `deleted` and bumping
// `last_updated` instead gives sync.ts a tombstone to push.
export function deleteAccount(id: number): void {
  getDb()
    .prepare('UPDATE accounts SET deleted = 1, last_updated = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
  recordSnapshot()
}

export function recordValueHistory(
  accountId: number,
  value: number,
  source: string,
  investedValue?: number | null,
  quantity?: number | null
): void {
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO value_history (account_id, value, recorded_at, source, invested_value, quantity, sync_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(accountId, value, now, source, investedValue ?? null, quantity ?? null, randomUUID(), now)
}

export function getValueHistory(accountId: number): ValueHistoryRow[] {
  return getDb()
    .prepare('SELECT * FROM value_history WHERE account_id = ? AND deleted = 0 ORDER BY recorded_at')
    .all(accountId) as ValueHistoryRow[]
}

// Sets current_value from whichever value_history entry is most recent (by date),
// without touching last_price/last_price_at or inserting another history row.
// Called after any check-in / history edit / history delete so current_value always
// reflects the latest known entry, even if that edit changed which entry is newest.
// Exported so sync.ts can call it after pulling a remote value_history change —
// a check-in made on another device should update this account's current_value
// here too, exactly as if it had been entered locally.
export function recomputeCurrentValueFromHistory(accountId: number): void {
  const latest = getDb()
    .prepare(
      `SELECT value, invested_value, quantity FROM value_history WHERE account_id = ? AND deleted = 0
       ORDER BY substr(recorded_at, 1, 10) DESC, id DESC LIMIT 1`
    )
    .get(accountId) as { value: number; invested_value: number | null; quantity: number | null } | undefined
  if (!latest) return
  // COALESCE so a check-in that didn't specify invested_value/quantity doesn't wipe out
  // whatever was last known for the account.
  getDb()
    .prepare(
      `UPDATE accounts SET current_value = ?, last_updated = ?,
         principal_amount = COALESCE(?, principal_amount),
         quantity = COALESCE(?, quantity)
       WHERE id = ?`
    )
    .run(latest.value, new Date().toISOString(), latest.invested_value, latest.quantity, accountId)
}

// Upserts a dated value entry — one per account per calendar day. Re-checking in on
// the same date corrects that day's entry rather than creating a duplicate.
export function checkInValue(
  accountId: number,
  date: string,
  value: number,
  investedValue?: number | null,
  quantity?: number | null
): Account {
  const db = getDb()
  const dateOnly = date.slice(0, 10)
  const now = new Date().toISOString()
  const existing = db
    .prepare(
      `SELECT id FROM value_history
       WHERE account_id = ? AND source = 'check_in' AND substr(recorded_at, 1, 10) = ? AND deleted = 0`
    )
    .get(accountId, dateOnly) as { id: number } | undefined
  if (existing) {
    db.prepare(
      'UPDATE value_history SET value = ?, recorded_at = ?, invested_value = ?, quantity = ?, updated_at = ? WHERE id = ?'
    ).run(value, dateOnly, investedValue ?? null, quantity ?? null, now, existing.id)
  } else {
    db.prepare(
      `INSERT INTO value_history (account_id, value, recorded_at, source, invested_value, quantity, sync_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(accountId, value, dateOnly, 'check_in', investedValue ?? null, quantity ?? null, randomUUID(), now)
  }
  recomputeCurrentValueFromHistory(accountId)
  recordSnapshot()
  return getAccount(accountId)!
}

export function updateValueHistoryEntry(
  historyId: number,
  date: string,
  value: number,
  investedValue?: number | null,
  quantity?: number | null
): ValueHistoryRow {
  const row = getDb().prepare('SELECT * FROM value_history WHERE id = ?').get(historyId) as
    | ValueHistoryRow
    | undefined
  if (!row) throw new Error('Entry not found')
  getDb()
    .prepare(
      'UPDATE value_history SET value = ?, recorded_at = ?, invested_value = ?, quantity = ?, updated_at = ? WHERE id = ?'
    )
    .run(value, date.slice(0, 10), investedValue ?? null, quantity ?? null, new Date().toISOString(), historyId)
  recomputeCurrentValueFromHistory(row.account_id)
  recordSnapshot()
  return getDb().prepare('SELECT * FROM value_history WHERE id = ?').get(historyId) as ValueHistoryRow
}

// Soft delete — see src/main/services/accounts.ts's deleteAccount for why.
export function deleteValueHistoryEntry(historyId: number): void {
  const row = getDb().prepare('SELECT * FROM value_history WHERE id = ?').get(historyId) as
    | ValueHistoryRow
    | undefined
  if (!row) return
  getDb()
    .prepare('UPDATE value_history SET deleted = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), historyId)
  recomputeCurrentValueFromHistory(row.account_id)
  recordSnapshot()
}

// Aggregate trend for every account in a category, forward-filling each account's
// last known value between its check-ins so the total on any given date reflects
// what was actually known at that point, not just dates where something changed.
export function getCategoryValueHistory(
  category: AccountCategory
): { date: string; total: number }[] {
  const db = getDb()
  const accountIds = (
    db.prepare('SELECT id FROM accounts WHERE category = ?').all(category) as { id: number }[]
  ).map((r) => r.id)
  if (accountIds.length === 0) return []

  const placeholders = accountIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT account_id, value, recorded_at FROM value_history
       WHERE account_id IN (${placeholders}) AND deleted = 0 ORDER BY recorded_at ASC, id ASC`
    )
    .all(...accountIds) as { account_id: number; value: number; recorded_at: string }[]

  const byDate = new Map<string, Map<number, number>>()
  for (const r of rows) {
    const date = r.recorded_at.slice(0, 10)
    if (!byDate.has(date)) byDate.set(date, new Map())
    byDate.get(date)!.set(r.account_id, r.value)
  }
  const sortedDates = Array.from(byDate.keys()).sort()

  const lastKnown = new Map<number, number>()
  const result: { date: string; total: number }[] = []
  for (const date of sortedDates) {
    for (const [accId, val] of byDate.get(date)!) lastKnown.set(accId, val)
    let total = 0
    for (const v of lastKnown.values()) total += v
    result.push({ date, total })
  }
  return result
}
