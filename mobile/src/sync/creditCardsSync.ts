import { Buffer } from 'buffer'
import { syncTable } from './tableSync'
import { listDirty, clearDirty, toSyncPayload, upsertFromRemote, CreditCardRow } from '../db/creditCardsRepo'

/** `'credit_card'` must match src/main/sync.ts's SYNCABLE_TABLES entry
 * `{ table: 'credit_cards', type: 'credit_card', ... }` exactly. */
export async function syncCreditCards(dataKey: Buffer, token: string): Promise<void> {
  await syncTable<CreditCardRow>(
    { type: 'credit_card', listDirty, clearDirty, toSyncPayload, upsertFromRemote },
    dataKey,
    token
  )
}
