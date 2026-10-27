import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'fs'
import { join, extname, basename, isAbsolute } from 'path'
import { randomUUID } from 'crypto'
import { encrypt, decrypt, getCurrentKey } from './db'
import { apiRequest } from './backendApi'
import { getSecret } from './secrets'

// Local at-rest storage is always encrypted with this device's local master-password
// key (getCurrentKey() — the same key the local SQLite DB uses), so a document stays
// fully usable offline with no dependency on cloud sync ever being set up. That key
// is device-specific — setupMasterPassword() mints a fresh random salt per install,
// so even the same password on two devices derives two different keys — which means
// it can never be the key used for the CLOUD copy: anything uploaded has to be
// decryptable by every device signed into the same sync account, and only the sync
// Data Key (derived from the account's server-issued salt — see syncCrypto.ts, same
// key mobile uses) is shared across devices. Every upload/download here therefore
// re-encrypts across that boundary — local-key bytes in, Data-Key bytes out to the
// cloud, and back again on the way in — via cloudDataKey() below. (An earlier version
// of this file uploaded the local-key-encrypted bytes directly, which any other
// device would fail to decrypt with an "aes:gcm invalid tag" error; sync.ts's
// backfillDocumentUploads re-uploads existing documents under the corrected scheme.)

function cloudDataKey(): Buffer | null {
  const stored = getSecret('syncDataKey')
  return stored ? Buffer.from(stored, 'base64') : null
}

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

// A crash (or a force-quit mid-extraction) skips cleanupTempViewFiles entirely, since
// that only knows about files THIS session opened — any decrypted-document or
// statement-chunk temp file from a previous session that never got cleaned up would
// otherwise sit there indefinitely. Called once at app startup (before anything in
// this session has had a chance to populate them), this sweeps every temp
// directory/file this app has ever created by its 'artha-' prefix, regardless of
// which session made it.
export function clearStaleTempFiles(): void {
  const tempRoot = app.getPath('temp')
  let entries: string[]
  try {
    entries = readdirSync(tempRoot)
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.startsWith('artha-')) continue
    try {
      rmSync(join(tempRoot, entry), { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
}

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
// The downloaded bytes are Data-Key-encrypted (every device uploads under that key —
// see module doc); re-encrypted with this device's own local key before being written
// to the local cache, so the on-disk format is always local-key-encrypted regardless
// of which device originally created the document.
export async function ensureDocumentAvailableLocally(storedPath: string): Promise<void> {
  if (isAbsolute(storedPath)) return
  const resolved = resolveDocumentPath(storedPath)
  if (existsSync(resolved)) return
  const token = getSecret('syncToken')
  const dataKey = cloudDataKey()
  if (!token || !dataKey) throw new Error('This document was uploaded on another device and cloud sync is not connected here')
  const result = await apiRequest<{ data: string }>(`/api/files/download?key=${encodeURIComponent(storedPath)}`, { token })
  const cloudEncrypted = Buffer.from(result.data, 'base64')
  const plaintext = decrypt(cloudEncrypted, dataKey)
  const localEncrypted = encrypt(plaintext, getCurrentKey())
  writeFileSync(resolved, localEncrypted, { mode: 0o600 })
}

export async function storeDocument(sourcePath: string): Promise<{ storedPath: string; originalName: string }> {
  const originalExt = extname(sourcePath)
  const plaintext = readFileSync(sourcePath)
  const localEncrypted = encrypt(new Uint8Array(plaintext), getCurrentKey())
  // The extension is kept (unencrypted, in the filename) only so the temp file we
  // decrypt to for viewing opens in the right default app; the content itself is
  // fully encrypted.
  const storedName = `${randomUUID()}${originalExt}.enc`
  writeFileSync(join(documentsDir(), storedName), localEncrypted, { mode: 0o600 })

  const dataKey = cloudDataKey()
  if (dataKey) {
    const cloudEncrypted = encrypt(new Uint8Array(plaintext), dataKey)
    await uploadDocumentBytes(storedName, cloudEncrypted)
  }

  return { storedPath: storedName, originalName: basename(sourcePath) }
}

// Re-attempts the upload for a document this device holds locally — covers records
// whose original upload was skipped (not signed into cloud sync yet) or silently
// failed (best-effort, no retry queue at the time), and re-uploads any document still
// sitting in the cloud under the old, wrong local-key encryption (see module doc).
// Safe to call repeatedly: a re-upload just overwrites the same blob key. Returns
// false (nothing to do) for legacy absolute-path records, records with no local
// file, or when sync isn't connected — callers use that to decide whether to
// remember this one succeeded.
export async function backfillUpload(storedPath: string): Promise<boolean> {
  if (isAbsolute(storedPath)) return false
  const resolved = resolveDocumentPath(storedPath)
  if (!existsSync(resolved)) return false
  const dataKey = cloudDataKey()
  if (!dataKey) return false
  const localEncrypted = readFileSync(resolved)
  const plaintext = decrypt(localEncrypted, getCurrentKey())
  const cloudEncrypted = encrypt(plaintext, dataKey)
  return uploadDocumentBytes(storedPath, cloudEncrypted)
}

// One-time migration for documents stored before the relative-path convention
// existed (see resolveDocumentPath's comment above) — their document_path is a
// full, machine-specific absolute path, which backfillUpload above deliberately
// skips since it isn't a safe/portable blob key. If the file is still there, this
// relocates its already local-key-encrypted bytes verbatim into documentsDir()
// under a fresh portable key and returns it for the caller to write back into
// whichever row referenced the old absolute path; nothing here touches the
// database directly, keeping this module independent of any one table's schema.
// Upload itself is left to the normal backfillUpload() path once the caller has
// the new relative path. Returns null (nothing to do) if the file is gone —
// nothing to migrate, same as any other un-backfillable record.
export async function migrateLegacyDocument(absolutePath: string): Promise<string | null> {
  if (!isAbsolute(absolutePath) || !existsSync(absolutePath)) return null
  const localEncrypted = readFileSync(absolutePath)
  const ext = extname(absolutePath.replace(/\.enc$/, ''))
  const storedName = `${randomUUID()}${ext}.enc`
  writeFileSync(join(documentsDir(), storedName), localEncrypted, { mode: 0o600 })
  return storedName
}

export async function openDocumentForViewing(storedPath: string): Promise<string> {
  await ensureDocumentAvailableLocally(storedPath)
  const resolved = resolveDocumentPath(storedPath)
  let plaintext: Uint8Array
  try {
    plaintext = decrypt(readFileSync(resolved), getCurrentKey())
  } catch (err) {
    // A cache file written before the local-key/Data-Key fix (see module doc) can be
    // sitting here undecryptable with this device's key — ensureDocumentAvailableLocally
    // above would have skipped re-fetching it since it already "existed". Treat a decrypt
    // failure on a non-legacy (relative-path) cache as exactly that: drop it and fetch a
    // fresh, correctly re-encrypted copy once before giving up.
    if (isAbsolute(storedPath)) throw err
    rmSync(resolved, { force: true })
    await ensureDocumentAvailableLocally(storedPath)
    plaintext = decrypt(readFileSync(resolved), getCurrentKey())
  }
  const ext = extname(resolved.replace(/\.enc$/, ''))
  const tempPath = join(tempViewDir(), `${randomUUID()}${ext}`)
  writeFileSync(tempPath, plaintext, { mode: 0o600 })
  openedTempFiles.add(tempPath)
  return tempPath
}

// Writes an already-decrypted (PDF-password-unlocked) buffer to a temp file that can
// stand in for the original picked path in an extract/store call. Uses a random
// *directory* (rather than renaming the file itself) so the original basename is
// preserved — storeDocument's document_original_name and extraction.ts's mimeTypeFor
// both derive from the final path component, and losing the real filename here would
// silently replace it with a meaningless UUID for every password-protected upload.
export function writeDecryptedPdfToTemp(originalPath: string, bytes: Uint8Array): string {
  const dir = join(tempViewDir(), randomUUID())
  mkdirSync(dir, { recursive: true })
  const tempPath = join(dir, basename(originalPath))
  writeFileSync(tempPath, bytes, { mode: 0o600 })
  openedTempFiles.add(tempPath)
  return tempPath
}

// Removes a stored document's local copy — used when an upload is abandoned (e.g. the
// cash-flow statement review modal is cancelled) so it doesn't sit on disk forever
// never referenced by anything. Local-only: there's no delete endpoint on the sync
// backend (only upload/download — see backend/src/functions/), so a copy already
// uploaded to the cloud before cancellation stays there; best-effort and silent on
// any failure, since this is tidy-up, not a correctness requirement.
export function deleteStoredDocument(storedPath: string): void {
  try {
    rmSync(resolveDocumentPath(storedPath), { force: true })
  } catch {
    // best-effort
  }
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
