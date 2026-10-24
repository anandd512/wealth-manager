import * as Crypto from 'expo-crypto'
import { AccountCategory, AccountSubtype, CATEGORY_IS_LIABILITY } from '../lib/categories'
import { ACCOUNTS_CONFIG } from './tableConfigs'
import {
  listRows,
  getRowBySyncId,
  insertRow,
  updateIndexedColumns,
  updateRow,
  softDeleteRow,
  toSyncPayload as genericToSyncPayload,
  upsertFromRemote as genericUpsertFromRemote,
  listDirty as genericListDirty,
  clearDirty as genericClearDirty
} from './tableStore'

/** The flattened, UI-facing view: indexed columns plus whatever's in the local
 * `payload` blob spread alongside them (so e.g. `account.ticker` — a desktop-only
 * field mobile's form never edits — reads through transparently). */
export interface Account {
  sync_id: string
  name: string
  category: AccountCategory
  subtype: AccountSubtype
  institution: string | null
  currency: string
  is_liability: 0 | 1
  current_value: number
  ownership_pct: number | null
  notes: string | null
  last_updated: string
  created_at: string
  [key: string]: unknown
}

/** Raw row shape as read back from SQLite — used only by the sync layer, which
 * needs the `payload`/`dirty` columns `Account` deliberately hides from the UI. */
export type AccountRow = Account & { payload: string; dirty: number }

export interface AccountFormInput {
  name: string
  category: AccountCategory
  subtype: AccountSubtype
  institution: string | null
  currency: string
  current_value: number
  notes: string | null
}

export function listAccounts(): Account[] {
  return listRows<Account>(ACCOUNTS_CONFIG)
}

export function getAccountBySyncId(syncId: string): Account | undefined {
  return getRowBySyncId<Account>(ACCOUNTS_CONFIG, syncId)
}

export function createAccount(input: AccountFormInput): Account {
  const now = new Date().toISOString()
  const syncId = Crypto.randomUUID()
  insertRow(ACCOUNTS_CONFIG, {
    sync_id: syncId,
    name: input.name,
    category: input.category,
    subtype: input.subtype,
    institution: input.institution,
    currency: input.currency,
    is_liability: CATEGORY_IS_LIABILITY[input.category] ? 1 : 0,
    current_value: input.current_value,
    ownership_pct: null,
    notes: input.notes,
    last_updated: now,
    created_at: now
  })
  const created = getAccountBySyncId(syncId)
  if (!created) throw new Error(`Account ${syncId} not found after insert`)
  return created
}

export function updateAccount(syncId: string, input: AccountFormInput): Account {
  const now = new Date().toISOString()
  updateIndexedColumns(
    ACCOUNTS_CONFIG,
    syncId,
    {
      name: input.name,
      category: input.category,
      subtype: input.subtype,
      institution: input.institution,
      currency: input.currency,
      is_liability: CATEGORY_IS_LIABILITY[input.category] ? 1 : 0,
      current_value: input.current_value,
      notes: input.notes
    },
    now
  )
  const updated = getAccountBySyncId(syncId)
  if (!updated) throw new Error(`Account ${syncId} not found after update`)
  return updated
}

export function deleteAccount(syncId: string): void {
  softDeleteRow(ACCOUNTS_CONFIG, syncId, new Date().toISOString())
}

/** Called after a check-in (or a value_history edit/delete) to re-derive the
 * account's current_value/principal_amount/quantity from the latest history row —
 * mirrors src/main/services/accounts.ts's recomputeCurrentValueFromHistory exactly.
 * `principalAmount`/`quantity` left `undefined` are COALESCE'd (left untouched),
 * same as desktop. principal_amount/quantity aren't indexed columns on mobile's
 * accounts table (see ACCOUNTS_CONFIG) — they live in the payload blob. */
export function updateAccountValueFields(
  syncId: string,
  fields: { current_value: number; principal_amount?: number | null; quantity?: number | null }
): void {
  updateRow(
    ACCOUNTS_CONFIG,
    syncId,
    {
      indexed: { current_value: fields.current_value },
      payload: { principal_amount: fields.principal_amount, quantity: fields.quantity }
    },
    new Date().toISOString()
  )
}

export function toSyncPayload(row: AccountRow): Record<string, unknown> {
  return genericToSyncPayload(ACCOUNTS_CONFIG, row)
}

export function upsertFromRemote(flat: Record<string, unknown>): void {
  genericUpsertFromRemote(ACCOUNTS_CONFIG, flat)
}

export function listDirty(): AccountRow[] {
  return genericListDirty<AccountRow>(ACCOUNTS_CONFIG)
}

export function clearDirty(syncIds: string[]): void {
  genericClearDirty(ACCOUNTS_CONFIG, syncIds)
}
