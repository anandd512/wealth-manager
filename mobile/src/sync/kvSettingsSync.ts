import { Buffer } from 'buffer'
import { ArthaApi, SyncPushItem } from '../api/arthaApi'
import { encryptRecord, decryptRecord } from '../crypto/cryptoBox'
import { getDb } from '../db/db'
import { listDirtySettings, clearDirtySettings, toSyncPayload, upsertSettingFromRemote } from '../db/kvSettingsRepo'

/** Dedicated pull/push for kv_settings — not built on tableSync.ts's generic
 * sync_id-keyed factory because this table's sync id IS the row's own `key`
 * (desktop's src/main/sync.ts treats it the same way: `idColumn: 'key',
 * primaryKeyIsIdColumn: true`). `'kv_setting'` must match that entry's `type`. */
const TYPE = 'kv_setting'
const CURSOR_KEY = 'cursor_kv_setting'
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

async function pullSettings(dataKey: Buffer, token: string): Promise<void> {
  let cursor = getCursor()
  for (;;) {
    const page = await ArthaApi.pull(cursor, token)
    for (const item of page.items) {
      if (item.type !== TYPE) continue
      const plaintext = decryptRecord(item.ciphertext, dataKey)
      const flat = JSON.parse(plaintext.toString('utf-8')) as { key: string; value: string; updated_at: string; deleted?: unknown }
      upsertSettingFromRemote(flat)
    }
    cursor = page.cursor
    setCursor(cursor)
    if (!page.hasMore) break
  }
}

async function pushSettings(dataKey: Buffer, token: string): Promise<void> {
  const dirty = listDirtySettings()
  if (dirty.length === 0) return

  const items: SyncPushItem[] = dirty.map((row) => {
    const plaintext = Buffer.from(JSON.stringify(toSyncPayload(row)), 'utf-8')
    return {
      id: row.key,
      type: TYPE,
      ciphertext: encryptRecord(plaintext, dataKey),
      updatedAt: row.updated_at,
      deleted: Boolean(row.deleted)
    }
  })

  const result = await ArthaApi.push(items, token)
  clearDirtySettings([...result.accepted, ...result.conflicts])
}

export async function syncSettings(dataKey: Buffer, token: string): Promise<void> {
  await pullSettings(dataKey, token)
  await pushSettings(dataKey, token)
}
