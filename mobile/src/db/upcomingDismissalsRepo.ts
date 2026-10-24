import { getDb } from './db'

/** Mirrors src/main/services/upcoming.ts's upcoming_dismissals handling and
 * src/main/sync.ts's dedicated dismissalSyncId/pushUpcomingDismissals/
 * pullUpcomingDismissals — but simpler: mobile's insurance/credit-card/
 * identity-doc rows are already keyed by sync_id locally (no local autoincrement
 * id needing translation the way desktop's item_id does), so `item_sync_id` IS the
 * row's reference to its parent item, stored directly with no resolution step.
 * `check_in` (desktop's monthly reminder) is out of scope on mobile — see the
 * approved plan's scope note — so item_sync_id is always present here. */

export type UpcomingItemType = 'insurance' | 'identity' | 'credit_card'
export type UpcomingAction = 'paid' | 'dismissed'

export interface DismissalRow {
  id: string
  item_type: UpcomingItemType
  item_sync_id: string
  due_date: string
  status: UpcomingAction
  updated_at: string
  deleted: number
  dirty: number
}

function dismissalId(itemType: UpcomingItemType, itemSyncId: string, dueDate: string): string {
  return `${itemType}:${itemSyncId}:${dueDate}`
}

export function isDismissed(itemType: UpcomingItemType, itemSyncId: string, dueDate: string): boolean {
  const row = getDb().getFirstSync<{ id: string }>(
    'SELECT id FROM upcoming_dismissals WHERE id = ? AND deleted = 0',
    [dismissalId(itemType, itemSyncId, dueDate)]
  )
  return row != null
}

export function dismissItem(itemType: UpcomingItemType, itemSyncId: string, dueDate: string, status: UpcomingAction): void {
  const now = new Date().toISOString()
  getDb().runSync(
    `INSERT INTO upcoming_dismissals (id, item_type, item_sync_id, due_date, status, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, deleted = 0, dirty = 1`,
    [dismissalId(itemType, itemSyncId, dueDate), itemType, itemSyncId, dueDate, status, now]
  )
}

export function listDirty(): DismissalRow[] {
  return getDb().getAllSync<DismissalRow>('SELECT * FROM upcoming_dismissals WHERE dirty = 1')
}

export function clearDirty(ids: string[]): void {
  if (ids.length === 0) return
  const db = getDb()
  db.withTransactionSync(() => {
    for (const id of ids) db.runSync('UPDATE upcoming_dismissals SET dirty = 0 WHERE id = ?', [id])
  })
}

export function toSyncPayload(row: DismissalRow): Record<string, unknown> {
  return {
    item_type: row.item_type,
    item_sync_id: row.item_sync_id,
    due_date: row.due_date,
    status: row.status,
    deleted: row.deleted
  }
}

export function upsertFromRemote(itemId: string, updatedAt: string, flat: Record<string, unknown>): void {
  getDb().runSync(
    `INSERT INTO upcoming_dismissals (id, item_type, item_sync_id, due_date, status, updated_at, deleted, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       item_type = excluded.item_type, item_sync_id = excluded.item_sync_id, due_date = excluded.due_date,
       status = excluded.status, updated_at = excluded.updated_at, deleted = excluded.deleted, dirty = 0`,
    [
      itemId,
      String(flat.item_type),
      String(flat.item_sync_id ?? ''),
      String(flat.due_date),
      String(flat.status),
      updatedAt,
      Number(flat.deleted) ? 1 : 0
    ]
  )
}
