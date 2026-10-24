import * as Crypto from 'expo-crypto'
import { getDb } from './db'
import { updateAccountValueFields } from './accountsRepo'

/** Mirrors src/main/services/accounts.ts's value_history handling exactly — see that
 * file's checkInValue/recomputeCurrentValueFromHistory/recordValueHistory. Unlike
 * desktop, mobile's rows reference accounts by `account_sync_id` directly (not a
 * local autoincrement id needing translation) — mobile's accounts table already
 * uses sync_id as its own primary key, so there's no local/portable-id split to
 * manage the way src/main/sync.ts's dedicated pushValueHistory/pullValueHistory
 * (Phase 0c) has to for desktop. Every field here is a plain scalar column — no
 * payload blob needed, unlike accounts/credit cards/etc. */

export interface ValueHistoryEntry {
  sync_id: string
  account_sync_id: string
  value: number
  recorded_at: string
  source: string
  invested_value: number | null
  quantity: number | null
  last_updated: string
}

export type ValueHistoryRow = ValueHistoryEntry & { deleted: number; dirty: number }

function recomputeCurrentValueFromHistory(accountSyncId: string): void {
  const latest = getDb().getFirstSync<{ value: number; invested_value: number | null; quantity: number | null }>(
    `SELECT value, invested_value, quantity FROM value_history
     WHERE account_sync_id = ? AND deleted = 0
     ORDER BY substr(recorded_at, 1, 10) DESC, rowid DESC LIMIT 1`,
    [accountSyncId]
  )
  if (!latest) return
  // COALESCE-style: a check-in that didn't specify invested_value/quantity doesn't
  // wipe out whatever the account already had — see accountsRepo's
  // updateAccountValueFields and tableStore's updateRow for how `undefined` is
  // treated as "leave untouched".
  updateAccountValueFields(accountSyncId, {
    current_value: latest.value,
    principal_amount: latest.invested_value ?? undefined,
    quantity: latest.quantity ?? undefined
  })
}

export function getValueHistory(accountSyncId: string): ValueHistoryEntry[] {
  return getDb().getAllSync<ValueHistoryEntry>(
    `SELECT sync_id, account_sync_id, value, recorded_at, source, invested_value, quantity, last_updated
     FROM value_history WHERE account_sync_id = ? AND deleted = 0 ORDER BY recorded_at DESC`,
    [accountSyncId]
  )
}

/** Plain insert, source='manual' — called when an account is created or its
 * current_value is directly edited (not via check-in), matching desktop's
 * createAccount/updateAccount seeding a history row for every value-affecting write. */
export function recordValueHistory(
  accountSyncId: string,
  value: number,
  source: string,
  investedValue: number | null = null,
  quantity: number | null = null
): void {
  const now = new Date().toISOString()
  getDb().runSync(
    `INSERT INTO value_history (sync_id, account_sync_id, value, recorded_at, source, invested_value, quantity, last_updated, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [Crypto.randomUUID(), accountSyncId, value, now, source, investedValue, quantity, now]
  )
}

/** One row per account per calendar day, keyed by source='check_in' — re-checking in
 * on the same date edits that day's entry instead of duplicating it, exactly
 * matching desktop's checkInValue. */
export function checkIn(
  accountSyncId: string,
  date: string,
  value: number,
  investedValue: number | null = null,
  quantity: number | null = null
): void {
  const dateOnly = date.slice(0, 10)
  const now = new Date().toISOString()
  const db = getDb()
  const existing = db.getFirstSync<{ sync_id: string }>(
    `SELECT sync_id FROM value_history WHERE account_sync_id = ? AND source = 'check_in' AND substr(recorded_at, 1, 10) = ? AND deleted = 0`,
    [accountSyncId, dateOnly]
  )
  if (existing) {
    db.runSync(
      `UPDATE value_history SET value = ?, recorded_at = ?, invested_value = ?, quantity = ?, last_updated = ?, dirty = 1 WHERE sync_id = ?`,
      [value, dateOnly, investedValue, quantity, now, existing.sync_id]
    )
  } else {
    db.runSync(
      `INSERT INTO value_history (sync_id, account_sync_id, value, recorded_at, source, invested_value, quantity, last_updated, deleted, dirty)
       VALUES (?, ?, ?, ?, 'check_in', ?, ?, ?, 0, 1)`,
      [Crypto.randomUUID(), accountSyncId, value, dateOnly, investedValue, quantity, now]
    )
  }
  recomputeCurrentValueFromHistory(accountSyncId)
}

export function updateValueHistoryEntry(
  syncId: string,
  value: number,
  investedValue: number | null,
  quantity: number | null
): void {
  const db = getDb()
  const row = db.getFirstSync<{ account_sync_id: string }>('SELECT account_sync_id FROM value_history WHERE sync_id = ?', [syncId])
  if (!row) return
  db.runSync(
    `UPDATE value_history SET value = ?, invested_value = ?, quantity = ?, last_updated = ?, dirty = 1 WHERE sync_id = ?`,
    [value, investedValue, quantity, new Date().toISOString(), syncId]
  )
  recomputeCurrentValueFromHistory(row.account_sync_id)
}

export function deleteValueHistoryEntry(syncId: string): void {
  const db = getDb()
  const row = db.getFirstSync<{ account_sync_id: string }>('SELECT account_sync_id FROM value_history WHERE sync_id = ?', [syncId])
  if (!row) return
  db.runSync('UPDATE value_history SET deleted = 1, dirty = 1, last_updated = ? WHERE sync_id = ?', [
    new Date().toISOString(),
    syncId
  ])
  recomputeCurrentValueFromHistory(row.account_sync_id)
}

export function listDirty(): ValueHistoryRow[] {
  return getDb().getAllSync<ValueHistoryRow>('SELECT * FROM value_history WHERE dirty = 1')
}

export function clearDirty(syncIds: string[]): void {
  if (syncIds.length === 0) return
  const db = getDb()
  db.withTransactionSync(() => {
    for (const id of syncIds) db.runSync('UPDATE value_history SET dirty = 0 WHERE sync_id = ?', [id])
  })
}

/** Minimal payload shape — no sync_id/last_updated inside it, matching desktop's
 * dedicated pushValueHistory exactly (those travel as the SyncPushItem's own
 * id/updatedAt instead, see valueHistorySync.ts). */
export function toSyncPayload(row: ValueHistoryRow): Record<string, unknown> {
  return {
    account_sync_id: row.account_sync_id,
    value: row.value,
    recorded_at: row.recorded_at,
    source: row.source,
    invested_value: row.invested_value,
    quantity: row.quantity,
    deleted: row.deleted
  }
}

/** `itemId`/`updatedAt` come from the pulled SyncPullItem's own id/updatedAt fields
 * (not from inside the decrypted payload) — mirrors desktop's dedicated
 * pullValueHistory, which reads sync_id/updated_at the same way. */
export function upsertFromRemote(itemId: string, updatedAt: string, flat: Record<string, unknown>): void {
  getDb().runSync(
    `INSERT INTO value_history (sync_id, account_sync_id, value, recorded_at, source, invested_value, quantity, last_updated, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(sync_id) DO UPDATE SET
       account_sync_id = excluded.account_sync_id, value = excluded.value, recorded_at = excluded.recorded_at,
       source = excluded.source, invested_value = excluded.invested_value, quantity = excluded.quantity,
       last_updated = excluded.last_updated, deleted = excluded.deleted, dirty = 0`,
    [
      itemId,
      String(flat.account_sync_id),
      Number(flat.value ?? 0),
      String(flat.recorded_at),
      String(flat.source ?? 'manual'),
      flat.invested_value == null ? null : Number(flat.invested_value),
      flat.quantity == null ? null : Number(flat.quantity),
      updatedAt,
      Number(flat.deleted) ? 1 : 0
    ]
  )
  // A pulled check-in should affect this account the same way a local one does —
  // see src/main/sync.ts's pullValueHistory for the same reasoning.
  recomputeCurrentValueFromHistory(String(flat.account_sync_id))
}
