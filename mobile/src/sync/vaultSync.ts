import { Buffer } from 'buffer'
import { syncTable } from './tableSync'
import { listDirty, clearDirty, toSyncPayload, upsertFromRemote, VaultEntryRow } from '../db/vaultRepo'

/** `'credential_vault'` must match src/main/sync.ts's SYNCABLE_TABLES entry
 * `{ table: 'credential_vault', type: 'credential_vault', ... }` exactly. Unlike
 * value_history, this table has no local-FK-to-another-table problem (its sync_id
 * already is the row's own identity), so it uses the generic factory directly, same
 * as accounts. */
export async function syncVault(dataKey: Buffer, token: string): Promise<void> {
  await syncTable<VaultEntryRow>(
    { type: 'credential_vault', listDirty, clearDirty, toSyncPayload, upsertFromRemote },
    dataKey,
    token
  )
}
