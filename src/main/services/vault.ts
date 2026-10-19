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
      `INSERT INTO credential_vault
        (entry_type, service_name, category, url, username, password, totp_secret, password_changed_at, notes, created_at)
       VALUES (@entry_type, @service_name, @category, @url, @username, @password, @totp_secret, @password_changed_at, @notes, @created_at)`
    )
    .run({
      ...input,
      entry_type: input.entry_type ?? 'login',
      password_changed_at: input.password ? now : null,
      created_at: now
    })
  return getVaultEntry(Number(info.lastInsertRowid))!
}

export function updateVaultEntry(id: number, input: Partial<VaultEntryInput>): VaultEntry {
  const existing = getVaultEntry(id)
  if (!existing) throw new Error('Entry not found')
  const now = new Date().toISOString()
  const passwordChanged = input.password !== undefined && input.password !== existing.password
  const merged = {
    ...existing,
    ...input,
    entry_type: input.entry_type ?? existing.entry_type ?? 'login',
    password_changed_at: passwordChanged && input.password
      ? now
      : existing.password_changed_at
  }
  getDb()
    .prepare(
      `UPDATE credential_vault SET
        entry_type=@entry_type, service_name=@service_name, category=@category, url=@url,
        username=@username, password=@password, totp_secret=@totp_secret,
        password_changed_at=@password_changed_at, notes=@notes
       WHERE id=@id`
    )
    .run({ ...merged, id })
  return getVaultEntry(id)!
}

export function deleteVaultEntry(id: number): void {
  getDb().prepare('DELETE FROM credential_vault WHERE id = ?').run(id)
}
