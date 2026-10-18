import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, renameSync, rmSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { getAuthFilePath } from '../auth'
import { getDbFilePath, flushDatabase } from '../db'
import { getSecretsFilePath, reimportSecrets } from '../secrets'
import { documentsDir } from '../fileStore'

// A full backup bundles everything needed to restore this installation on another
// device: the master-password salt/verifier (auth.json — without it a restored
// wealth.db.enc has no way to re-derive its own decryption key), the encrypted
// database itself, every encrypted uploaded document, and (best-effort — see
// secrets.ts) the OS-keychain-wrapped API keys/SMTP password. Nothing here is
// decrypted or re-encrypted in a new scheme; the already-encrypted bytes are simply
// concatenated behind a small manifest, so restoring just puts the same files back
// and unlocks exactly like the original install, with the same master password.
const MAGIC = 'WMBK1'

interface ManifestEntry {
  name: string
  size: number
}

interface BackupManifest {
  version: 1
  exportedAt: string
  auth: ManifestEntry
  db: ManifestEntry
  secrets: ManifestEntry | null
  documents: ManifestEntry[]
}

function uint32LE(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n, 0)
  return b
}

export function exportBackup(destPath: string): { documentCount: number; sizeBytes: number } {
  flushDatabase()

  const authBytes = readFileSync(getAuthFilePath())
  const dbBytes = readFileSync(getDbFilePath())

  const secretsPath = getSecretsFilePath()
  const secretsBytes = existsSync(secretsPath) ? readFileSync(secretsPath) : null

  const docsDir = documentsDir()
  const docNames = readdirSync(docsDir).filter((f) => statSync(join(docsDir, f)).isFile())
  const docBuffers = docNames.map((f) => readFileSync(join(docsDir, f)))

  const manifest: BackupManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    auth: { name: 'auth.json', size: authBytes.length },
    db: { name: 'wealth.db.enc', size: dbBytes.length },
    secrets: secretsBytes ? { name: 'secrets.json', size: secretsBytes.length } : null,
    documents: docNames.map((name, i) => ({ name, size: docBuffers[i].length }))
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf-8')

  const parts: Buffer[] = [Buffer.from(MAGIC, 'ascii'), uint32LE(manifestBytes.length), manifestBytes, authBytes, dbBytes]
  if (secretsBytes) parts.push(secretsBytes)
  parts.push(...docBuffers)

  const out = Buffer.concat(parts)
  writeFileSync(destPath, out, { mode: 0o600 })
  return { documentCount: docNames.length, sizeBytes: out.length }
}

function parseBackup(sourcePath: string): {
  manifest: BackupManifest
  auth: Buffer
  db: Buffer
  secrets: Buffer | null
  documents: { name: string; data: Buffer }[]
} {
  const buf = readFileSync(sourcePath)
  if (buf.subarray(0, MAGIC.length).toString('ascii') !== MAGIC) {
    throw new Error('This file is not an Artha backup.')
  }
  let offset = MAGIC.length
  const manifestLen = buf.readUInt32LE(offset)
  offset += 4
  const manifest: BackupManifest = JSON.parse(buf.subarray(offset, offset + manifestLen).toString('utf-8'))
  offset += manifestLen

  const auth = buf.subarray(offset, offset + manifest.auth.size)
  offset += manifest.auth.size
  const db = buf.subarray(offset, offset + manifest.db.size)
  offset += manifest.db.size

  let secrets: Buffer | null = null
  if (manifest.secrets) {
    secrets = buf.subarray(offset, offset + manifest.secrets.size)
    offset += manifest.secrets.size
  }

  const documents: { name: string; data: Buffer }[] = []
  for (const doc of manifest.documents) {
    documents.push({ name: doc.name, data: buf.subarray(offset, offset + doc.size) })
    offset += doc.size
  }

  return { manifest, auth, db, secrets, documents }
}

export function readBackupSummary(
  sourcePath: string
): { exportedAt: string; documentCount: number; hasSecrets: boolean } {
  const { manifest } = parseBackup(sourcePath)
  return {
    exportedAt: manifest.exportedAt,
    documentCount: manifest.documents.length,
    hasSecrets: manifest.secrets != null
  }
}

function moveAside(path: string, stamp: number): void {
  if (existsSync(path)) renameSync(path, `${path}.bak-${stamp}`)
}

// Does not touch the live app session — the caller (ipc.ts) is responsible for making
// sure the database is locked/closed first, and relaunching the app afterward, so a
// stale in-memory handle never persists over the files this just wrote.
export function importBackup(sourcePath: string): { documentCount: number } {
  const { auth, db, secrets, documents } = parseBackup(sourcePath)

  const authPath = getAuthFilePath()
  const dbPath = getDbFilePath()
  const secretsPath = getSecretsFilePath()
  const docsDir = documentsDir()

  const stamp = Date.now()
  moveAside(authPath, stamp)
  moveAside(dbPath, stamp)
  moveAside(secretsPath, stamp)
  if (existsSync(docsDir)) renameSync(docsDir, `${docsDir}.bak-${stamp}`)

  mkdirSync(dirname(authPath), { recursive: true })
  writeFileSync(authPath, auth, { mode: 0o600 })
  writeFileSync(dbPath, db, { mode: 0o600 })

  mkdirSync(docsDir, { recursive: true })
  for (const doc of documents) {
    writeFileSync(join(docsDir, doc.name), doc.data, { mode: 0o600 })
  }

  if (secrets) {
    const tempPath = `${secretsPath}.imported`
    writeFileSync(tempPath, secrets, { mode: 0o600 })
    reimportSecrets(tempPath)
    rmSync(tempPath, { force: true })
  }

  return { documentCount: documents.length }
}
