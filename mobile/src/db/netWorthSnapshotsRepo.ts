import { getDb } from './db'

/** Pull-only local cache of desktop's net_worth_snapshots, for the trend chart.
 * Mobile never writes its own snapshots — net worth is always computed live from
 * the current accounts list (see lib/netWorth.ts) — it only needs desktop's
 * historical record to chart. Keyed by snapshot_date directly (a natural key, same
 * as desktop's own idColumn), so a pulled row can be upserted with a plain
 * INSERT ... ON CONFLICT with no local/portable-id split needed. */

export interface NetWorthSnapshot {
  snapshot_date: string
  total_assets: number
  total_liabilities: number
  net_worth: number
  updated_at: string
}

export function listSnapshots(): NetWorthSnapshot[] {
  return getDb().getAllSync<NetWorthSnapshot>(
    `SELECT snapshot_date, total_assets, total_liabilities, net_worth, updated_at
     FROM net_worth_snapshots WHERE deleted = 0 ORDER BY snapshot_date`
  )
}

export function upsertFromRemote(flat: Record<string, unknown>): void {
  getDb().runSync(
    `INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(snapshot_date) DO UPDATE SET
       total_assets = excluded.total_assets, total_liabilities = excluded.total_liabilities,
       net_worth = excluded.net_worth, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    [
      String(flat.snapshot_date),
      Number(flat.total_assets ?? 0),
      Number(flat.total_liabilities ?? 0),
      Number(flat.net_worth ?? 0),
      String(flat.updated_at ?? new Date().toISOString()),
      Number(flat.deleted) ? 1 : 0
    ]
  )
}
