import { scryptAsync } from '@noble/hashes/scrypt.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { gcm } from '@noble/ciphers/aes.js'
import * as ExpoCrypto from 'expo-crypto'
import { Buffer } from '@craftzdog/react-native-buffer'

/**
 * Zero-knowledge crypto core for the mobile app — deliberately mirrors
 * src/main/auth.ts and src/main/db.ts in the Electron app almost line-for-line.
 *
 * Pure JavaScript/TypeScript (@noble/hashes, @noble/ciphers) rather than a native
 * module on purpose: this app runs in plain Expo Go (free, no Apple Developer
 * Program, no custom build), which can only load Expo's own bundled native modules
 * — not arbitrary ones like the native-binding libraries this used before. Standard,
 * deterministic algorithms (scrypt, HKDF-SHA256, AES-256-GCM) produce byte-identical
 * output regardless of implementation, which was verified directly against Node's
 * `crypto` module (what Electron's auth.ts/db.ts and the backend actually run) before
 * this was written — the KDF and the record-encryption envelope stay byte-identical
 * across Electron, this app, and the backend either way.
 *
 * Key derivation: scrypt (same N/r/p as auth.ts) turns the master password + a
 * per-account salt into a 32-byte Master Key, which HKDF then splits into an
 * Auth Key (sent to the backend at register/login — see backend/src/lib/verifier.ts)
 * and a Data Key (stays on-device only, encrypts every synced record). The
 * password and the Data Key never leave the device.
 */

export interface DerivedKeys {
  authKey: Buffer
  dataKey: Buffer
}

export function generateSaltHex(): string {
  return Buffer.from(ExpoCrypto.getRandomBytes(16)).toString('hex')
}

// Intentionally slow (RFC 7914-style cost parameters, matching auth.ts) to make
// password guessing expensive. scryptAsync yields back to the JS event loop
// periodically (asyncTick) rather than blocking it solid, unlike a naive sync scrypt.
export async function deriveKeys(password: string, saltHex: string): Promise<DerivedKeys> {
  const salt = Buffer.from(saltHex, 'hex')
  const masterKey = await scryptAsync(password, salt, { N: 1 << 15, r: 8, p: 1, dkLen: 32 })

  const authKey = hkdf(sha256, masterKey, new Uint8Array(0), new TextEncoder().encode('artha-auth-key'), 32)
  const dataKey = hkdf(sha256, masterKey, new Uint8Array(0), new TextEncoder().encode('artha-data-key'), 32)

  return { authKey: Buffer.from(authKey), dataKey: Buffer.from(dataKey) }
}

/** Encrypts one record's JSON payload. Output: base64(iv(12) || authTag(16) || ciphertext).
 * @noble/ciphers' gcm().encrypt() returns `ciphertext || tag` concatenated — reordered
 * here to iv-then-tag-then-ciphertext to match the envelope Electron's db.ts and the
 * backend already use (verified byte-for-byte against Node's own aes-256-gcm). */
export function encryptRecord(plaintext: Buffer, dataKey: Buffer): string {
  const iv = Buffer.from(ExpoCrypto.getRandomBytes(12))
  const sealed = gcm(dataKey, iv).encrypt(plaintext)
  const ciphertext = sealed.subarray(0, sealed.length - 16)
  const authTag = sealed.subarray(sealed.length - 16)
  return Buffer.concat([iv, Buffer.from(authTag), Buffer.from(ciphertext)]).toString('base64')
}

/** Decrypts a record produced by this function, the Electron app's `encrypt()` in
 * db.ts, or the backend — same envelope, same algorithm, different implementations. */
export function decryptRecord(blobBase64: string, dataKey: Buffer): Buffer {
  const blob = Buffer.from(blobBase64, 'base64')
  if (blob.length <= 28) throw new Error('Ciphertext too short')
  const iv = blob.subarray(0, 12)
  const authTag = blob.subarray(12, 28)
  const ciphertext = blob.subarray(28)
  const sealed = Buffer.concat([ciphertext, authTag])
  const plaintext = gcm(dataKey, iv).decrypt(sealed)
  return Buffer.from(plaintext)
}
