import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// `authKey` arrives already derived client-side via Argon2id from the master password
// (see the Electron/iOS crypto module once built) — the server never sees the password
// or the data-encryption key, only this auth-proof value. It's still hashed again here,
// with a server-only salt, so a Cosmos data breach alone doesn't hand an attacker a
// replayable login credential. Mirrors the verifier pattern in src/main/auth.ts.
const SCRYPT_MAXMEM = 64 * 1024 * 1024

export interface StoredVerifier {
  authVerifierSalt: string
  authVerifier: string
}

export function createVerifier(authKeyBase64: string): StoredVerifier {
  const salt = randomBytes(16)
  const verifier = scryptSync(authKeyBase64, salt, 32, { N: 1 << 14, r: 8, p: 1, maxmem: SCRYPT_MAXMEM })
  return { authVerifierSalt: salt.toString('base64'), authVerifier: verifier.toString('base64') }
}

export function checkVerifier(authKeyBase64: string, stored: StoredVerifier): boolean {
  const salt = Buffer.from(stored.authVerifierSalt, 'base64')
  const check = scryptSync(authKeyBase64, salt, 32, { N: 1 << 14, r: 8, p: 1, maxmem: SCRYPT_MAXMEM })
  const expected = Buffer.from(stored.authVerifier, 'base64')
  if (check.length !== expected.length) return false
  return timingSafeEqual(check, expected)
}
