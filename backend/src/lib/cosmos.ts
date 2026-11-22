import { Container, CosmosClient, Database } from '@azure/cosmos'

// The server only ever stores ciphertext (see sync items container) plus non-secret
// account metadata (see users container) — never a plaintext key or financial data.
// Connection string is injected via a Key Vault reference in the Function App's app
// settings; see infra/main.bicep.
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

export function deviceLinksContainer(): Container {
  return getDatabase().container('deviceLinks')
}

export type IdentityProvider = 'email' | 'google' | 'microsoft'

/** One way of signing in to an account. `subject` is the provider's stable user id
 * (Google/Microsoft `sub`), or the normalized address itself for 'email'. */
export interface UserIdentity {
  provider: IdentityProvider
  subject: string
  email: string | null // as reported by the provider — display only unless it was verified
}

export interface UserDoc {
  id: string // userId (uuid), also the partition key for this container

  // Only ever set from a *verified* address (email code, Google `email_verified`,
  // Microsoft consumer accounts / `xms_edov`). Account linking matches on this, so an
  // unverified provider claim must never land here — see lib/users.ts.
  email: string | null

  // Every sign-in method attached to this account. Absent on accounts created before
  // passwordless sign-in existed; lib/users.ts adds the 'email' identity the first
  // time such an account signs in with an emailed code.
  identities?: UserIdentity[]

  // ── Zero-knowledge key material (passwordless accounts) ──────────────────────
  // The Data Key that encrypts every synced record is generated on a device and never
  // sent here. What IS stored:
  //   recoveryWrappedKey — the Data Key sealed (AES-256-GCM) under a key derived from
  //     the user's Recovery Key, which only the user has. Useless without it.
  //   keyProofHash — sha256(HKDF(DataKey, 'artha-key-proof')), hex. Lets a device
  //     prove it holds the Data Key (by sending the HKDF output, which the server
  //     hashes and compares) before it may approve a new device or replace the
  //     recovery wrap — without the server ever learning the Data Key itself.
  recoveryWrappedKey?: string
  keyProofHash?: string

  // ── Legacy password accounts (pre-passwordless) ──────────────────────────────
  // Present only until the account is converted — keys/migrate removes them. The Data
  // Key of a converted account stays the one this password derived, so nothing synced
  // needs re-encrypting.
  kdfAlgorithm?: 'scrypt'
  kdfSalt?: string // base64, non-secret
  kdfParams?: { N: number; r: number; p: number }
  authVerifierSalt?: string // base64
  authVerifier?: string // base64 — server-side hash of the client-derived authKey

  createdAt: string
}

export interface VerificationDoc {
  id: string // `${purpose}:${email}` — also the partition key for this container
  code: string // 6-digit numeric OTP, sent to this email
  attempts: number // wrong guesses so far; the code is burned after MAX_ATTEMPTS (lib/otp.ts)
  createdAt: string
  // Cosmos TTL (seconds from this item's last write) — the container has
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

/** A new device asking an already-signed-in device for the Data Key. The new device
 * posts an X25519 public key; an existing device that holds the Data Key seals it to
 * that public key (ECDH with its own ephemeral key → HKDF → AES-256-GCM) and posts the
 * result back. The server relays opaque bytes only. */
export interface DeviceLinkDoc {
  id: string
  userId: string // partition key
  publicKey: string // base64, raw 32-byte X25519 public key of the requesting device
  deviceName: string
  status: 'pending' | 'approved'
  ephemeralPublicKey?: string // base64, set on approval
  wrappedKey?: string // base64 AEAD envelope of the Data Key, set on approval
  createdAt: string
  ttl: number
}
