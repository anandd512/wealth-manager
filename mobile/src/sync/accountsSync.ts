import { Buffer } from 'buffer'
import { syncTable } from './tableSync'
import { listDirty, clearDirty, toSyncPayload, upsertFromRemote, AccountRow } from '../db/accountsRepo'

/** `'account'` must match src/main/sync.ts's SYNCABLE_TABLES entry
 * `{ table: 'accounts', type: 'account', ... }` exactly — see tableSync.ts. */
export async function syncAccounts(dataKey: Buffer, token: string): Promise<void> {
  await syncTable<AccountRow>(
    { type: 'account', listDirty, clearDirty, toSyncPayload, upsertFromRemote },
    dataKey,
    token
  )
}
