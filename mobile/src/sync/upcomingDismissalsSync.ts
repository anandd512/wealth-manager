import { Buffer } from 'buffer'
import { ArthaApi, SyncPushItem } from '../api/arthaApi'
import { encryptRecord, decryptRecord } from '../crypto/cryptoBox'
import { getDb } from '../db/db'
import { listDirty, clearDirty, toSyncPayload, upsertFromRemote } from '../db/upcomingDismissalsRepo'

/** Dedicated push/pull for upcoming_dismissals, mirroring src/main/sync.ts's
 * pushUpcomingDismissals/pullUpcomingDismissals — `'upcoming_dismissal'` must match
 * that entry's `type` exactly for the two to interoperate. */
const TYPE = 'upcoming_dismissal'
const CURSOR_KEY = 'cursor_upcoming_dismissal'
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

async function pullUpcomingDismissals(dataKey: Buffer, token: string): Promise<void> {
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

async function pushUpcomingDismissals(dataKey: Buffer, token: string): Promise<void> {
  const dirty = listDirty()
  if (dirty.length === 0) return

  const items: SyncPushItem[] = dirty.map((row) => {
    const plaintext = Buffer.from(JSON.stringify(toSyncPayload(row)), 'utf-8')
    return {
      id: row.id,
      type: TYPE,
      ciphertext: encryptRecord(plaintext, dataKey),
      updatedAt: row.updated_at,
      deleted: Boolean(row.deleted)
    }
  })

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const result = await ArthaApi.push(batch, token)
    clearDirty([...result.accepted, ...result.conflicts])
  }
}

export async function syncUpcomingDismissals(dataKey: Buffer, token: string): Promise<void> {
  await pullUpcomingDismissals(dataKey, token)
  await pushUpcomingDismissals(dataKey, token)
}
