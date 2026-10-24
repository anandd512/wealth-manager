import { Buffer } from 'buffer'
import { ArthaApi, SyncPushItem } from '../api/arthaApi'
import { encryptRecord, decryptRecord } from '../crypto/cryptoBox'
import { getDb } from '../db/db'
import { listDirty, clearDirty, toSyncPayload, upsertFromRemote } from '../db/valueHistoryRepo'

/** Dedicated pull/push for value_history — not built on tableSync.ts's generic
 * factory because the payload shape is intentionally minimal (no sync_id/
 * last_updated inside it; those travel as the SyncPushItem/SyncPullItem's own
 * id/updatedAt), mirroring src/main/sync.ts's dedicated pushValueHistory/
 * pullValueHistory (Phase 0c) exactly — the two must agree on wire format to
 * interoperate. `'value_history'` must match that entry's `type`. */
const TYPE = 'value_history'
const CURSOR_KEY = 'cursor_value_history'
const EPOCH = '1970-01-01T00:00:00.000Z'
const BATCH_SIZE = 500

function getCursor(): string {
  const row = getDb().getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [CURSOR_KEY])
  return row?.value ?? EPOCH
}

function setCursor(cursor: string): void {
  getDb().runSync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [CURSOR_KEY, cursor]
  )
}

async function pullValueHistory(dataKey: Buffer, token: string): Promise<void> {
  let cursor = getCursor()
  for (;;) {
    const page = await ArthaApi.pull(cursor, token)
    for (const item of page.items) {
      if (item.type !== TYPE) continue
      const plaintext = decryptRecord(item.ciphertext, dataKey)
      const flat = JSON.parse(plaintext.toString('utf-8')) as Record<string, unknown>
      upsertFromRemote(item.id, item.updatedAt, flat)
    }
    cursor = page.cursor
    setCursor(cursor)
    if (!page.hasMore) break
  }
}

async function pushValueHistory(dataKey: Buffer, token: string): Promise<void> {
  const dirty = listDirty()
  if (dirty.length === 0) return

  const items: SyncPushItem[] = dirty.map((row) => {
    const plaintext = Buffer.from(JSON.stringify(toSyncPayload(row)), 'utf-8')
    return {
      id: row.sync_id,
      type: TYPE,
      ciphertext: encryptRecord(plaintext, dataKey),
      updatedAt: row.last_updated,
      deleted: Boolean(row.deleted)
    }
  })

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const result = await ArthaApi.push(batch, token)
    clearDirty([...result.accepted, ...result.conflicts])
  }
}

export async function syncValueHistory(dataKey: Buffer, token: string): Promise<void> {
  await pullValueHistory(dataKey, token)
  await pushValueHistory(dataKey, token)
}
