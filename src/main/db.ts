import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'crypto'
// sql.js is a WASM build of SQLite with no native compilation step — chosen specifically
// to avoid depending on a working C++ toolchain (better-sqlite3 / SQLCipher need node-gyp).
// The whole database is encrypted at rest with AES-256-GCM using a key derived from the
// master password (see auth.ts); it only ever exists decrypted in memory while unlocked.
import initSqlJs from 'sql.js'

type SqlJsDatabase = InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subtype TEXT NOT NULL,
  institution TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  is_liability INTEGER NOT NULL DEFAULT 0,
  current_value REAL NOT NULL DEFAULT 0,
  ticker TEXT,
  quantity REAL,
  last_price REAL,
  last_price_at TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  debit_card_number TEXT,
  debit_card_network TEXT,
  debit_card_expiry_month INTEGER,
  debit_card_expiry_year INTEGER,
  debit_card_cvv TEXT,
  debit_card_name_on_card TEXT,
  principal_amount REAL,
  interest_rate REAL,
  tenure_months INTEGER,
  emi_amount REAL,
  loan_start_date TEXT,
  document_path TEXT,
  document_original_name TEXT,
  last_updated TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS value_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  value REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  invested_value REAL,
  quantity REAL
);
CREATE INDEX IF NOT EXISTS idx_value_history_account ON value_history(account_id, recorded_at);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL UNIQUE,
  total_assets REAL NOT NULL,
  total_liabilities REAL NOT NULL,
  net_worth REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS insurance_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_number TEXT,
  policy_type TEXT,
  insurer TEXT,
  insured_name TEXT,
  nominee_name TEXT,
  vehicle_number TEXT,
  sum_assured REAL,
  premium_amount REAL,
  premium_frequency TEXT,
  start_date TEXT,
  expiry_date TEXT,
  renewal_date TEXT,
  riders TEXT,
  document_path TEXT,
  document_original_name TEXT,
  last_reminder_sent TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL,
  label TEXT,
  id_number TEXT,
  full_name TEXT,
  date_of_birth TEXT,
  issued_date TEXT,
  expiry_date TEXT,
  additional_info TEXT,
  document_path TEXT,
  document_original_name TEXT,
  last_reminder_sent TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  network TEXT,
  issuer TEXT,
  card_number TEXT,
  name_on_card TEXT,
  expiry_month INTEGER,
  expiry_year INTEGER,
  cvv TEXT,
  credit_limit REAL,
  statement_day INTEGER,
  last_reminder_sent TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credential_vault (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_type TEXT NOT NULL DEFAULT 'login',
  service_name TEXT NOT NULL,
  category TEXT,
  url TEXT,
  username TEXT,
  password TEXT,
  totp_secret TEXT,
  password_changed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Sync bookkeeping (pull cursors) — deliberately a separate table from kv_settings,
-- now that kv_settings itself is synced (see src/main/sync.ts). A cursor is this
-- device's own progress through the pull stream; syncing it to another device would
-- overwrite that device's independent progress with this one's, which is exactly
-- backwards. Never added to SYNCABLE_TABLES.
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Tracks "mark as paid" / "dismiss" actions on dashboard upcoming items. Keyed by the
-- specific due date rather than just the item, so the next billing/renewal cycle (a new
-- due date) naturally reappears without needing to "undo" anything.
CREATE TABLE IF NOT EXISTS upcoming_dismissals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(item_type, item_id, due_date)
);
`

// Cloud-sync metadata (see src/main/sync.ts), appended to every synced table below.
// `sync_id` is the stable identifier shared across devices — the local autoincrement
// `id` is only ever meaningful on this one device. `updated_at` drives last-write-wins
// and incremental pulls (none of these tables had a reliable "last modified" column
// before this — `created_at` doesn't change on edits). `deleted` is a tombstone: every
// delete* function for a synced table now sets this instead of hard-deleting, so the
// deletion itself propagates to other devices on next sync instead of just vanishing
// locally with nothing for them to learn from.
const SYNC_COLUMNS: [string, string][] = [
  ['sync_id', 'TEXT'],
  ['updated_at', 'TEXT'],
  ['deleted', 'INTEGER NOT NULL DEFAULT 0']
]

const MIGRATION_COLUMNS: Record<string, [string, string][]> = {
  accounts: [
    ['account_number', 'TEXT'],
    ['ifsc_code', 'TEXT'],
    ['debit_card_number', 'TEXT'],
    ['debit_card_network', 'TEXT'],
    ['debit_card_expiry_month', 'INTEGER'],
    ['debit_card_expiry_year', 'INTEGER'],
    ['debit_card_cvv', 'TEXT'],
    ['debit_card_name_on_card', 'TEXT'],
    ['principal_amount', 'REAL'],
    ['interest_rate', 'REAL'],
    ['tenure_months', 'INTEGER'],
    ['emi_amount', 'REAL'],
    ['loan_start_date', 'TEXT'],
    ['document_path', 'TEXT'],
    ['document_original_name', 'TEXT'],
    ['purchase_price', 'REAL'],
    ['purchase_date', 'TEXT'],
    ['ownership_pct', 'REAL'],
    ['sync_id', 'TEXT'],
    ['deleted', 'INTEGER NOT NULL DEFAULT 0']
    // Note: accounts already had `last_updated` from day one, serving the role
    // `updated_at` plays for the other synced tables below — no need to add it here.
  ],
  insurance_policies: [
    ['vehicle_number', 'TEXT'],
    ['renewal_date', 'TEXT'],
    ['nominee_name', 'TEXT'],
    ['riders', 'TEXT'],
    ['additional_insured', 'TEXT'],
    ...SYNC_COLUMNS
  ],
  identity_documents: [
    ['date_of_birth', 'TEXT'],
    ['additional_info', 'TEXT'],
    ['vehicle_class', 'TEXT'],
    ['vehicle_model', 'TEXT'],
    ['insurance_valid_upto', 'TEXT'],
    ['constituency', 'TEXT'],
    ['voter_serial_number', 'TEXT'],
    ...SYNC_COLUMNS
  ],
  credit_cards: [
    ['statement_day', 'INTEGER'],
    ['last_reminder_sent', 'TEXT'],
    ['status', "TEXT NOT NULL DEFAULT 'active'"],
    ...SYNC_COLUMNS
  ],
  value_history: [
    ['invested_value', 'REAL'],
    ['quantity', 'REAL'],
    ...SYNC_COLUMNS
  ],
  credential_vault: [
    ['category', 'TEXT'],
    ['totp_secret', 'TEXT'],
    ['password_changed_at', 'TEXT'],
    ['entry_type', 'TEXT'],
    ...SYNC_COLUMNS
  ],
  // net_worth_snapshots and kv_settings don't get a `sync_id` column — each already
  // has its own natural unique key (snapshot_date / key respectively), so sync.ts
  // uses that directly as the sync identity instead of a redundant random id. That
  // also means two devices recording the same date, or writing the same setting,
  // naturally converge on one row instead of colliding or duplicating.
  net_worth_snapshots: [
    ['updated_at', 'TEXT'],
    ['deleted', 'INTEGER NOT NULL DEFAULT 0']
  ],
  kv_settings: [
    ['updated_at', 'TEXT'],
    ['deleted', 'INTEGER NOT NULL DEFAULT 0']
  ],
  // upcoming_dismissals keeps its local `item_id` (an insurance_policies/
  // identity_documents/credit_cards row's local autoincrement id) for all local
  // lookups, unchanged — but that id is meaningless on another device. `item_sync_id`
  // is the portable pointer (resolved from item_id via the relevant table's own
  // sync_id) that actually travels in the sync payload; see sync.ts's dedicated
  // pushUpcomingDismissals/pullUpcomingDismissals for why this table can't use the
  // generic mechanism the others do.
  upcoming_dismissals: [
    ['item_sync_id', 'TEXT'],
    ['updated_at', 'TEXT'],
    ['deleted', 'INTEGER NOT NULL DEFAULT 0']
  ]
}

// [table, oldName, newName] — applied before ensureColumns so any data in the old
// column carries over instead of getting a blank new column alongside a stale one.
const COLUMN_RENAMES: [string, string, string][] = [
  ['credit_cards', 'payment_due_day', 'statement_day']
]

function tableColumns(raw: SqlJsDatabase, table: string): Set<string> {
  const existing = new Set<string>()
  const res = raw.exec(`PRAGMA table_info(${table})`)
  for (const row of res[0]?.values ?? []) {
    existing.add(row[1] as string) // column 1 is "name" in table_info output
  }
  return existing
}

function applyColumnRenames(raw: SqlJsDatabase): void {
  for (const [table, oldName, newName] of COLUMN_RENAMES) {
    const existing = tableColumns(raw, table)
    if (existing.has(oldName) && !existing.has(newName)) {
      raw.run(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`)
    }
  }
}

function ensureColumns(raw: SqlJsDatabase, table: string): void {
  const existing = tableColumns(raw, table)
  for (const [column, type] of MIGRATION_COLUMNS[table] ?? []) {
    if (!existing.has(column)) {
      raw.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    }
  }
}

// Every pre-existing row predates the `sync_id` column, so it starts out NULL —
// backfill before the unique index below, since SQLite only treats NULLs as
// mutually non-conflicting, not a row genuinely missing an id to sync by.
function backfillSyncIds(raw: SqlJsDatabase, table: string): void {
  const rows = raw.exec(`SELECT id FROM ${table} WHERE sync_id IS NULL`)
  for (const row of rows[0]?.values ?? []) {
    raw.run(`UPDATE ${table} SET sync_id = ? WHERE id = ?`, [randomUUID(), row[0] as number])
  }
  raw.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_sync_id ON ${table}(sync_id)`)
}

// Every synced table except `accounts` got `updated_at` as a nullable ALTER TABLE
// ADD COLUMN — which leaves it NULL on every row that existed before this migration
// ran, since ADD COLUMN never backfills existing rows. `accounts` doesn't need this:
// it's used `last_updated NOT NULL` since before sync existed, so every row already
// had a value. Every *other* synced table hits it though (not just the five sharing
// accounts' per-record pattern — kv_settings, net_worth_snapshots and
// upcoming_dismissals went through the identical nullable-ADD-COLUMN migration too),
// and a NULL updated_at makes the backend reject the push outright (see
// backend/src/functions/syncPush.ts's `!item.updatedAt` check) — this is the bug
// behind "item missing required fields" showing up for real pre-existing data.
//
// Falls back to `fallbackColumn` (each table's own closest substitute for "when was
// this last touched") rather than `datetime('now')`, so pre-migration rows still
// sort sensibly by actual history instead of all claiming "just now". kv_settings
// has no such column at all (just `key`/`value` before this), so it's the one
// exception that genuinely does fall back to the current time.
function backfillUpdatedAt(raw: SqlJsDatabase, table: string, fallbackColumn: string): void {
  raw.run(`UPDATE ${table} SET updated_at = ${fallbackColumn} WHERE updated_at IS NULL`)
}

function backfillUpdatedAtToNow(raw: SqlJsDatabase, table: string): void {
  raw.run(`UPDATE ${table} SET updated_at = ? WHERE updated_at IS NULL`, [new Date().toISOString()])
}

const SYNCED_TABLES = [
  'accounts',
  'insurance_policies',
  'identity_documents',
  'credit_cards',
  'value_history',
  'credential_vault'
]

// [table, column to copy into updated_at when it's NULL] — see backfillUpdatedAt.
const UPDATED_AT_FALLBACK: [string, string][] = [
  ['insurance_policies', 'created_at'],
  ['identity_documents', 'created_at'],
  ['credit_cards', 'created_at'],
  ['value_history', 'recorded_at'],
  ['credential_vault', 'created_at'],
  // snapshot_date is a plain date ("2026-10-20"), not a full ISO timestamp — still a
  // valid, correctly-sortable fallback since this type's pull cursor only ever
  // compares net_worth_snapshot rows against each other, never other types.
  ['net_worth_snapshots', 'snapshot_date'],
  ['upcoming_dismissals', 'created_at']
]

// kv_settings has no prior timestamp column to fall back to at all.
const UPDATED_AT_FALLBACK_TO_NOW = ['kv_settings']

function runMigrations(raw: SqlJsDatabase): void {
  applyColumnRenames(raw)
  for (const table of Object.keys(MIGRATION_COLUMNS)) {
    ensureColumns(raw, table)
  }
  for (const table of SYNCED_TABLES) {
    backfillSyncIds(raw, table)
  }
  for (const [table, fallbackColumn] of UPDATED_AT_FALLBACK) {
    backfillUpdatedAt(raw, table, fallbackColumn)
  }
  for (const table of UPDATED_AT_FALLBACK_TO_NOW) {
    backfillUpdatedAtToNow(raw, table)
  }
}

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null
let rawDb: SqlJsDatabase | null = null
let currentKey: Buffer | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

function dbFilePath(): string {
  return join(app.getPath('userData'), 'wealth.db.enc')
}

function encrypt(data: Uint8Array, key: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext])
}

function decrypt(blob: Buffer, key: Buffer): Uint8Array {
  const iv = blob.subarray(0, 12)
  const authTag = blob.subarray(12, 28)
  const ciphertext = blob.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return new Uint8Array(decrypted)
}

function persistNow(): void {
  if (!rawDb || !currentKey) return
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const bytes = rawDb.export()
  const encrypted = encrypt(bytes, currentKey)
  const path = dbFilePath()
  const tmpPath = `${path}.tmp`
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(tmpPath, encrypted, { mode: 0o600 })
  renameSync(tmpPath, path)
}

function persistSoon(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistNow()
  }, 150)
}

class StatementShim {
  constructor(
    private raw: SqlJsDatabase,
    private sql: string
  ) {}

  private bindParams(args: unknown[]): unknown {
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      const obj = args[0] as Record<string, unknown>
      const named: Record<string, unknown> = {}
      for (const k of Object.keys(obj)) named['@' + k] = obj[k]
      return named
    }
    return args
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number } {
    const stmt = this.raw.prepare(this.sql)
    try {
      stmt.bind(this.bindParams(args) as never)
      stmt.step()
    } finally {
      stmt.free()
    }
    const changes = this.raw.getRowsModified()
    let lastInsertRowid = 0
    if (/^\s*insert/i.test(this.sql)) {
      const res = this.raw.exec('SELECT last_insert_rowid() AS id')
      lastInsertRowid = (res[0]?.values?.[0]?.[0] as number) ?? 0
    }
    persistSoon()
    return { changes, lastInsertRowid }
  }

  get(...args: unknown[]): unknown {
    const stmt = this.raw.prepare(this.sql)
    try {
      stmt.bind(this.bindParams(args) as never)
      const has = stmt.step()
      return has ? stmt.getAsObject() : undefined
    } finally {
      stmt.free()
    }
  }

  all(...args: unknown[]): unknown[] {
    const stmt = this.raw.prepare(this.sql)
    const rows: unknown[] = []
    try {
      stmt.bind(this.bindParams(args) as never)
      while (stmt.step()) rows.push(stmt.getAsObject())
    } finally {
      stmt.free()
    }
    return rows
  }
}

export interface DbHandle {
  prepare(sql: string): StatementShim
}

function wrapDb(raw: SqlJsDatabase): DbHandle {
  return { prepare: (sql: string) => new StatementShim(raw, sql) }
}

let dbHandle: DbHandle | null = null

export async function openDatabase(key: Buffer): Promise<DbHandle> {
  if (!SQL) {
    SQL = await initSqlJs()
  }
  const path = dbFilePath()
  let raw: SqlJsDatabase
  if (existsSync(path)) {
    const blob = readFileSync(path)
    let plaintext: Uint8Array
    try {
      plaintext = decrypt(blob, key)
    } catch {
      throw new Error('Incorrect password, or the database file is corrupted.')
    }
    raw = new SQL.Database(plaintext)
  } else {
    raw = new SQL.Database()
  }
  raw.run(SCHEMA)
  runMigrations(raw)
  rawDb = raw
  currentKey = key
  dbHandle = wrapDb(raw)
  persistNow()
  return dbHandle
}

export function getDb(): DbHandle {
  if (!dbHandle) throw new Error('Database is locked. Unlock the app first.')
  return dbHandle
}

export function closeDatabase(): void {
  if (rawDb) {
    persistNow()
    rawDb.close()
    rawDb = null
  }
  dbHandle = null
  currentKey = null
}

export function rekeyDatabase(newKey: Buffer): void {
  if (!rawDb) throw new Error('Database is locked.')
  currentKey = newKey
  persistNow()
}

export function isUnlocked(): boolean {
  return dbHandle !== null
}

// Exposed for the backup/restore feature.
export function getDbFilePath(): string {
  return dbFilePath()
}

export function flushDatabase(): void {
  persistNow()
}

// Exposed so other modules (fileStore.ts) can encrypt/decrypt uploaded documents
// with the same master-password-derived key, without each module managing its own
// key lifecycle. Never persisted — only ever held in memory while unlocked.
export function getCurrentKey(): Buffer {
  if (!currentKey) throw new Error('Database is locked. Unlock the app first.')
  return currentKey
}

export { encrypt, decrypt }
