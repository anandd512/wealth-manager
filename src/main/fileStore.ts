import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join, extname, basename, isAbsolute } from 'path'
import { randomUUID } from 'crypto'
import { encrypt, decrypt, getCurrentKey } from './db'

// Uploaded documents (insurance policies, ID scans) are encrypted at rest with the
// same master-password-derived key as the database, using the same AES-256-GCM
// envelope. They're decrypted to a temp file only when the user asks to view one,
// and that temp copy is cleaned up when the app locks or quits.

export function documentsDir(): string {
  const dir = join(app.getPath('userData'), 'documents')
  mkdirSync(dir, { recursive: true })
  return dir
}

function tempViewDir(): string {
  const dir = join(app.getPath('temp'), 'artha-view')
  mkdirSync(dir, { recursive: true })
  return dir
}

const openedTempFiles = new Set<string>()

// document_path values are stored relative to documentsDir() (just the filename) so the
// database never bakes in a machine-specific absolute path — that's what makes restoring
// a backup onto a different device/user account work. Older records saved before this
// change may still hold a full absolute path, so both forms are resolved here.
export function resolveDocumentPath(stored: string): string {
  return isAbsolute(stored) ? stored : join(documentsDir(), stored)
}

export function storeDocument(sourcePath: string): { storedPath: string; originalName: string } {
  const originalExt = extname(sourcePath)
  const plaintext = readFileSync(sourcePath)
  const encrypted = encrypt(new Uint8Array(plaintext), getCurrentKey())
  // The extension is kept (unencrypted, in the filename) only so the temp file we
  // decrypt to for viewing opens in the right default app; the content itself is
  // fully encrypted.
  const storedName = `${randomUUID()}${originalExt}.enc`
  writeFileSync(join(documentsDir(), storedName), encrypted, { mode: 0o600 })
  return { storedPath: storedName, originalName: basename(sourcePath) }
}

export function openDocumentForViewing(storedPath: string): string {
  const resolved = resolveDocumentPath(storedPath)
  const encrypted = readFileSync(resolved)
  const plaintext = decrypt(encrypted, getCurrentKey())
  const ext = extname(resolved.replace(/\.enc$/, ''))
  const tempPath = join(tempViewDir(), `${randomUUID()}${ext}`)
  writeFileSync(tempPath, plaintext, { mode: 0o600 })
  openedTempFiles.add(tempPath)
  return tempPath
}

export function cleanupTempViewFiles(): void {
  for (const path of openedTempFiles) {
    try {
      rmSync(path, { force: true })
    } catch {
      // best-effort cleanup
    }
  }
  openedTempFiles.clear()
}

