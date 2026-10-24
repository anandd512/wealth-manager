import { getDb } from './db'
import type { SQLiteBindValue } from 'expo-sqlite'

/** Every synced table shares this shape: `sync_id` TEXT PRIMARY KEY, a handful of
 * "indexed" columns each table's screens actually query/sort/filter on, a `payload`
 * JSON blob carrying every other desktop column verbatim (so a mobile edit never
 * drops a field its own form doesn't expose), `last_updated`/`created_at`, a
 * `deleted` tombstone, and a local-only `dirty` outbox flag. This module factors out
 * the CRUD/flatten/sync-payload machinery every table needs, parameterized by each
 * table's own indexed-column list — see mobile/src/db/accountsRepo.ts for the first,
 * now-refactored, concrete use of this. */

export type ColumnType = 'text' | 'real' | 'int' | 'bool'

export interface ColumnSpec {
  name: string
  type: ColumnType
  notNull?: boolean
  default?: string // raw SQL default literal, e.g. "'INR'" or '0'
}

export interface TableConfig {
  table: string
  /** Indexed columns beyond the five every table gets automatically:
   * sync_id, last_updated, created_at, deleted, dirty. */
  columns: ColumnSpec[]
  orderBy: string
  /** The wire-format (sync payload) key for the "last updated" timestamp — must
   * match the column name in src/main/sync.ts's SYNCABLE_TABLES entry for this
   * table on desktop. Mobile's own local SQLite column is always named
   * `last_updated` internally regardless of this setting (purely a local naming
   * choice, same for every table) — only the JSON sent to/from the backend needs to
   * match desktop's actual column name, and desktop's `accounts` table alone is
   * named `last_updated`; every other synced table uses `updated_at`. Defaults to
   * `'last_updated'` so ACCOUNTS_CONFIG doesn't need to set it explicitly. */
  wireUpdatedAtKey?: 'last_updated' | 'updated_at'
}

const COMMON_COLUMNS: ColumnSpec[] = [
  { name: 'sync_id', type: 'text', notNull: true },
  { name: 'payload', type: 'text', notNull: true, default: "'{}'" },
  { name: 'last_updated', type: 'text', notNull: true },
  { name: 'created_at', type: 'text', notNull: true },
  { name: 'deleted', type: 'bool', notNull: true, default: '0' },
  { name: 'dirty', type: 'bool', notNull: true, default: '1' }
]

function sqlType(type: ColumnType): string {
  switch (type) {
    case 'text':
      return 'TEXT'
    case 'real':
      return 'REAL'
    case 'int':
    case 'bool':
      return 'INTEGER'
  }
}

/** Runs the table's CREATE TABLE statement. Call once from db.ts's init. */
export function createTable(config: TableConfig): void {
  const allColumns = [...config.columns, ...COMMON_COLUMNS]
  const colDefs = allColumns.map((c) => {
    let def = `${c.name} ${sqlType(c.type)}`
    if (c.notNull) def += ' NOT NULL'
    if (c.default !== undefined) def += ` DEFAULT ${c.default}`
    return def
  })
  getDb().execSync(`CREATE TABLE IF NOT EXISTS ${config.table} (${colDefs.join(', ')}, PRIMARY KEY (sync_id));`)
}

function coerceIn(value: unknown, type: ColumnType): SQLiteBindValue {
  if (value == null) return null
  switch (type) {
    case 'text':
      return String(value)
    case 'real':
      return Number(value)
    case 'int':
      return Math.trunc(Number(value))
    case 'bool':
      return Number(value) ? 1 : 0
  }
}

/** Splits a flat object (a local row's indexed columns, or a decrypted remote
 * payload) into `{ indexed, rest }` — `rest` is whatever's left over, destined for
 * (or already read from) the `payload` JSON blob. */
function splitFlat(config: TableConfig, flat: Record<string, unknown>): { indexed: Record<string, unknown>; rest: Record<string, unknown> } {
  const wireKey = config.wireUpdatedAtKey ?? 'last_updated'
  const indexedNames = new Set(config.columns.map((c) => c.name).concat(['sync_id', wireKey, 'created_at', 'deleted']))
  const indexed: Record<string, unknown> = {}
  const rest: Record<string, unknown> = {}
  for (const key of Object.keys(flat)) {
    if (indexedNames.has(key)) indexed[key] = flat[key]
    else rest[key] = flat[key]
  }
  return { indexed, rest }
}

/** Flattens a raw DB row (indexed columns are already real columns; `payload` is a
 * JSON string) into one UI-facing object, dropping the local-only `dirty` flag. */
export function flattenRow<T>(row: Record<string, unknown>): T {
  const rest = JSON.parse(row.payload as string) as Record<string, unknown>
  const { payload: _payload, dirty: _dirty, ...indexed } = row
  return { ...rest, ...indexed } as T
}

export function listRows<T>(config: TableConfig): T[] {
  const rows = getDb().getAllSync<Record<string, unknown>>(
    `SELECT * FROM ${config.table} WHERE deleted = 0 ORDER BY ${config.orderBy}`
  )
  return rows.map((r) => flattenRow<T>(r))
}

export function getRowBySyncId<T>(config: TableConfig, syncId: string): T | undefined {
  const row = getDb().getFirstSync<Record<string, unknown>>(`SELECT * FROM ${config.table} WHERE sync_id = ?`, [syncId])
  return row ? flattenRow<T>(row) : undefined
}

/** Inserts a brand-new row. `indexed` must supply every column in `config.columns`
 * plus sync_id/last_updated/created_at; `deleted`/`dirty` default to 0/1. Extra
 * fields beyond the indexed set go into the payload blob (new mobile-created rows
 * normally have none — `payload` starts at `{}`). */
export function insertRow(config: TableConfig, indexed: Record<string, unknown>, payload: Record<string, unknown> = {}): void {
  const allColumns = [...config.columns, { name: 'sync_id', type: 'text' as const }]
  const names = [...allColumns.map((c) => c.name), 'payload', 'last_updated', 'created_at', 'deleted', 'dirty']
  const values = [
    ...allColumns.map((c) => coerceIn(indexed[c.name], c.type)),
    JSON.stringify(payload),
    String(indexed.last_updated),
    String(indexed.created_at),
    0,
    1
  ]
  getDb().runSync(
    `INSERT INTO ${config.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    values
  )
}

/** Updates only the indexed columns the caller supplies (a form's fields), bumps
 * `last_updated`/`dirty`, and leaves `payload` untouched — the mechanism that lets a
 * mobile edit round-trip desktop-only fields losslessly. */
export function updateIndexedColumns(config: TableConfig, syncId: string, patch: Record<string, unknown>, now: string): void {
  const names = config.columns.filter((c) => c.name in patch)
  const assignments = names.map((c) => `${c.name} = ?`).join(', ')
  const values = names.map((c) => coerceIn(patch[c.name], c.type))
  getDb().runSync(
    `UPDATE ${config.table} SET ${assignments}${assignments ? ', ' : ''}last_updated = ?, dirty = 1 WHERE sync_id = ?`,
    [...values, now, syncId]
  )
}

/** Updates indexed columns (if any) and/or merges fields into the payload blob (for
 * desktop-only fields mobile doesn't index, e.g. accounts' principal_amount/quantity)
 * in one write, bumping last_updated/dirty exactly once. A payload field set to
 * `undefined` is left untouched (COALESCE-style), matching desktop's
 * recomputeCurrentValueFromHistory convention of not wiping a field a caller didn't
 * actually supply a new value for. */
export function updateRow(
  config: TableConfig,
  syncId: string,
  patch: { indexed?: Record<string, unknown>; payload?: Record<string, unknown> },
  now: string
): void {
  const db = getDb()
  if (patch.payload) {
    const existing = db.getFirstSync<{ payload: string }>(`SELECT payload FROM ${config.table} WHERE sync_id = ?`, [syncId])
    const current = existing ? (JSON.parse(existing.payload) as Record<string, unknown>) : {}
    for (const [key, value] of Object.entries(patch.payload)) {
      if (value !== undefined) current[key] = value
    }
    db.runSync(`UPDATE ${config.table} SET payload = ? WHERE sync_id = ?`, [JSON.stringify(current), syncId])
  }

  const indexedNames = patch.indexed ? config.columns.filter((c) => c.name in patch.indexed!) : []
  if (indexedNames.length > 0) {
    const assignments = indexedNames.map((c) => `${c.name} = ?`).join(', ')
    const values = indexedNames.map((c) => coerceIn(patch.indexed![c.name], c.type))
    db.runSync(`UPDATE ${config.table} SET ${assignments}, last_updated = ?, dirty = 1 WHERE sync_id = ?`, [...values, now, syncId])
  } else {
    db.runSync(`UPDATE ${config.table} SET last_updated = ?, dirty = 1 WHERE sync_id = ?`, [now, syncId])
  }
}

export function softDeleteRow(config: TableConfig, syncId: string, now: string): void {
  getDb().runSync(`UPDATE ${config.table} SET deleted = 1, dirty = 1, last_updated = ? WHERE sync_id = ?`, [now, syncId])
}

/** Flattens a local row into the exact shape desktop's own generic pushTable would
 * produce for an equivalent row (every real column except the local-only `dirty`),
 * so desktop's generic upsertRow can write it back without missing columns. */
export function toSyncPayload(config: TableConfig, row: Record<string, unknown>): Record<string, unknown> {
  const rest = JSON.parse(row.payload as string) as Record<string, unknown>
  const wireKey = config.wireUpdatedAtKey ?? 'last_updated'
  const indexed: Record<string, unknown> = { sync_id: row.sync_id, [wireKey]: row.last_updated, created_at: row.created_at, deleted: row.deleted }
  for (const c of config.columns) indexed[c.name] = row[c.name]
  return { ...rest, ...indexed }
}

/** Pull-side counterpart: splits a decrypted remote payload (desktop- or
 * mobile-authored) into indexed columns, stuffing everything else — including any
 * column mobile doesn't know about — into `payload` untouched. */
export function upsertFromRemote(config: TableConfig, flat: Record<string, unknown>): void {
  const wireKey = config.wireUpdatedAtKey ?? 'last_updated'
  const { indexed, rest } = splitFlat(config, flat)
  const allColumns = [...config.columns, { name: 'sync_id', type: 'text' as const }]
  const names = [...allColumns.map((c) => c.name), 'payload', 'last_updated', 'created_at', 'deleted']
  const values = [
    ...allColumns.map((c) => coerceIn(indexed[c.name], c.type)),
    JSON.stringify(rest),
    String(flat[wireKey]),
    String(flat.created_at ?? flat[wireKey]),
    Number(flat.deleted) ? 1 : 0
  ]
  const updateAssignments = names.filter((n) => n !== 'sync_id').map((n) => `${n} = excluded.${n}`).join(', ')
  getDb().runSync(
    `INSERT INTO ${config.table} (${names.join(', ')}, dirty) VALUES (${names.map(() => '?').join(', ')}, 0)
     ON CONFLICT(sync_id) DO UPDATE SET ${updateAssignments}, dirty = 0`,
    values
  )
}

export function listDirty<T extends Record<string, unknown>>(config: TableConfig): T[] {
  return getDb().getAllSync<T>(`SELECT * FROM ${config.table} WHERE dirty = 1`)
}

export function clearDirty(config: TableConfig, syncIds: string[]): void {
  if (syncIds.length === 0) return
  const db = getDb()
  db.withTransactionSync(() => {
    for (const id of syncIds) {
      db.runSync(`UPDATE ${config.table} SET dirty = 0 WHERE sync_id = ?`, [id])
    }
  })
}
