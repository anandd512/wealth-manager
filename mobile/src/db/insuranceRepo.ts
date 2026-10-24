import * as Crypto from 'expo-crypto'
import { InsurancePolicyType } from '../lib/insuranceCategories'
import { INSURANCE_CONFIG } from './tableConfigs'
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

/** Mirrors src/main/services/insurance.ts. */
export interface InsurancePolicy {
  sync_id: string
  policy_number: string | null
  policy_type: InsurancePolicyType | null
  insurer: string | null
  insured_name: string | null
  additional_insured: string | null
  nominee_name: string | null
  vehicle_number: string | null
  sum_assured: number | null
  premium_amount: number | null
  premium_frequency: string | null
  start_date: string | null
  expiry_date: string | null
  renewal_date: string | null
  riders: string | null
  document_path: string | null
  document_original_name: string | null
  notes: string | null
  last_updated: string
  created_at: string
  [key: string]: unknown
}

export type InsurancePolicyRow = InsurancePolicy & { payload: string; dirty: number }

export type InsurancePolicyFormInput = Omit<InsurancePolicy, 'sync_id' | 'last_updated' | 'created_at'>

/** Matches src/shared/types.ts's PolicyExtraction (the AI extraction result shape). */
export interface PolicyExtraction {
  policy_number: string | null
  policy_type: InsurancePolicyType | null
  insurer: string | null
  insured_name: string | null
  additional_insured: string | null
  vehicle_number: string | null
  sum_assured: number | null
  premium_amount: number | null
  premium_frequency: string | null
  start_date: string | null
  expiry_date: string | null
  renewal_date: string | null
  confidence_notes: string | null
}

export function listPolicies(): InsurancePolicy[] {
  return listRows<InsurancePolicy>(INSURANCE_CONFIG)
}

export function getPolicyBySyncId(syncId: string): InsurancePolicy | undefined {
  return getRowBySyncId<InsurancePolicy>(INSURANCE_CONFIG, syncId)
}

export function createPolicy(input: InsurancePolicyFormInput): InsurancePolicy {
  const now = new Date().toISOString()
  const syncId = Crypto.randomUUID()
  insertRow(INSURANCE_CONFIG, { ...input, sync_id: syncId, last_updated: now, created_at: now })
  const created = getPolicyBySyncId(syncId)
  if (!created) throw new Error(`Policy ${syncId} not found after insert`)
  return created
}

export function updatePolicy(syncId: string, input: InsurancePolicyFormInput): InsurancePolicy {
  const now = new Date().toISOString()
  updateIndexedColumns(INSURANCE_CONFIG, syncId, { ...input }, now)
  const updated = getPolicyBySyncId(syncId)
  if (!updated) throw new Error(`Policy ${syncId} not found after update`)
  return updated
}

export function deletePolicy(syncId: string): void {
  softDeleteRow(INSURANCE_CONFIG, syncId, new Date().toISOString())
}

export function toSyncPayload(row: InsurancePolicyRow): Record<string, unknown> {
  return genericToSyncPayload(INSURANCE_CONFIG, row)
}

export function upsertFromRemote(flat: Record<string, unknown>): void {
  genericUpsertFromRemote(INSURANCE_CONFIG, flat)
}

export function listDirty(): InsurancePolicyRow[] {
  return genericListDirty<InsurancePolicyRow>(INSURANCE_CONFIG)
}

export function clearDirty(syncIds: string[]): void {
  genericClearDirty(INSURANCE_CONFIG, syncIds)
}
