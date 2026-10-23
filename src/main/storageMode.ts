import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// Whether this install ever asked "local only, or cloud sync?" — a plain file, not
// inside the encrypted DB, since it has to be readable before a master password even
// exists (it's what decides whether to nudge the user toward Cloud Sync right after
// setup). Not sensitive: it's a UX preference, not a secret.
export type StorageMode = 'local' | 'cloud'

function filePath(): string {
  return join(app.getPath('userData'), 'storage-mode.json')
}

export function getStorageMode(): StorageMode | null {
  const path = filePath()
  if (!existsSync(path)) return null
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as { mode?: string }
    return data.mode === 'cloud' || data.mode === 'local' ? data.mode : null
  } catch {
    return null
  }
}

export function setStorageMode(mode: StorageMode): void {
  const path = filePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ mode }), { mode: 0o600 })
}
