import { getDb } from '../db'

// Called after every transaction/import delete to decide whether the underlying
// statement file (shared by every transaction from the same import) can finally be
// removed from disk — split out of cashFlow.ts just to keep that file's size down.
export function isDocumentReferenced(documentPath: string): boolean {
  const txn = getDb()
    .prepare('SELECT 1 FROM cash_flow_transactions WHERE document_path = ? AND deleted = 0 LIMIT 1')
    .get(documentPath)
  if (txn) return true
  const imp = getDb()
    .prepare('SELECT 1 FROM cash_flow_imports WHERE document_path = ? AND deleted = 0 LIMIT 1')
    .get(documentPath)
  return Boolean(imp)
}
