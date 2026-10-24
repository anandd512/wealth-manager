import { Buffer } from 'buffer'
import { ArthaApi, SyncPushItem } from '../api/arthaApi'
import { encryptRecord, decryptRecord } from '../crypto/cryptoBox'
import { getDb } from '../db/db'

/** Mirrors src/main/sync.ts's pullTable/pushTable pattern (desktop), generalized so
 * every synced table — accounts, credit cards, insurance, identity documents,
 * vault, kv_settings — shares one pull/push/cursor/dirty-outbox implementation
 * instead of each hand-rolling it. The `type` string passed in must match the
 * corresponding entry in src/main/sync.ts's SYNCABLE_TABLES exactly — that's what
 * lets this app and the Electron desktop app interoperate on the same data. */

const EPOCH = '1970-01-01T00:00:00.000Z'
const BATCH_SIZE = 500

export interface TableSyncHooks<TRow extends Record<string, unknown>> {
  type: string
  listDirty: () => TRow[]
  clearDirty: (syncIds: string[]) => void
  toSyncPayload: (row: TRow) => Record<string, unknown>
  upsertFromRemote: (flat: Record<string, unknown>) => void
}

function getCursor(type: string): string {
  const row = getDb().getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [`cursor_${type}`])
  return row?.value ?? EPOCH
}

function setCursor(type: string, cursor: string): void {
  getDb().runSync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [`cursor_${type}`, cursor]
  )
}

async function pullTable<TRow extends Record<string, unknown>>(hooks: TableSyncHooks<TRow>, dataKey: Buffer, token: string): Promise<void> {
  let cursor = getCursor(hooks.type)
  for (;;) {
    const page = await ArthaApi.pull(cursor, token)
    for (const item of page.items) {
      if (item.type !== hooks.type) continue
      const plaintext = decryptRecord(item.ciphertext, dataKey)
      const flat = JSON.parse(plaintext.toString('utf-8')) as Record<string, unknown>
      hooks.upsertFromRemote(flat)
    }
    cursor = page.cursor
    setCursor(hooks.type, cursor)
    if (!page.hasMore) break
  }
}

async function pushTable<TRow extends Record<string, unknown>>(hooks: TableSyncHooks<TRow>, dataKey: Buffer, token: string): Promise<void> {
  const dirty = hooks.listDirty()
  if (dirty.length === 0) return

  const items: SyncPushItem[] = dirty.map((row) => {
    const plaintext = Buffer.from(JSON.stringify(hooks.toSyncPayload(row)), 'utf-8')
    return {
      id: String(row.sync_id),
      type: hooks.type,
      ciphertext: encryptRecord(plaintext, dataKey),
      updatedAt: String(row.last_updated),
      deleted: Boolean(row.deleted)
    }
  })

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const result = await ArthaApi.push(batch, token)
    // A conflict just means the server's newer copy flows back down on the next
    // pull (same as desktop's sync.ts) — no retry needed for either outcome.
    hooks.clearDirty([...result.accepted, ...result.conflicts])
  }
}

/** Pulls remote changes, then pushes local ones, for one table. Call after unlock,
 * on pull-to-refresh, and fire-and-forget after every local create/update/delete.
 * Only call once dataKey/token are available (status === 'unlocked'). */
export async function syncTable<TRow extends Record<string, unknown>>(hooks: TableSyncHooks<TRow>, dataKey: Buffer, token: string): Promise<void> {
  await pullTable(hooks, dataKey, token)
  await pushTable(hooks, dataKey, token)
}
