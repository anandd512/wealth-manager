import * as Crypto from 'expo-crypto'
import { CREDIT_CARDS_CONFIG } from './tableConfigs'
import {
  listRows,
  getRowBySyncId,
  insertRow,
  updateIndexedColumns,
  softDeleteRow,
  toSyncPayload as genericToSyncPayload,
  upsertFromRemote as genericUpsertFromRemote,
  listDirty as genericListDirty,
  clearDirty as genericClearDirty
} from './tableStore'

/** Mirrors src/main/services/creditCards.ts. `cvv` is never exposed in the UI on
 * desktop either (the field exists in the type but the modal hard-codes it null) —
 * matched here by simply not indexing it; it stays untouched in the payload blob if
 * a desktop-authored record ever has one. `last_reminder_sent` is desktop-only
 * reminder bookkeeping, same treatment. */
export type CreditCardStatus = 'active' | 'disabled'

export interface CreditCard {
  sync_id: string
  nickname: string
  network: string | null
  issuer: string | null
  card_number: string | null
  name_on_card: string | null
  expiry_month: number | null
  expiry_year: number | null
  credit_limit: number | null
  statement_day: number | null
  status: CreditCardStatus
  notes: string | null
  last_updated: string
  created_at: string
  [key: string]: unknown
}

export type CreditCardRow = CreditCard & { payload: string; dirty: number }

export interface CreditCardFormInput {
  nickname: string
  network: string | null
  issuer: string | null
  card_number: string | null
  name_on_card: string | null
  expiry_month: number | null
  expiry_year: number | null
  credit_limit: number | null
  statement_day: number | null
  status: CreditCardStatus
  notes: string | null
}

export function listCreditCards(): CreditCard[] {
  return listRows<CreditCard>(CREDIT_CARDS_CONFIG)
}

export function getCreditCardBySyncId(syncId: string): CreditCard | undefined {
  return getRowBySyncId<CreditCard>(CREDIT_CARDS_CONFIG, syncId)
}

export function createCreditCard(input: CreditCardFormInput): CreditCard {
  const now = new Date().toISOString()
  const syncId = Crypto.randomUUID()
  insertRow(CREDIT_CARDS_CONFIG, { ...input, sync_id: syncId, last_updated: now, created_at: now })
  const created = getCreditCardBySyncId(syncId)
  if (!created) throw new Error(`Credit card ${syncId} not found after insert`)
  return created
}

export function updateCreditCard(syncId: string, input: CreditCardFormInput): CreditCard {
  const now = new Date().toISOString()
  updateIndexedColumns(CREDIT_CARDS_CONFIG, syncId, { ...input }, now)
  const updated = getCreditCardBySyncId(syncId)
  if (!updated) throw new Error(`Credit card ${syncId} not found after update`)
  return updated
}

export function deleteCreditCard(syncId: string): void {
  softDeleteRow(CREDIT_CARDS_CONFIG, syncId, new Date().toISOString())
}

export function toSyncPayload(row: CreditCardRow): Record<string, unknown> {
  return genericToSyncPayload(CREDIT_CARDS_CONFIG, row)
}

export function upsertFromRemote(flat: Record<string, unknown>): void {
  genericUpsertFromRemote(CREDIT_CARDS_CONFIG, flat)
}

export function listDirty(): CreditCardRow[] {
  return genericListDirty<CreditCardRow>(CREDIT_CARDS_CONFIG)
}

export function clearDirty(syncIds: string[]): void {
  genericClearDirty(CREDIT_CARDS_CONFIG, syncIds)
}
