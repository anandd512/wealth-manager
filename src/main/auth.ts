import { app } from 'electron'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

interface AuthFile {
  salt: string
  verifier: string
}

function authFilePath(): string {
  return join(app.getPath('userData'), 'auth.json')
}

// scrypt's memory use is ~128*N*r bytes; N=2^15,r=8 needs ~32MiB, right at (or just
// over, with OpenSSL's internal overhead) Node's default 32MiB scryptSync cap, which
// throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS. Raise maxmem explicitly on every call here.
const SCRYPT_MAXMEM = 64 * 1024 * 1024

function deriveKey(password: string, saltHex: string): Buffer {
  const salt = Buffer.from(saltHex, 'hex')
  // 32-byte key, used directly as the AES-256-GCM key for the encrypted database file.
  return scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: SCRYPT_MAXMEM })
}

export function isInitialized(): boolean {
  return existsSync(authFilePath())
}

// Exposed for the backup/restore feature — the master-password salt+verifier must travel
// with the database, or a restored wealth.db.enc has no way to re-derive its decryption key.
export function getAuthFilePath(): string {
  return authFilePath()
}

export function setupMasterPassword(password: string): Buffer {
  const salt = randomBytes(16)
  const key = deriveKey(password, salt.toString('hex'))
  const verifier = scryptSync(key, salt, 32, {
    N: 1 << 14,
    r: 8,
    p: 1,
    maxmem: SCRYPT_MAXMEM
  }).toString('hex')
  const data: AuthFile = { salt: salt.toString('hex'), verifier }
  const path = authFilePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data), { mode: 0o600 })
  return key
}

export function verifyMasterPassword(password: string): Buffer | null {
  const path = authFilePath()
  if (!existsSync(path)) return null
  const data: AuthFile = JSON.parse(readFileSync(path, 'utf-8'))
  const key = deriveKey(password, data.salt)
  const check = scryptSync(key, Buffer.from(data.salt, 'hex'), 32, {
    N: 1 << 14,
    r: 8,
    p: 1,
    maxmem: SCRYPT_MAXMEM
  }).toString('hex')
  const a = Buffer.from(check)
  const b = Buffer.from(data.verifier)
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? key : null
}

export function rotateMasterPassword(newPassword: string): Buffer {
  const salt = randomBytes(16)
  const key = deriveKey(newPassword, salt.toString('hex'))
  const verifier = scryptSync(key, salt, 32, {
    N: 1 << 14,
    r: 8,
    p: 1,
    maxmem: SCRYPT_MAXMEM
  }).toString('hex')
  const data: AuthFile = { salt: salt.toString('hex'), verifier }
  writeFileSync(authFilePath(), JSON.stringify(data), { mode: 0o600 })
  return key
}
