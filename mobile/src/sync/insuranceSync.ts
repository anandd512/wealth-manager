import { Buffer } from 'buffer'
import { syncTable } from './tableSync'
import { listDirty, clearDirty, toSyncPayload, upsertFromRemote, InsurancePolicyRow } from '../db/insuranceRepo'

/** `'insurance_policy'` must match src/main/sync.ts's SYNCABLE_TABLES entry
 * `{ table: 'insurance_policies', type: 'insurance_policy', ... }` exactly. */
export async function syncInsurance(dataKey: Buffer, token: string): Promise<void> {
  await syncTable<InsurancePolicyRow>(
    { type: 'insurance_policy', listDirty, clearDirty, toSyncPayload, upsertFromRemote },
    dataKey,
    token
  )
}
