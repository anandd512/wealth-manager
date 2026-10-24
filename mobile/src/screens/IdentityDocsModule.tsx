import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { syncIdentityDocs } from '../sync/identityDocsSync'
import { listIdentityDocuments, createIdentityDocument, updateIdentityDocument, deleteIdentityDocument } from '../db/identityDocsRepo'
import type { IdentityDocument, IdentityDocumentFormInput } from '../db/identityDocsRepo'
import { IdentityDocListScreen } from './IdentityDocListScreen'
import { IdentityDocFormScreen } from './IdentityDocFormScreen'

type Nav = { name: 'list' } | { name: 'form'; syncId: string | null }

/** Owns identity_documents: local state, sync orchestration, and the list/form
 * sub-navigation within the IDs tab. */
export function IdentityDocsModule() {
  const { dataKey, token } = useAuth()
  const [nav, setNav] = useState<Nav>({ name: 'list' })
  const [documents, setDocuments] = useState<IdentityDocument[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    if (!dataKey || !token) return
    setRefreshing(true)
    try {
      await syncIdentityDocs(dataKey, token)
    } catch {
      // Local-first — see AccountsModule's refresh for the same reasoning.
    } finally {
      setDocuments(listIdentityDocuments())
      setRefreshing(false)
    }
  }, [dataKey, token])

  useEffect(() => {
    setDocuments(listIdentityDocuments())
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerBackgroundSync = useCallback(() => {
    if (!dataKey || !token) return
    syncIdentityDocs(dataKey, token)
      .then(() => setDocuments(listIdentityDocuments()))
      .catch(() => {})
  }, [dataKey, token])

  const handleSubmit = (input: IdentityDocumentFormInput) => {
    if (nav.name === 'form' && nav.syncId) {
      updateIdentityDocument(nav.syncId, input)
    } else {
      createIdentityDocument(input)
    }
    setDocuments(listIdentityDocuments())
    setNav({ name: 'list' })
    triggerBackgroundSync()
  }

  const handleDelete = (syncId: string) => {
    deleteIdentityDocument(syncId)
    setDocuments(listIdentityDocuments())
    triggerBackgroundSync()
  }

  if (nav.name === 'form') {
    const editing = nav.syncId ? documents.find((d) => d.sync_id === nav.syncId) ?? null : null
    return <IdentityDocFormScreen initial={editing} onSubmit={handleSubmit} onCancel={() => setNav({ name: 'list' })} />
  }

  return (
    <IdentityDocListScreen
      documents={documents}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      onAdd={() => setNav({ name: 'form', syncId: null })}
      onSelect={(syncId) => setNav({ name: 'form', syncId })}
      onDelete={handleDelete}
    />
  )
}
