import { Buffer } from 'buffer'
import { Directory, File, Paths } from 'expo-file-system'
import * as DocumentPicker from 'expo-document-picker'
import { encryptRecord, decryptRecord } from '../crypto/cryptoBox'
import { getDb } from '../db/db'

/** Mobile's equivalent of desktop's .wmbackup export/import (src/main/services/
 * backup.ts) — a different file format, not a shared one: desktop's bundles its
 * local-master-password-encrypted DB file and auth.json verbatim, neither of which
 * exist on mobile (there's no separate local master password here — the Data Key
 * IS the only key, and the local SQLite rows are plain JSON, encrypted only at the
 * sync boundary). So this instead dumps every local table's raw rows plus every
 * locally-cached encrypted document as one JSON blob, then wraps the whole thing in
 * the same AES-256-GCM envelope as everything else here (encryptRecord/
 * decryptRecord), keyed to the signed-in account's Data Key — a backup file is
 * therefore only ever restorable by signing into the same account it came from.
 * This is a belt-and-suspenders safety net alongside cloud sync, not a replacement
 * for it (cloud sync is a device's main recovery path; this is a point-in-time copy
 * the user can move around independently of being signed in with connectivity). */

const MAGIC = 'ARTHABK1'

// sync_meta is deliberately excluded — it's local-only pull-cursor bookkeeping, and
// restoring it onto a (possibly different) device would make incremental sync skip
// over changes it hasn't actually seen yet. Omitting it just means the first sync
// after a restore re-pulls everything from the cloud, which is safe and correct.
const TABLES = [
  'accounts',
  'credential_vault',
  'credit_cards',
  'insurance_policies',
  'identity_documents',
  'value_history',
  'net_worth_snapshots',
  'upcoming_dismissals',
  'kv_settings'
]

interface BackupPayload {
  exportedAt: string
  tables: Record<string, Record<string, unknown>[]>
  documents: { name: string; dataBase64: string }[]
}

function documentsDir(): Directory {
  return new Directory(Paths.document, 'documents')
}

function backupFile(): File {
  return new File(Paths.cache, `artha-backup-${Date.now()}.arthabackup`)
}

async function buildPayload(): Promise<BackupPayload> {
  const db = getDb()
  const tables: Record<string, Record<string, unknown>[]> = {}
  for (const table of TABLES) {
    tables[table] = db.getAllSync<Record<string, unknown>>(`SELECT * FROM ${table}`)
  }

  const dir = documentsDir()
  const documents: { name: string; dataBase64: string }[] = []
  if (dir.exists) {
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue
      documents.push({ name: entry.name, dataBase64: Buffer.from(await entry.bytes()).toString('base64') })
    }
  }

  return { exportedAt: new Date().toISOString(), tables, documents }
}

/** Builds the encrypted backup file and returns its local URI, ready to hand to
 * expo-sharing so the user can save or send it. */
export async function exportBackup(dataKey: Buffer): Promise<{ uri: string; documentCount: number }> {
  const payload = await buildPayload()
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8')
  const envelope = encryptRecord(plaintext, dataKey)
  const out = Buffer.concat([Buffer.from(MAGIC, 'ascii'), Buffer.from(envelope, 'utf-8')])

  const file = backupFile()
  file.create({ intermediates: true })
  await file.write(new Uint8Array(out))
  return { uri: file.uri, documentCount: payload.documents.length }
}

async function readAndDecrypt(uri: string, dataKey: Buffer): Promise<BackupPayload> {
  const file = new File(uri)
  const raw = Buffer.from(await file.bytes())
  if (Buffer.from(raw.subarray(0, MAGIC.length)).toString('ascii') !== MAGIC) {
    throw new Error('This file is not an Artha backup.')
  }
  const envelope = Buffer.from(raw.subarray(MAGIC.length)).toString('utf-8')
  let plaintext: Buffer
  try {
    plaintext = decryptRecord(envelope, dataKey)
  } catch {
    throw new Error("Couldn't open this backup — it may be from a different account.")
  }
  return JSON.parse(plaintext.toString('utf-8')) as BackupPayload
}

export interface BackupSummary {
  exportedAt: string
  recordCount: number
  documentCount: number
}

export async function readBackupSummary(uri: string, dataKey: Buffer): Promise<BackupSummary> {
  const payload = await readAndDecrypt(uri, dataKey)
  const recordCount = Object.values(payload.tables).reduce((sum, rows) => sum + rows.length, 0)
  return { exportedAt: payload.exportedAt, recordCount, documentCount: payload.documents.length }
}

/** Overwrites every row in every backed-up table with the backup's copy (INSERT OR
 * REPLACE, keyed by each table's own primary key) and restores every document file.
 * Does not touch sync_meta — see the module doc on why. Caller is responsible for
 * triggering a fresh sync afterward so the newly-restored `dirty` rows push back up
 * and anything genuinely new on the server since the backup was taken pulls down. */
export async function importBackup(uri: string, dataKey: Buffer): Promise<{ documentCount: number }> {
  const payload = await readAndDecrypt(uri, dataKey)
  const db = getDb()

  db.withTransactionSync(() => {
    for (const table of TABLES) {
      const rows = payload.tables[table]
      if (!rows || rows.length === 0) continue
      for (const row of rows) {
        const columns = Object.keys(row)
        const placeholders = columns.map(() => '?').join(', ')
        db.runSync(
          `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
          columns.map((c) => row[c] as never)
        )
      }
    }
  })

  const dir = documentsDir()
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
  for (const doc of payload.documents) {
    const file = new File(dir, doc.name)
    file.create({ intermediates: true, overwrite: true })
    await file.write(new Uint8Array(Buffer.from(doc.dataBase64, 'base64')))
  }

  return { documentCount: payload.documents.length }
}

export async function pickBackupFile(): Promise<{ uri: string; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
  if (result.canceled || result.assets.length === 0) return null
  const asset = result.assets[0]
  return { uri: asset.uri, name: asset.name }
}
