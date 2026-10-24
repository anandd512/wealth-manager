import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { syncVault } from '../sync/vaultSync'
import { listVaultEntries, createVaultEntry, updateVaultEntry, deleteVaultEntry } from '../db/vaultRepo'
import type { VaultEntry, VaultEntryFormInput } from '../db/vaultRepo'
import { VaultListScreen } from './VaultListScreen'
import { VaultFormScreen } from './VaultFormScreen'

type Nav = { name: 'list' } | { name: 'form'; syncId: string | null }

/** Owns credential_vault: local state, sync orchestration, and the list/form
 * sub-navigation within the Vault tab. */
export function VaultModule() {
  const { dataKey, token } = useAuth()
  const [nav, setNav] = useState<Nav>({ name: 'list' })
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    if (!dataKey || !token) return
    setRefreshing(true)
    try {
      await syncVault(dataKey, token)
    } catch {
      // Local-first — see AccountsModule's refresh for the same reasoning.
    } finally {
      setEntries(listVaultEntries())
      setRefreshing(false)
    }
  }, [dataKey, token])

  useEffect(() => {
    setEntries(listVaultEntries())
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerBackgroundSync = useCallback(() => {
    if (!dataKey || !token) return
    syncVault(dataKey, token)
      .then(() => setEntries(listVaultEntries()))
      .catch(() => {})
  }, [dataKey, token])

  const handleSubmit = (input: VaultEntryFormInput) => {
    if (nav.name === 'form' && nav.syncId) {
      updateVaultEntry(nav.syncId, input)
    } else {
      createVaultEntry(input)
    }
    setEntries(listVaultEntries())
    setNav({ name: 'list' })
    triggerBackgroundSync()
  }

  const handleDelete = (syncId: string) => {
    deleteVaultEntry(syncId)
    setEntries(listVaultEntries())
    triggerBackgroundSync()
  }

  if (nav.name === 'form') {
    const editing = nav.syncId ? entries.find((e) => e.sync_id === nav.syncId) ?? null : null
    return <VaultFormScreen initial={editing} onSubmit={handleSubmit} onCancel={() => setNav({ name: 'list' })} />
  }

  return (
    <VaultListScreen
      entries={entries}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      onAdd={() => setNav({ name: 'form', syncId: null })}
      onSelect={(syncId) => setNav({ name: 'form', syncId })}
      onDelete={handleDelete}
    />
  )
}
