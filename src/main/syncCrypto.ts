import { hkdfSync } from 'crypto'

// Splits the existing master-password-derived key (see auth.ts's deriveKey — the
// same key already used to encrypt the whole local DB file) into two independent
// subkeys via HKDF, matching the mobile app's src/crypto/cryptoBox.ts exactly so a
// password typed on either device derives identical keys:
//   - authKey: sent to the backend at register/login (see sync.ts). Proves knowledge
//     of the password without revealing anything that could decrypt data.
//   - dataKey: stays on this device, encrypts every record pushed to the cloud.
// The whole-DB file encryption keeps using the raw master key directly, unchanged —
// this split only applies to the cloud-sync envelope.
export interface SyncKeys {
  authKey: Buffer
  dataKey: Buffer
}

export function deriveSyncKeys(masterKey: Buffer): SyncKeys {
  const authKey = Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), 'artha-auth-key', 32))
  const dataKey = Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), 'artha-data-key', 32))
  return { authKey, dataKey }
}
