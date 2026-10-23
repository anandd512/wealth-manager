import { Container, CosmosClient, Database } from '@azure/cosmos'

// The server only ever stores ciphertext (see sync items container) plus the
// non-secret auth verifier (see users container) — never a plaintext key or
// financial data. Connection string is injected via a Key Vault reference in
// the Function App's app settings; see infra/main.bicep.
let client: CosmosClient | null = null
let database: Database | null = null

function getClient(): CosmosClient {
  if (!client) {
    const connectionString = process.env.COSMOS_CONNECTION_STRING
    if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING is not configured')
    client = new CosmosClient(connectionString)
  }
  return client
}

function getDatabase(): Database {
  if (!database) {
    const databaseId = process.env.COSMOS_DATABASE ?? 'artha'
    database = getClient().database(databaseId)
  }
  return database
}

export function usersContainer(): Container {
  return getDatabase().container('users')
}

export function itemsContainer(): Container {
  return getDatabase().container('items')
}

export function verificationsContainer(): Container {
  return getDatabase().container('verifications')
}

export interface UserDoc {
  id: string // userId (uuid), also the partition key for this container
  email: string

  // scrypt — both clients (Electron's src/main/auth.ts and the Expo app's
  // src/crypto/cryptoBox.ts) derive via Node's `crypto` / @noble/hashes, which
  // produce byte-identical output for the same algorithm. This salt/params pair
  // derives the master password's Data Key — set once at registration, and every
  // device must read the same values back before deriving a key, or it'll decrypt
  // nothing synced by another device.
  kdfAlgorithm: 'scrypt'
  kdfSalt: string // base64, non-secret
  kdfParams: { N: number; r: number; p: number }

  authVerifierSalt: string // base64
  authVerifier: string // base64 — server-side hash of the client-derived authKey, never the key itself

  createdAt: string
}

export interface VerificationDoc {
  id: string // the email being verified — also the partition key for this container
  code: string // 6-digit numeric OTP, sent to this email
  createdAt: string
  // Cosmos TTL (seconds from `createdAt`'s write time) — the container has
  // `defaultTtl` enabled (see infra/main.bicep) so an unused/expired code is
  // garbage-collected automatically instead of needing a cleanup job.
  ttl: number
}

export interface ItemDoc {
  id: string // item uuid, stable across edits
  userId: string // partition key
  // 'account' | 'value_history' | 'insurance_policy' | 'identity_document' | 'credit_card' |
  // 'credential_vault' | 'net_worth_snapshot' | 'kv_setting' | 'upcoming_dismissal' — see the
  // Electron client's src/main/sync.ts SYNCABLE_TABLES (and the dedicated
  // push/pullUpcomingDismissals for that last one).
  type: string
  ciphertext: string // base64 of iv(12) || authTag(16) || AES-256-GCM ciphertext of the record's JSON
  updatedAt: string // ISO 8601, client-assigned, used for last-write-wins + incremental pull
  deleted: boolean // tombstone instead of hard delete, so other devices learn about deletions
  createdAt: string
}
