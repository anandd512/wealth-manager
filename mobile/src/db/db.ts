import { openDatabaseSync, deleteDatabaseSync, SQLiteDatabase } from 'expo-sqlite'
import { createTable } from './tableStore'
import { ACCOUNTS_CONFIG, VAULT_CONFIG, CREDIT_CARDS_CONFIG, INSURANCE_CONFIG, IDENTITY_DOCS_CONFIG } from './tableConfigs'

let db: SQLiteDatabase | null = null

/** Local cache + outbox for synced records. One SQLite file via expo-sqlite — bundled
 * into Expo Go for this SDK (see mobile/node_modules/expo/bundledNativeModules.json),
 * same tier as expo-secure-store/expo-crypto. */
export function getDb(): SQLiteDatabase {
  if (db) return db
  db = openDatabaseSync('artha.db')
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      dirty INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS value_history (
      sync_id TEXT PRIMARY KEY,
      account_sync_id TEXT NOT NULL,
      value REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      invested_value REAL,
      quantity REAL,
      last_updated TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      dirty INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_value_history_account ON value_history(account_sync_id, recorded_at);
    CREATE TABLE IF NOT EXISTS net_worth_snapshots (
      snapshot_date TEXT PRIMARY KEY,
      total_assets REAL NOT NULL,
      total_liabilities REAL NOT NULL,
      net_worth REAL NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS upcoming_dismissals (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL,
      item_sync_id TEXT,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      dirty INTEGER NOT NULL DEFAULT 0
    );
  `)
  createTable(ACCOUNTS_CONFIG)
  createTable(VAULT_CONFIG)
  createTable(CREDIT_CARDS_CONFIG)
  createTable(INSURANCE_CONFIG)
  createTable(IDENTITY_DOCS_CONFIG)
  return db
}

// Used by the "forgot password" flow (see AuthContext.wipeLocalData) — a lost
// master password on mobile is unrecoverable (it's the only key, zero-knowledge
// design), so the only way forward is a clean local slate. Closes and deletes the
// SQLite file outright rather than dropping tables, so a stale handle can't
// resurrect data mid-wipe; the next getDb() call recreates it from scratch.
export function wipeLocalDb(): void {
  if (db) {
    db.closeSync()
    db = null
  }
  try {
    deleteDatabaseSync('artha.db')
  } catch {
    // Nothing to delete (fresh install) — fine.
  }
}
