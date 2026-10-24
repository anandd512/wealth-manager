import { randomBytes } from 'crypto'
import { getDb, encrypt, decrypt } from './db'
import { deriveSyncKeys } from './syncCrypto'
import { deriveKey } from './auth'
import { getSecret, setSecret, clearSecret } from './secrets'
import { apiRequest } from './backendApi'
import { recomputeCurrentValueFromHistory } from './services/accounts'
import { recordSnapshot } from './services/netWorth'
import { backfillUpload } from './fileStore'

/**
 * Cloud-sync client — talks to the Azure Functions backend in /backend. Every record
 * is encrypted with the Data Key (see syncCrypto.ts) before it leaves this process;
 * the server only ever sees ciphertext. See backend/README.md for the API contract
 * and src/main/db.ts's `encrypt`/`decrypt` for the shared AEAD envelope that makes a
 * record written here readable by the mobile app, and vice versa.
 *
 * Email + password only (no Google/Microsoft — removed: the mobile app runs in plain
 * Expo Go, which can't handle the OAuth redirect back into the app, so it never
 * actually worked end-to-end there). Registration requires proving the email address
 * first — see requestEmailVerification()/confirmEmailVerification() — before
 * registerSync() will succeed; the backend rejects a register call without a valid
 * verification token.
 *
 * The typed password derives both the server-side auth proof and the Data Key that
 * encrypts every record (registerSync/loginSync do both in one step via
 * deriveSyncKeys), so it's cached locally (OS-keychain-backed, like the API keys in
 * secrets.ts) right away — syncNow() doesn't need it passed in on every call, and
 * this avoids re-running scrypt (deliberately slow) more than once per login.
 */

interface KdfParams {
  N: number
  r: number
  p: number
}

// Must match auth.ts's deriveKey() parameters exactly — this is the SAME scrypt
// call auth.ts makes, just also recorded here so a new device can read back
// whatever cost parameters this account was actually created with.
const SCRYPT_KDF_PARAMS: KdfParams = { N: 1 << 15, r: 8, p: 1 }

interface SaltResponse {
  kdfAlgorithm: string
  kdfSalt: string
  kdfParams: KdfParams
}

interface AuthResponse {
  userId: string
  token: string
}

interface SyncPushItem {
  id: string
  type: string
  ciphertext: string
  updatedAt: string
  deleted: boolean
}

interface SyncPullItem extends SyncPushItem {}

function sessionToken(): string | null {
  return getSecret('syncToken')
}

export function syncStatus(): { connected: boolean; email: string | null } {
  const email = getSecret('syncEmail')
  const token = getSecret('syncToken')
  return { connected: Boolean(email && token), email }
}

function cacheDataKey(dataKey: Buffer): void {
  setSecret('syncDataKey', dataKey.toString('base64'))
}

function cachedDataKey(): Buffer | null {
  const stored = getSecret('syncDataKey')
  return stored ? Buffer.from(stored, 'base64') : null
}

/** Step 1 of registration — emails a 6-digit code to this address. */
export async function requestEmailVerification(email: string): Promise<void> {
  await apiRequest('/api/auth/verify/request', { method: 'POST', body: { email, purpose: 'register' } })
}

/** Step 2 — exchanges the emailed code for a short-lived token, which registerSync()
 * then requires. Throws (e.g. "Incorrect or expired code") if the code is wrong. */
export async function confirmEmailVerification(email: string, code: string): Promise<string> {
  const result = await apiRequest<{ verificationToken: string }>('/api/auth/verify/confirm', {
    method: 'POST',
    body: { email, code, purpose: 'register' }
  })
  return result.verificationToken
}

export async function registerSync(email: string, password: string, verificationToken: string): Promise<void> {
  const salt = randomBytes(16)
  const masterKey = deriveKey(password, salt.toString('hex'))
  const { authKey, dataKey } = deriveSyncKeys(masterKey)
  const result = await apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: {
      email,
      kdfSalt: salt.toString('base64'),
      kdfParams: SCRYPT_KDF_PARAMS,
      authKey: authKey.toString('base64'),
      verificationToken
    }
  })
  setSecret('syncEmail', email)
  setSecret('syncToken', result.token)
  cacheDataKey(dataKey)
}

export async function loginSync(email: string, password: string): Promise<void> {
  const salt = await apiRequest<SaltResponse>(`/api/auth/salt?email=${encodeURIComponent(email)}`)
  const saltHex = Buffer.from(salt.kdfSalt, 'base64').toString('hex')
  const masterKey = deriveKey(password, saltHex)
  const { authKey, dataKey } = deriveSyncKeys(masterKey)
  const result = await apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, authKey: authKey.toString('base64') }
  })
  setSecret('syncEmail', email)
  setSecret('syncToken', result.token)
  cacheDataKey(dataKey)
}

export function logoutSync(): void {
  clearSecret('syncEmail')
  clearSecret('syncToken')
  clearSecret('syncDataKey')
}

interface SyncableTable {
  table: string
  type: string
  // accounts has used `last_updated` since before sync existed; every table added
  // since uses `updated_at` (see db.ts's SYNC_COLUMNS) — recorded per-table rather
  // than assumed, since a push to the wrong column would just silently read `undefined`.
  updatedAtColumn: string
  // Which column identifies a row across devices. Defaults to 'sync_id' (a random id
  // generated at creation) when omitted. Two tables use an existing natural key
  // instead, specifically so two devices writing "the same" row before ever syncing
  // converge on one row rather than colliding or duplicating — see db.ts's
  // MIGRATION_COLUMNS comment on net_worth_snapshots/kv_settings for why.
  idColumn?: string
  // True only when idColumn IS the table's primary key (kv_settings: `key`), as
  // opposed to a unique column alongside a separate autoincrement `id` (accounts'
  // `sync_id`, net_worth_snapshots' `snapshot_date`). Changes how upsertRow writes —
  // with no separate `id` to look up, it upserts directly by idColumn.
  primaryKeyIsIdColumn?: boolean
}

// Add a row here for every table that should follow accounts to the cloud — the
// push/pull logic below is generic (it just round-trips every non-`id` column as
// JSON), so a new table only needs this one line plus the same sync_id/updated_at/
// deleted migration columns added in db.ts's MIGRATION_COLUMNS.
//
// `upcoming_dismissals` is deliberately NOT here — its `item_id` is a local
// autoincrement id referencing another synced table's row, meaningless on a second
// device. It gets dedicated pushUpcomingDismissals/pullUpcomingDismissals below
// instead, called explicitly from syncNow() after this generic list has run (so the
// tables it points into have already arrived locally this same sync).
//
// value_history is the same situation — account_id is a local autoincrement id
// referencing accounts, meaningless on a second device — so it also gets dedicated
// pushValueHistory/pullValueHistory below instead of going through here.
const SYNCABLE_TABLES: SyncableTable[] = [
  { table: 'accounts', type: 'account', updatedAtColumn: 'last_updated' },
  { table: 'insurance_policies', type: 'insurance_policy', updatedAtColumn: 'updated_at' },
  { table: 'identity_documents', type: 'identity_document', updatedAtColumn: 'updated_at' },
  { table: 'credit_cards', type: 'credit_card', updatedAtColumn: 'updated_at' },
  { table: 'credential_vault', type: 'credential_vault', updatedAtColumn: 'updated_at' },
  { table: 'net_worth_snapshots', type: 'net_worth_snapshot', updatedAtColumn: 'updated_at', idColumn: 'snapshot_date' },
  {
    table: 'kv_settings',
    type: 'kv_setting',
    updatedAtColumn: 'updated_at',
    idColumn: 'key',
    primaryKeyIsIdColumn: true
  }
]

// Cursors live in their own never-synced table (sync_meta), not kv_settings — see
// db.ts's CREATE TABLE sync_meta comment for why that split matters now that
// kv_settings itself is synced.
function getCursor(type: string): string {
  const row = getDb().prepare('SELECT value FROM sync_meta WHERE key = ?').get(`cursor_${type}`) as
    | { value: string }
    | undefined
  return row?.value ?? '1970-01-01T00:00:00.000Z'
}

function setCursor(type: string, cursor: string): void {
  getDb()
    .prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(`cursor_${type}`, cursor)
}

function idColumnOf(table: SyncableTable): string {
  return table.idColumn ?? 'sync_id'
}

const tableColumnsCache = new Map<string, Set<string>>()

// Pulled payloads are allowed to carry keys this device's schema doesn't recognize —
// e.g. a column a newer client added, or (as happened with mobile's vault/credit
// card/insurance/identity-document pushes before that bug was fixed) a client using
// the wrong field name for a column that exists under a different name here. Dropping
// unknown keys keeps one bad/unexpected field from crashing the entire sync instead
// of just that field silently not being set.
function tableColumns(tableName: string): Set<string> {
  let cols = tableColumnsCache.get(tableName)
  if (!cols) {
    const rows = getDb().prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
    cols = new Set(rows.map((r) => r.name))
    tableColumnsCache.set(tableName, cols)
  }
  return cols
}

function knownColumnsOnly(tableName: string, payload: Record<string, unknown>): Record<string, unknown> {
  const valid = tableColumns(tableName)
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(payload)) {
    if (valid.has(key)) result[key] = payload[key]
  }
  return result
}

function pushTable(table: SyncableTable, dataKey: Buffer, token: string): Promise<void> {
  const idColumn = idColumnOf(table)
  const rows = getDb()
    .prepare(`SELECT * FROM ${table.table}`)
    .all() as Record<string, unknown>[]

  const items: SyncPushItem[] = rows
    .filter((row) => row[idColumn]) // rows not yet backfilled on this run — picked up next sync
    .map((row) => {
      const { id: _localId, ...payload } = row
      const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8')
      return {
        id: row[idColumn] as string,
        type: table.type,
        ciphertext: encrypt(plaintext, dataKey).toString('base64'),
        updatedAt: row[table.updatedAtColumn] as string,
        deleted: Boolean(row.deleted)
      }
    })

  if (items.length === 0) return Promise.resolve()

  // Backend caps batches at 500 (see backend/src/functions/syncPush.ts) — chunk here
  // rather than assume any single account stays under that.
  const BATCH_SIZE = 500
  const batches: SyncPushItem[][] = []
  for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE))

  return batches.reduce<Promise<void>>(
    (chain, batch) =>
      chain.then(() => apiRequest('/api/sync/push', { method: 'POST', body: { items: batch }, token }).then(() => {})),
    Promise.resolve()
  )
}

function upsertRow(table: SyncableTable, rawPayload: Record<string, unknown>): void {
  const db = getDb()
  const idColumn = idColumnOf(table)
  const payload = knownColumnsOnly(table.table, rawPayload)

  if (table.primaryKeyIsIdColumn) {
    // No separate `id` to look up — the natural key already is the primary key, so
    // this is a direct upsert (same pattern as settings.ts's own setKv).
    const columns = Object.keys(payload)
    const assignments = columns.filter((c) => c !== idColumn).map((c) => `${c} = @${c}`).join(', ')
    const placeholders = columns.map((c) => `@${c}`).join(', ')
    db.prepare(
      `INSERT INTO ${table.table} (${columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(${idColumn}) DO UPDATE SET ${assignments}`
    ).run(payload)
    return
  }

  const existing = db.prepare(`SELECT id FROM ${table.table} WHERE ${idColumn} = ?`).get(payload[idColumn]) as
    | { id: number }
    | undefined

  const columns = Object.keys(payload)
  if (existing) {
    const assignments = columns.map((c) => `${c} = @${c}`).join(', ')
    db.prepare(`UPDATE ${table.table} SET ${assignments} WHERE id = @__id`).run({ ...payload, __id: existing.id })
  } else {
    const placeholders = columns.map((c) => `@${c}`).join(', ')
    db.prepare(`INSERT INTO ${table.table} (${columns.join(', ')}) VALUES (${placeholders})`).run(payload)
  }
}

async function pullTable(table: SyncableTable, dataKey: Buffer, token: string): Promise<void> {
  let cursor = getCursor(table.type)
  for (;;) {
    const page = await apiRequest<{ items: SyncPullItem[]; cursor: string; hasMore: boolean }>(
      `/api/sync/pull?since=${encodeURIComponent(cursor)}`,
      { token }
    )
    for (const item of page.items) {
      if (item.type !== table.type) continue
      const plaintext = decrypt(Buffer.from(item.ciphertext, 'base64'), dataKey)
      const payload = JSON.parse(Buffer.from(plaintext).toString('utf-8')) as Record<string, unknown>
      upsertRow(table, payload)
    }
    cursor = page.cursor
    setCursor(table.type, cursor)
    if (!page.hasMore) break
  }
}

// item_type -> the table holding that item's real row, and the UpcomingItemType value
// used locally (see shared/types.ts). 'check_in' has no parent row (itemId is always
// 0 — a synthetic whole-app reminder), so it's absent here on purpose.
const DISMISSAL_PARENT_TABLES: Record<string, string> = {
  insurance: 'insurance_policies',
  identity: 'identity_documents',
  credit_card: 'credit_cards'
}

function resolveItemSyncId(itemType: string, itemId: number): string | null {
  const parentTable = DISMISSAL_PARENT_TABLES[itemType]
  if (!parentTable) return null // check_in
  const row = getDb().prepare(`SELECT sync_id FROM ${parentTable} WHERE id = ?`).get(itemId) as
    | { sync_id: string | null }
    | undefined
  return row?.sync_id ?? null
}

function resolveLocalItemId(itemType: string, itemSyncId: string | null): number | null {
  if (itemType === 'check_in') return 0
  const parentTable = DISMISSAL_PARENT_TABLES[itemType]
  if (!parentTable || !itemSyncId) return null
  const row = getDb().prepare(`SELECT id FROM ${parentTable} WHERE sync_id = ?`).get(itemSyncId) as
    | { id: number }
    | undefined
  return row?.id ?? null
}

interface DismissalRow {
  id: number
  item_type: string
  item_id: number
  item_sync_id: string | null
  due_date: string
  status: string
  created_at: string
  updated_at: string | null
  deleted: number
}

const DISMISSAL_TYPE = 'upcoming_dismissal'

// Composite, deterministic — not a random id — so two devices dismissing "the same"
// reminder independently (same item, same due date) before ever syncing converge on
// one record instead of creating two. Needs item_sync_id resolved first, which is
// exactly why this table can't go through the generic mechanism above.
function dismissalSyncId(itemType: string, itemSyncId: string | null, dueDate: string): string {
  return `${itemType}:${itemSyncId ?? ''}:${dueDate}`
}

async function pushUpcomingDismissals(dataKey: Buffer, token: string): Promise<void> {
  const db = getDb()
  // Backfill item_sync_id for any row that doesn't have one yet (new locally, or its
  // parent record didn't have a sync_id at the time it was first dismissed).
  const rows = db.prepare('SELECT * FROM upcoming_dismissals').all() as DismissalRow[]
  for (const row of rows) {
    if (row.item_sync_id) continue
    const resolved = resolveItemSyncId(row.item_type, row.item_id)
    if (resolved) {
      db.prepare('UPDATE upcoming_dismissals SET item_sync_id = ? WHERE id = ?').run(resolved, row.id)
      row.item_sync_id = resolved
    }
  }

  // check_in has no parent row to resolve, so it's never blocked on item_sync_id —
  // every other type needs one before it can be pushed as a portable record.
  const items: SyncPushItem[] = rows
    .filter((row) => row.item_type === 'check_in' || row.item_sync_id)
    .map((row) => {
      const payload = {
        item_type: row.item_type,
        item_sync_id: row.item_sync_id,
        due_date: row.due_date,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted: row.deleted
      }
      const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8')
      return {
        id: dismissalSyncId(row.item_type, row.item_sync_id, row.due_date),
        type: DISMISSAL_TYPE,
        ciphertext: encrypt(plaintext, dataKey).toString('base64'),
        updatedAt: row.updated_at ?? row.created_at,
        deleted: Boolean(row.deleted)
      }
    })

  if (items.length === 0) return
  await apiRequest('/api/sync/push', { method: 'POST', body: { items }, token })
}

async function pullUpcomingDismissals(dataKey: Buffer, token: string): Promise<void> {
  const db = getDb()
  let cursor = getCursor(DISMISSAL_TYPE)
  for (;;) {
    const page = await apiRequest<{ items: SyncPullItem[]; cursor: string; hasMore: boolean }>(
      `/api/sync/pull?since=${encodeURIComponent(cursor)}`,
      { token }
    )
    for (const item of page.items) {
      if (item.type !== DISMISSAL_TYPE) continue
      const plaintext = decrypt(Buffer.from(item.ciphertext, 'base64'), dataKey)
      const payload = JSON.parse(Buffer.from(plaintext).toString('utf-8')) as {
        item_type: string
        item_sync_id: string | null
        due_date: string
        status: string
        updated_at: string | null
        deleted: boolean
      }

      const localItemId = resolveLocalItemId(payload.item_type, payload.item_sync_id)
      if (localItemId === null) continue // parent record hasn't arrived locally yet — retried next sync

      db.prepare(
        `INSERT INTO upcoming_dismissals (item_type, item_id, item_sync_id, due_date, status, created_at, updated_at, deleted)
         VALUES (@item_type, @item_id, @item_sync_id, @due_date, @status, @created_at, @updated_at, @deleted)
         ON CONFLICT(item_type, item_id, due_date) DO UPDATE SET
           status = excluded.status, item_sync_id = excluded.item_sync_id, updated_at = excluded.updated_at,
           deleted = excluded.deleted`
      ).run({
        item_type: payload.item_type,
        item_id: localItemId,
        item_sync_id: payload.item_sync_id,
        due_date: payload.due_date,
        status: payload.status,
        created_at: payload.updated_at ?? new Date().toISOString(),
        updated_at: payload.updated_at,
        deleted: payload.deleted ? 1 : 0
      })
    }
    cursor = page.cursor
    setCursor(DISMISSAL_TYPE, cursor)
    if (!page.hasMore) break
  }
}

interface ValueHistoryRow {
  id: number
  account_id: number
  value: number
  recorded_at: string
  source: string
  invested_value: number | null
  quantity: number | null
  sync_id: string | null
  updated_at: string | null
  deleted: number
}

const VALUE_HISTORY_TYPE = 'value_history'

function resolveAccountSyncId(accountId: number): string | null {
  const row = getDb().prepare('SELECT sync_id FROM accounts WHERE id = ?').get(accountId) as
    | { sync_id: string | null }
    | undefined
  return row?.sync_id ?? null
}

function resolveLocalAccountId(accountSyncId: string | null): number | null {
  if (!accountSyncId) return null
  const row = getDb().prepare('SELECT id FROM accounts WHERE sync_id = ?').get(accountSyncId) as
    | { id: number }
    | undefined
  return row?.id ?? null
}

// account_id is a local autoincrement id, meaningless on a second device — resolved
// here to the portable accounts.sync_id instead, same treatment as item_sync_id
// above for upcoming_dismissals. Rows already pushed under the old generic
// mechanism (pre-fix) have the sender's raw account_id baked into their ciphertext
// instead of an account_sync_id — those can't be retroactively repaired (the
// server never sees plaintext); only history pushed from here on syncs correctly.
async function pushValueHistory(dataKey: Buffer, token: string): Promise<void> {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM value_history').all() as ValueHistoryRow[]

  const items: SyncPushItem[] = rows
    .filter((row) => row.sync_id) // rows not yet backfilled on this run — picked up next sync
    .flatMap((row) => {
      const accountSyncId = resolveAccountSyncId(row.account_id)
      if (!accountSyncId) return [] // parent account has no sync_id yet — retried next sync
      const payload = {
        account_sync_id: accountSyncId,
        value: row.value,
        recorded_at: row.recorded_at,
        source: row.source,
        invested_value: row.invested_value,
        quantity: row.quantity,
        deleted: row.deleted
      }
      const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8')
      return [
        {
          id: row.sync_id as string,
          type: VALUE_HISTORY_TYPE,
          ciphertext: encrypt(plaintext, dataKey).toString('base64'),
          updatedAt: row.updated_at ?? row.recorded_at,
          deleted: Boolean(row.deleted)
        }
      ]
    })

  if (items.length === 0) return

  const BATCH_SIZE = 500
  const batches: SyncPushItem[][] = []
  for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE))
  await batches.reduce<Promise<void>>(
    (chain, batch) =>
      chain.then(() => apiRequest('/api/sync/push', { method: 'POST', body: { items: batch }, token }).then(() => {})),
    Promise.resolve()
  )
}

async function pullValueHistory(dataKey: Buffer, token: string): Promise<void> {
  const db = getDb()
  const touchedAccountIds = new Set<number>()
  let cursor = getCursor(VALUE_HISTORY_TYPE)
  for (;;) {
    const page = await apiRequest<{ items: SyncPullItem[]; cursor: string; hasMore: boolean }>(
      `/api/sync/pull?since=${encodeURIComponent(cursor)}`,
      { token }
    )
    for (const item of page.items) {
      if (item.type !== VALUE_HISTORY_TYPE) continue
      const plaintext = decrypt(Buffer.from(item.ciphertext, 'base64'), dataKey)
      const payload = JSON.parse(Buffer.from(plaintext).toString('utf-8')) as {
        account_sync_id: string
        value: number
        recorded_at: string
        source: string
        invested_value: number | null
        quantity: number | null
        deleted: number | boolean
      }

      const localAccountId = resolveLocalAccountId(payload.account_sync_id)
      if (localAccountId === null) continue // parent account hasn't arrived locally yet — retried next sync

      db.prepare(
        `INSERT INTO value_history (account_id, value, recorded_at, source, invested_value, quantity, sync_id, updated_at, deleted)
         VALUES (@account_id, @value, @recorded_at, @source, @invested_value, @quantity, @sync_id, @updated_at, @deleted)
         ON CONFLICT(sync_id) DO UPDATE SET
           account_id = excluded.account_id, value = excluded.value, recorded_at = excluded.recorded_at,
           source = excluded.source, invested_value = excluded.invested_value, quantity = excluded.quantity,
           updated_at = excluded.updated_at, deleted = excluded.deleted`
      ).run({
        account_id: localAccountId,
        value: payload.value,
        recorded_at: payload.recorded_at,
        source: payload.source,
        invested_value: payload.invested_value,
        quantity: payload.quantity,
        sync_id: item.id,
        updated_at: item.updatedAt,
        deleted: payload.deleted ? 1 : 0
      })
      touchedAccountIds.add(localAccountId)
    }
    cursor = page.cursor
    setCursor(VALUE_HISTORY_TYPE, cursor)
    if (!page.hasMore) break
  }

  // A pulled check-in should affect this account's current_value the same way a
  // local one does (see accounts.ts's checkInValue, which calls this after every
  // local write) — otherwise net worth silently ignores check-ins made elsewhere
  // until something else happens to touch the account.
  for (const accountId of touchedAccountIds) {
    recomputeCurrentValueFromHistory(accountId)
  }
  if (touchedAccountIds.size > 0) recordSnapshot()
}

// Tables whose rows can carry an attached document (src/main/fileStore.ts's
// storeDocument), each uploaded best-effort at the point the document was added —
// see that module's doc comment. A row's document_path can land here via the
// generic table sync above (pulled from another device) or already have existed
// locally before this device was ever signed into cloud sync, in both cases with
// no guarantee the actual file bytes made it to blob storage. This backfill gives
// every such file this device holds locally another chance to upload each sync,
// using sync_meta (local-only, never synced itself) to remember one already
// confirmed uploaded so it isn't re-sent every time.
const DOCUMENT_TABLES = ['accounts', 'insurance_policies', 'identity_documents']

async function backfillDocumentUploads(): Promise<void> {
  const db = getDb()
  for (const table of DOCUMENT_TABLES) {
    const rows = db
      .prepare(`SELECT DISTINCT document_path FROM ${table} WHERE document_path IS NOT NULL AND deleted = 0`)
      .all() as { document_path: string }[]
    for (const { document_path: documentPath } of rows) {
      const metaKey = `uploaded_doc_${documentPath}`
      const already = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(metaKey)
      if (already) continue
      const uploaded = await backfillUpload(documentPath)
      if (uploaded) {
        db.prepare(
          'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        ).run(metaKey, '1')
      }
    }
  }
}

/** Pulls remote changes, then pushes local ones, for every table in SYNCABLE_TABLES,
 * then does the same for value_history and upcoming_dismissals via their own
 * dedicated logic (both need accounts — and for dismissals, their other parent
 * tables too — to have already landed locally this same sync). Call after unlock
 * and periodically — see scheduler.ts for the existing pattern used by reminder
 * checks. No-ops quietly if not signed in (see syncStatus()). */
export async function syncNow(): Promise<void> {
  const token = sessionToken()
  const dataKey = cachedDataKey()
  if (!token || !dataKey) return

  for (const table of SYNCABLE_TABLES) {
    await pullTable(table, dataKey, token)
    await pushTable(table, dataKey, token)
  }

  await pullValueHistory(dataKey, token)
  await pushValueHistory(dataKey, token)

  await pullUpcomingDismissals(dataKey, token)
  await pushUpcomingDismissals(dataKey, token)

  await backfillDocumentUploads()
}
