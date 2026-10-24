import { Buffer } from 'buffer'
import { ArthaApi } from '../api/arthaApi'
import { decryptRecord } from '../crypto/cryptoBox'
import { getDb } from '../db/db'
import { upsertFromRemote } from '../db/netWorthSnapshotsRepo'

/** Pull-only — mirrors the `net_worth_snapshot` entry in src/main/sync.ts's generic
 * SYNCABLE_TABLES, read-only here since mobile never pushes its own snapshots. */
const TYPE = 'net_worth_snapshot'
const CURSOR_KEY = 'cursor_net_worth_snapshot'
const EPOCH = '1970-01-01T00:00:00.000Z'

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

export async function syncNetWorthSnapshots(dataKey: Buffer, token: string): Promise<void> {
  let cursor = getCursor()
  for (;;) {
    const page = await ArthaApi.pull(cursor, token)
    for (const item of page.items) {
      if (item.type !== TYPE) continue
      const plaintext = decryptRecord(item.ciphertext, dataKey)
      const flat = JSON.parse(plaintext.toString('utf-8')) as Record<string, unknown>
      upsertFromRemote(flat)
    }
    cursor = page.cursor
    setCursor(cursor)
    if (!page.hasMore) break
  }
}
