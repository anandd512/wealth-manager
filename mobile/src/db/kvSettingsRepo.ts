import { getDb } from './db'

/** Mirrors desktop's kv_settings table (src/main/db.ts) — small enough, and shaped
 * differently enough (the row's own `key` IS its sync id, not a generated sync_id,
 * same as src/main/sync.ts's `primaryKeyIsIdColumn` tables), that it isn't worth
 * forcing through tableStore.ts's sync_id-keyed generic machinery. Used today just
 * for `extractionProvider`/`openAiBaseUrl`/`openAiModel` (see SettingsScreen) —
 * the actual API keys stay device-local via secureStore.ts, never synced. */

interface KvRow {
  key: string
  value: string
  updated_at: string
  deleted: number
  dirty: number
}

export function getSetting(key: string): string | null {
  const row = getDb().getFirstSync<{ value: string }>('SELECT value FROM kv_settings WHERE key = ? AND deleted = 0', [key])
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  const now = new Date().toISOString()
  getDb().runSync(
    `INSERT INTO kv_settings (key, value, updated_at, deleted, dirty) VALUES (?, ?, ?, 0, 1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted = 0, dirty = 1`,
    [key, value, now]
  )
}

export function listDirtySettings(): KvRow[] {
  return getDb().getAllSync<KvRow>('SELECT * FROM kv_settings WHERE dirty = 1')
}

export function clearDirtySettings(keys: string[]): void {
  if (keys.length === 0) return
  const db = getDb()
  db.withTransactionSync(() => {
    for (const key of keys) {
      db.runSync('UPDATE kv_settings SET dirty = 0 WHERE key = ?', [key])
    }
  })
}

export function toSyncPayload(row: KvRow): Record<string, unknown> {
  return { key: row.key, value: row.value, updated_at: row.updated_at, deleted: row.deleted }
}

export function upsertSettingFromRemote(flat: { key: string; value: string; updated_at: string; deleted?: unknown }): void {
  getDb().runSync(
    `INSERT INTO kv_settings (key, value, updated_at, deleted, dirty) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted = excluded.deleted, dirty = 0`,
    [flat.key, flat.value, flat.updated_at, Number(flat.deleted) ? 1 : 0]
  )
}
