import { getDb } from '../db/db'

/** Local-only "when did a sync last actually succeed" marker — every sync failure
 * elsewhere in this app is swallowed silently ("show whatever's cached"), which
 * left no way for the user to tell a fresh screen from a stale one after a failed
 * or skipped sync. sync_meta already holds other local-only bookkeeping (pull
 * cursors), so this reuses it rather than adding a new table. */
const LAST_SYNCED_KEY = 'last_synced_at'

export function getLastSyncedAt(): string | null {
  const row = getDb().getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [LAST_SYNCED_KEY])
  return row?.value ?? null
}

export function setLastSyncedAt(iso: string): void {
  getDb().runSync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [LAST_SYNCED_KEY, iso]
  )
}

export function formatRelativeSync(iso: string | null): string {
  if (!iso) return 'Never synced'
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Synced just now'
  if (minutes < 60) return `Synced ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Synced ${hours}h ago`
  const days = Math.floor(hours / 24)
  return `Synced ${days}d ago`
}
