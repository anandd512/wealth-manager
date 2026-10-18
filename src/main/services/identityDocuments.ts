import { getDb } from '../db'
import { todayLocalDateString, daysUntilLocalDate } from '../dateUtils'
import type { IdentityDocument, IdentityDocumentInput } from '../../shared/types'

export function listIdentityDocuments(): IdentityDocument[] {
  return getDb()
    .prepare('SELECT * FROM identity_documents ORDER BY expiry_date IS NULL, expiry_date ASC')
    .all() as IdentityDocument[]
}

export function getIdentityDocument(id: number): IdentityDocument | undefined {
  return getDb().prepare('SELECT * FROM identity_documents WHERE id = ?').get(id) as
    | IdentityDocument
    | undefined
}

export function createIdentityDocument(input: IdentityDocumentInput): IdentityDocument {
  const now = new Date().toISOString()
  const info = getDb()
    .prepare(
      `INSERT INTO identity_documents
        (doc_type, label, id_number, full_name, date_of_birth, issued_date, expiry_date,
         additional_info, vehicle_class, vehicle_model, insurance_valid_upto, constituency,
         voter_serial_number, document_path, document_original_name, notes, created_at)
       VALUES (@doc_type, @label, @id_number, @full_name, @date_of_birth, @issued_date, @expiry_date,
               @additional_info, @vehicle_class, @vehicle_model, @insurance_valid_upto, @constituency,
               @voter_serial_number, @document_path, @document_original_name, @notes, @created_at)`
    )
    .run({ ...input, created_at: now })
  return getIdentityDocument(Number(info.lastInsertRowid))!
}

export function updateIdentityDocument(
  id: number,
  input: Partial<IdentityDocumentInput>
): IdentityDocument {
  const existing = getIdentityDocument(id)
  if (!existing) throw new Error('Document not found')
  const merged = { ...existing, ...input }
  getDb()
    .prepare(
      `UPDATE identity_documents SET
        doc_type=@doc_type, label=@label, id_number=@id_number, full_name=@full_name,
        date_of_birth=@date_of_birth, issued_date=@issued_date, expiry_date=@expiry_date,
        additional_info=@additional_info, vehicle_class=@vehicle_class, vehicle_model=@vehicle_model,
        insurance_valid_upto=@insurance_valid_upto, constituency=@constituency,
        voter_serial_number=@voter_serial_number, document_path=@document_path,
        document_original_name=@document_original_name, notes=@notes
       WHERE id=@id`
    )
    .run({ ...merged, id })
  return getIdentityDocument(id)!
}

export function deleteIdentityDocument(id: number): void {
  getDb().prepare('DELETE FROM identity_documents WHERE id = ?').run(id)
}

export function markReminderSent(id: number): void {
  getDb()
    .prepare('UPDATE identity_documents SET last_reminder_sent = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

export function getDocsNeedingReminder(daysBefore: number): IdentityDocument[] {
  const all = listIdentityDocuments()
  const todayStr = todayLocalDateString()
  return all.filter((d) => {
    if (!d.expiry_date) return false
    const daysUntil = daysUntilLocalDate(d.expiry_date)
    if (daysUntil === null || daysUntil > daysBefore || daysUntil < -1) return false
    if (d.last_reminder_sent && d.last_reminder_sent.slice(0, 10) === todayStr) return false
    return true
  })
}
