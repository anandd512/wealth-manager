import { Buffer } from 'buffer'
import { syncTable } from './tableSync'
import { listDirty, clearDirty, toSyncPayload, upsertFromRemote, IdentityDocumentRow } from '../db/identityDocsRepo'

/** `'identity_document'` must match src/main/sync.ts's SYNCABLE_TABLES entry
 * `{ table: 'identity_documents', type: 'identity_document', ... }` exactly. */
export async function syncIdentityDocs(dataKey: Buffer, token: string): Promise<void> {
  await syncTable<IdentityDocumentRow>(
    { type: 'identity_document', listDirty, clearDirty, toSyncPayload, upsertFromRemote },
    dataKey,
    token
  )
}
