import * as Crypto from 'expo-crypto'
import { IdentityDocType } from '../lib/identityDocCategories'
import { IDENTITY_DOCS_CONFIG } from './tableConfigs'
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

/** Mirrors src/main/services/identityDocuments.ts. */
export interface IdentityDocument {
  sync_id: string
  doc_type: IdentityDocType
  label: string | null
  id_number: string | null
  full_name: string | null
  date_of_birth: string | null
  issued_date: string | null
  expiry_date: string | null
  additional_info: string | null
  vehicle_class: string | null
  vehicle_model: string | null
  insurance_valid_upto: string | null
  constituency: string | null
  voter_serial_number: string | null
  document_path: string | null
  document_original_name: string | null
  notes: string | null
  last_updated: string
  created_at: string
  [key: string]: unknown
}

export type IdentityDocumentRow = IdentityDocument & { payload: string; dirty: number }

export type IdentityDocumentFormInput = Omit<IdentityDocument, 'sync_id' | 'last_updated' | 'created_at'>

/** Matches src/shared/types.ts's IdentityDocExtraction. */
export interface IdentityDocExtraction {
  doc_type: IdentityDocType | null
  label: string | null
  id_number: string | null
  full_name: string | null
  date_of_birth: string | null
  issued_date: string | null
  expiry_date: string | null
  additional_info: string | null
  vehicle_class: string | null
  vehicle_model: string | null
  insurance_valid_upto: string | null
  constituency: string | null
  voter_serial_number: string | null
  confidence_notes: string | null
}

export function listIdentityDocuments(): IdentityDocument[] {
  return listRows<IdentityDocument>(IDENTITY_DOCS_CONFIG)
}

export function getIdentityDocumentBySyncId(syncId: string): IdentityDocument | undefined {
  return getRowBySyncId<IdentityDocument>(IDENTITY_DOCS_CONFIG, syncId)
}

export function createIdentityDocument(input: IdentityDocumentFormInput): IdentityDocument {
  const now = new Date().toISOString()
  const syncId = Crypto.randomUUID()
  insertRow(IDENTITY_DOCS_CONFIG, { ...input, sync_id: syncId, last_updated: now, created_at: now })
  const created = getIdentityDocumentBySyncId(syncId)
  if (!created) throw new Error(`Identity document ${syncId} not found after insert`)
  return created
}

export function updateIdentityDocument(syncId: string, input: IdentityDocumentFormInput): IdentityDocument {
  const now = new Date().toISOString()
  updateIndexedColumns(IDENTITY_DOCS_CONFIG, syncId, { ...input }, now)
  const updated = getIdentityDocumentBySyncId(syncId)
  if (!updated) throw new Error(`Identity document ${syncId} not found after update`)
  return updated
}

export function deleteIdentityDocument(syncId: string): void {
  softDeleteRow(IDENTITY_DOCS_CONFIG, syncId, new Date().toISOString())
}

export function toSyncPayload(row: IdentityDocumentRow): Record<string, unknown> {
  return genericToSyncPayload(IDENTITY_DOCS_CONFIG, row)
}

export function upsertFromRemote(flat: Record<string, unknown>): void {
  genericUpsertFromRemote(IDENTITY_DOCS_CONFIG, flat)
}

export function listDirty(): IdentityDocumentRow[] {
  return genericListDirty<IdentityDocumentRow>(IDENTITY_DOCS_CONFIG)
}

export function clearDirty(syncIds: string[]): void {
  genericClearDirty(IDENTITY_DOCS_CONFIG, syncIds)
}
