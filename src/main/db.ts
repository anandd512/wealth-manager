import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
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
  vehicle_number TEXT,
  sum_assured REAL,
  premium_amount REAL,
  premium_frequency TEXT,
  start_date TEXT,
  expiry_date TEXT,
  renewal_date TEXT,
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
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credential_vault (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_name TEXT NOT NULL,
  category TEXT,
  url TEXT,
  username TEXT,
  password TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv_settings (
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
    ['document_original_name', 'TEXT']
  ],
  insurance_policies: [
    ['vehicle_number', 'TEXT'],
    ['renewal_date', 'TEXT']
  ],
  identity_documents: [
    ['date_of_birth', 'TEXT'],
    ['additional_info', 'TEXT'],
    ['vehicle_class', 'TEXT'],
    ['vehicle_model', 'TEXT'],
    ['insurance_valid_upto', 'TEXT'],
    ['constituency', 'TEXT'],
    ['voter_serial_number', 'TEXT']
  ],
  credit_cards: [
    ['statement_day', 'INTEGER'],
    ['last_reminder_sent', 'TEXT']
  ],
  value_history: [
    ['invested_value', 'REAL'],
    ['quantity', 'REAL']
  ],
  credential_vault: [
    ['category', 'TEXT']
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

function runMigrations(raw: SqlJsDatabase): void {
  applyColumnRenames(raw)
  for (const table of Object.keys(MIGRATION_COLUMNS)) {
    ensureColumns(raw, table)
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
