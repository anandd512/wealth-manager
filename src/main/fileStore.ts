import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join, extname, basename, isAbsolute } from 'path'
import { randomUUID } from 'crypto'
import { encrypt, decrypt, getCurrentKey } from './db'
import { apiRequest } from './backendApi'
import { getSecret } from './secrets'

// Uploaded documents (insurance policies, ID scans) are encrypted at rest with the
// same master-password-derived key as the database, using the same AES-256-GCM
// envelope. They're decrypted to a temp file only when the user asks to view one,
// and that temp copy is cleaned up when the app locks or quits.
//
// Cross-device: the already-encrypted bytes are also uploaded to the `files` blob
// container (see lib/blobStorage.ts on the backend) under this same filename as the
// blob key, so another device can fetch them lazily on first view — see
// ensureDocumentAvailableLocally. Upload is best-effort: a failed upload leaves the
// document fully usable on this device, just not yet available elsewhere. Unlike
// synced data records, there's no dirty-flag retry queue for this yet — a failed
// upload isn't retried until the document is saved again.

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

async function uploadDocumentBytes(key: string, encrypted: Buffer): Promise<boolean> {
  const token = getSecret('syncToken')
  if (!token) return false // not signed into cloud sync — stays local-only, same as before this feature existed
  try {
    await apiRequest('/api/files/upload', { method: 'POST', body: { key, data: encrypted.toString('base64') }, token })
    return true
  } catch {
    // Best-effort — see module doc. backfillUpload below is what gives a failed/skipped
    // upload a second chance, so the caller finding out here isn't the only recovery path.
    return false
  }
}

// Fetches a document's bytes from the cloud if a pulled record references one this
// device hasn't uploaded/downloaded before. No-ops for anything already local, and
// for the legacy absolute-path form (which predates sync and was never uploaded).
export async function ensureDocumentAvailableLocally(storedPath: string): Promise<void> {
  if (isAbsolute(storedPath)) return
  const resolved = resolveDocumentPath(storedPath)
  if (existsSync(resolved)) return
  const token = getSecret('syncToken')
  if (!token) throw new Error('This document was uploaded on another device and cloud sync is not connected here')
  const result = await apiRequest<{ data: string }>(`/api/files/download?key=${encodeURIComponent(storedPath)}`, { token })
  writeFileSync(resolved, Buffer.from(result.data, 'base64'), { mode: 0o600 })
}

export async function storeDocument(sourcePath: string): Promise<{ storedPath: string; originalName: string }> {
  const originalExt = extname(sourcePath)
  const plaintext = readFileSync(sourcePath)
  const encrypted = encrypt(new Uint8Array(plaintext), getCurrentKey())
  // The extension is kept (unencrypted, in the filename) only so the temp file we
  // decrypt to for viewing opens in the right default app; the content itself is
  // fully encrypted.
  const storedName = `${randomUUID()}${originalExt}.enc`
  writeFileSync(join(documentsDir(), storedName), encrypted, { mode: 0o600 })
  await uploadDocumentBytes(storedName, encrypted)
  return { storedPath: storedName, originalName: basename(sourcePath) }
}

// Re-attempts the upload for a document this device holds locally — covers records
// whose original upload was skipped (not signed into cloud sync yet) or silently
// failed (best-effort, no retry queue at the time). Safe to call repeatedly: a
// re-upload just overwrites the same blob key. Returns false (nothing to do) for
// legacy absolute-path records, records with no local file, or when sync isn't
// connected — callers use that to decide whether to remember this one succeeded.
export async function backfillUpload(storedPath: string): Promise<boolean> {
  if (isAbsolute(storedPath)) return false
  const resolved = resolveDocumentPath(storedPath)
  if (!existsSync(resolved)) return false
  const token = getSecret('syncToken')
  if (!token) return false
  const encrypted = readFileSync(resolved)
  return uploadDocumentBytes(storedPath, encrypted)
}

export async function openDocumentForViewing(storedPath: string): Promise<string> {
  await ensureDocumentAvailableLocally(storedPath)
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
