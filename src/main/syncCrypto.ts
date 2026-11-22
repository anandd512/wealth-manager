import { hkdfSync } from 'crypto'

// Only used to convert cloud accounts created before passwordless sign-in (see
// cloudAccount.ts convertLegacyAccount). Those accounts derived their keys from a
// password: scrypt (auth.ts deriveKey) → this HKDF split, matching the mobile app's
// cryptoBox.ts deriveKeys exactly:
//   - authKey: proves the old password to the backend, one last time (keys/migrate)
//   - dataKey: the account's Data Key — kept as-is, so nothing synced re-encrypts
export interface SyncKeys {
  authKey: Buffer
  dataKey: Buffer
}

export function deriveSyncKeys(masterKey: Buffer): SyncKeys {
  const authKey = Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), 'artha-auth-key', 32))
  const dataKey = Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), 'artha-data-key', 32))
  return { authKey, dataKey }
}
