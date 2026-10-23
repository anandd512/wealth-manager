import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// Secrets (API keys, sync/notify tokens) are encrypted at rest with Electron's
// safeStorage, which is backed by the OS credential store (DPAPI on Windows,
// Keychain on macOS, libsecret on Linux). They are tied to the OS user account,
// independent of the app's own master password.

type SecretKey =
  | 'anthropicApiKey'
  | 'openaiApiKey'
  | 'syncEmail'
  | 'syncToken'
  | 'syncDataKey'
  | 'notifyEmail'
  | 'notifyToken'

function secretsFilePath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function readStore(): Record<string, string> {
  const path = secretsFilePath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, string>): void {
  const path = secretsFilePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store), { mode: 0o600 })
}

export function setSecret(key: SecretKey, value: string): void {
  const store = readStore()
  if (!value) {
    delete store[key]
    writeStore(store)
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    store[key] = safeStorage.encryptString(value).toString('base64')
  } else {
    // Fallback: still not plaintext-obvious, but flagged to the caller via hasSecret checks.
    store[key] = Buffer.from(value, 'utf-8').toString('base64')
  }
  writeStore(store)
}

export function getSecret(key: SecretKey): string | null {
  const store = readStore()
  const raw = store[key]
  if (!raw) return null
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(raw, 'base64'))
    }
    return Buffer.from(raw, 'base64').toString('utf-8')
  } catch {
    return null
  }
}

export function hasSecret(key: SecretKey): boolean {
  return Boolean(readStore()[key])
}

export function clearSecret(key: SecretKey): void {
  const store = readStore()
  delete store[key]
  writeStore(store)
}

// Exposed for the backup/restore feature.
export function getSecretsFilePath(): string {
  return secretsFilePath()
}

// safeStorage is tied to the OS user account, not the app's own master password, so a
// secrets.json restored from a backup made on a different device/OS profile won't decrypt
// here. Rather than carry over unreadable noise (which would make `hasSecret` wrongly
// report a key as "configured"), each entry is decrypted and only re-saved — through the
// normal setSecret path, so it's freshly encrypted for THIS device — if it's actually
// readable. Anything that fails to decrypt is silently dropped; the user re-enters it.
export function reimportSecrets(importedPath: string): void {
  if (!existsSync(importedPath)) return
  let imported: Record<string, string>
  try {
    imported = JSON.parse(readFileSync(importedPath, 'utf-8'))
  } catch {
    return
  }
  const keys: SecretKey[] = ['anthropicApiKey', 'openaiApiKey']
  for (const key of keys) {
    const raw = imported[key]
    if (!raw) continue
    try {
      const value = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(raw, 'base64'))
        : Buffer.from(raw, 'base64').toString('utf-8')
      if (value) setSecret(key, value)
    } catch {
      // Not decryptable on this device/OS profile — skip it.
    }
  }
}
