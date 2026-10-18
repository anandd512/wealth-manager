import { getDb } from '../db'
import type { VaultEntry, VaultEntryInput } from '../../shared/types'

export function listVaultEntries(): VaultEntry[] {
  return getDb()
    .prepare('SELECT * FROM credential_vault ORDER BY category NULLS LAST, service_name')
    .all() as VaultEntry[]
}

export function getVaultEntry(id: number): VaultEntry | undefined {
  return getDb().prepare('SELECT * FROM credential_vault WHERE id = ?').get(id) as
    | VaultEntry
    | undefined
}

export function createVaultEntry(input: VaultEntryInput): VaultEntry {
  const now = new Date().toISOString()
  const info = getDb()
    .prepare(
      `INSERT INTO credential_vault (service_name, category, url, username, password, notes, created_at)
       VALUES (@service_name, @category, @url, @username, @password, @notes, @created_at)`
    )
    .run({ ...input, created_at: now })
  return getVaultEntry(Number(info.lastInsertRowid))!
}

export function updateVaultEntry(id: number, input: Partial<VaultEntryInput>): VaultEntry {
  const existing = getVaultEntry(id)
  if (!existing) throw new Error('Entry not found')
  const merged = { ...existing, ...input }
  getDb()
    .prepare(
      `UPDATE credential_vault SET
        service_name=@service_name, category=@category, url=@url, username=@username, password=@password, notes=@notes
       WHERE id=@id`
    )
    .run({ ...merged, id })
  return getVaultEntry(id)!
}

export function deleteVaultEntry(id: number): void {
  getDb().prepare('DELETE FROM credential_vault WHERE id = ?').run(id)
}
