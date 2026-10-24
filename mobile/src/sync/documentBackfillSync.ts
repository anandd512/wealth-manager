import { getDb } from '../db/db'
import { backfillUpload } from '../files/fileStore'

/** Mirrors src/main/sync.ts's dedicated backfillDocumentUploads on desktop — gives
 * every document this device holds locally (insurance policies, identity documents)
 * another chance to upload each sync, in case the original upload failed (best-
 * effort, no retry queue at the time it happened). Uses sync_meta (local-only,
 * never synced itself) to remember one already confirmed uploaded so it isn't
 * re-sent every time. Accounts aren't included — mobile's AccountFormScreen has no
 * document-attachment field, unlike desktop's loan-schedule upload. */
const DOCUMENT_TABLES = ['insurance_policies', 'identity_documents']

export async function backfillDocumentUploads(token: string): Promise<void> {
  const db = getDb()
  for (const table of DOCUMENT_TABLES) {
    const rows = db.getAllSync<{ document_path: string }>(
      `SELECT DISTINCT document_path FROM ${table} WHERE document_path IS NOT NULL AND deleted = 0`
    )
    for (const { document_path: documentPath } of rows) {
      const metaKey = `uploaded_doc_${documentPath}`
      const already = db.getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [metaKey])
      if (already) continue
      const uploaded = await backfillUpload(documentPath, token)
      if (uploaded) {
        db.runSync(
          'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [metaKey, '1']
        )
      }
    }
  }
}
