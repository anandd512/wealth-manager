import * as Crypto from 'expo-crypto'
import { VaultCategory, VaultEntryType } from '../lib/categories'
import { VAULT_CONFIG } from './tableConfigs'
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

/** Mirrors src/main/services/vault.ts. No document/file fields exist on this table
 * (confirmed on desktop — pure text entries), so unlike accounts there's no file
 * sync concern here at all. */
export interface VaultEntry {
  sync_id: string
  entry_type: VaultEntryType
  service_name: string
  category: VaultCategory | null
  url: string | null
  username: string | null
  password: string | null
  password_changed_at: string | null
  notes: string | null
  last_updated: string
  created_at: string
  [key: string]: unknown
}

export type VaultEntryRow = VaultEntry & { payload: string; dirty: number }

export interface VaultEntryFormInput {
  entry_type: VaultEntryType
  service_name: string
  category: VaultCategory | null
  url: string | null
  username: string | null
  password: string | null
  notes: string | null
}

export function listVaultEntries(): VaultEntry[] {
  return listRows<VaultEntry>(VAULT_CONFIG)
}

export function getVaultEntryBySyncId(syncId: string): VaultEntry | undefined {
  return getRowBySyncId<VaultEntry>(VAULT_CONFIG, syncId)
}

export function createVaultEntry(input: VaultEntryFormInput): VaultEntry {
  const now = new Date().toISOString()
  const syncId = Crypto.randomUUID()
  insertRow(VAULT_CONFIG, {
    sync_id: syncId,
    entry_type: input.entry_type,
    service_name: input.service_name,
    category: input.category,
    url: input.url,
    username: input.username,
    password: input.password,
    password_changed_at: input.password ? now : null,
    notes: input.notes,
    last_updated: now,
    created_at: now
  })
  const created = getVaultEntryBySyncId(syncId)
  if (!created) throw new Error(`Vault entry ${syncId} not found after insert`)
  return created
}

export function updateVaultEntry(syncId: string, input: VaultEntryFormInput): VaultEntry {
  const existing = getVaultEntryBySyncId(syncId)
  if (!existing) throw new Error(`Vault entry ${syncId} not found`)
  const now = new Date().toISOString()
  // Only re-stamp password_changed_at when the password actually changed value —
  // matches desktop's updateVaultEntry exactly (used for the "password age" UI).
  const passwordChanged = input.password !== existing.password
  updateIndexedColumns(
    VAULT_CONFIG,
    syncId,
    {
      entry_type: input.entry_type,
      service_name: input.service_name,
      category: input.category,
      url: input.url,
      username: input.username,
      password: input.password,
      password_changed_at: passwordChanged && input.password ? now : existing.password_changed_at,
      notes: input.notes
    },
    now
  )
  const updated = getVaultEntryBySyncId(syncId)
  if (!updated) throw new Error(`Vault entry ${syncId} not found after update`)
  return updated
}

export function deleteVaultEntry(syncId: string): void {
  softDeleteRow(VAULT_CONFIG, syncId, new Date().toISOString())
}

export function toSyncPayload(row: VaultEntryRow): Record<string, unknown> {
  return genericToSyncPayload(VAULT_CONFIG, row)
}

export function upsertFromRemote(flat: Record<string, unknown>): void {
  genericUpsertFromRemote(VAULT_CONFIG, flat)
}

export function listDirty(): VaultEntryRow[] {
  return genericListDirty<VaultEntryRow>(VAULT_CONFIG)
}

export function clearDirty(syncIds: string[]): void {
  genericClearDirty(VAULT_CONFIG, syncIds)
}
