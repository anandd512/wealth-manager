import { Directory, File, Paths } from 'expo-file-system'
import { Buffer } from 'buffer'
import * as Crypto from 'expo-crypto'
import { encryptRecord, decryptRecord } from '../crypto/cryptoBox'
import { ArthaApi } from '../api/arthaApi'

/** Mirrors src/main/fileStore.ts on desktop: documents are encrypted locally with
 * the same AES-256-GCM envelope as every other synced record (cryptoBox's
 * encryptRecord/decryptRecord, which already operate on arbitrary bytes — no
 * JSON-specific behavior — so they apply directly to raw file content too), cached
 * under a UUID-based filename, and the already-encrypted bytes are uploaded to the
 * same `files` blob container desktop uploads to (see backend/src/lib/blobStorage.ts),
 * so a document created on either device becomes available on the other. Upload is
 * best-effort, same convention as desktop: a failed upload leaves the document fully
 * usable on this device, just not yet available elsewhere. */

function documentsDir(): Directory {
  const dir = new Directory(Paths.document, 'documents')
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
  return dir
}

function tempViewDir(): Directory {
  const dir = new Directory(Paths.cache, 'artha-view')
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
  return dir
}

async function uploadDocumentBytes(key: string, dataBase64: string, token: string): Promise<boolean> {
  try {
    await ArthaApi.uploadFile(key, dataBase64, token)
    return true
  } catch {
    // Best-effort — see module doc. backfillUpload below is what gives a failed
    // upload a second chance, so the caller finding out here isn't the only recovery path.
    return false
  }
}

/** Fetches a document's bytes from the cloud into the local cache if a pulled
 * record references one this device hasn't uploaded/downloaded before. No-ops if
 * already cached locally. */
export async function ensureDocumentAvailableLocally(storedPath: string, token: string): Promise<void> {
  const file = new File(documentsDir(), storedPath)
  if (file.exists) return
  const result = await ArthaApi.downloadFile(storedPath, token)
  const bytes = Buffer.from(result.data, 'base64')
  file.create({ intermediates: true })
  await file.write(new Uint8Array(bytes))
}

/** True if this device already has the document's (still-encrypted) bytes cached —
 * a cheap local existence check, not a decrypt, so list screens can decide whether
 * to show an inline thumbnail without triggering a network fetch for every row. */
export function isDocumentCachedLocally(storedPath: string): boolean {
  return new File(documentsDir(), storedPath).exists
}

export async function storeDocument(
  picked: { uri: string; name: string },
  dataKey: Buffer,
  token: string
): Promise<{ storedPath: string; originalName: string }> {
  const sourceFile = new File(picked.uri)
  const plaintext = Buffer.from(await sourceFile.bytes())
  const envelopeBase64 = encryptRecord(plaintext, dataKey)
  const envelopeBytes = Buffer.from(envelopeBase64, 'base64')

  const ext = sourceFile.extension || ''
  const storedName = `${Crypto.randomUUID()}${ext}.enc`
  const destFile = new File(documentsDir(), storedName)
  destFile.create({ intermediates: true })
  await destFile.write(new Uint8Array(envelopeBytes))

  await uploadDocumentBytes(storedName, envelopeBase64, token)

  return { storedPath: storedName, originalName: picked.name }
}

// Re-attempts the upload for a document this device holds locally — covers records
// whose original upload failed (best-effort, no retry queue at the time), mirroring
// src/main/sync.ts's dedicated backfillDocumentUploads on desktop. Safe to call
// repeatedly: a re-upload just overwrites the same blob key. Returns false (nothing
// to do) when this device doesn't have the file cached locally.
export async function backfillUpload(storedPath: string, token: string): Promise<boolean> {
  const file = new File(documentsDir(), storedPath)
  if (!file.exists) return false
  const envelopeBase64 = Buffer.from(await file.bytes()).toString('base64')
  return uploadDocumentBytes(storedPath, envelopeBase64, token)
}

/** Decrypts a stored document into a plaintext temp file for viewing (an <Image>
 * source or a PDF viewer/share sheet) and returns its local URI. */
export async function openDocumentForViewing(storedPath: string, dataKey: Buffer, token: string): Promise<string> {
  await ensureDocumentAvailableLocally(storedPath, token)
  const file = new File(documentsDir(), storedPath)
  let plaintext: Uint8Array
  try {
    plaintext = decryptRecord(Buffer.from(await file.bytes()).toString('base64'), dataKey)
  } catch (err) {
    // A cache file downloaded before desktop's local-key/Data-Key encryption fix (see
    // src/main/fileStore.ts) can be sitting here encrypted with the wrong key —
    // ensureDocumentAvailableLocally above would have skipped re-fetching it since it
    // already existed. Drop it and fetch a fresh, correctly re-encrypted copy once
    // before giving up.
    file.delete()
    await ensureDocumentAvailableLocally(storedPath, token)
    plaintext = decryptRecord(Buffer.from(await file.bytes()).toString('base64'), dataKey)
  }

  const ext = storedPath.replace(/\.enc$/, '').match(/\.[^./]+$/)?.[0] ?? ''
  const tempFile = new File(tempViewDir(), `${Crypto.randomUUID()}${ext}`)
  tempFile.create({ intermediates: true })
  await tempFile.write(new Uint8Array(plaintext))
  return tempFile.uri
}
