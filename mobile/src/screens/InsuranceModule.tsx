import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { syncInsurance } from '../sync/insuranceSync'
import { listPolicies, createPolicy, updatePolicy, deletePolicy } from '../db/insuranceRepo'
import type { InsurancePolicy, InsurancePolicyFormInput } from '../db/insuranceRepo'
import { InsuranceListScreen } from './InsuranceListScreen'
import { InsuranceFormScreen } from './InsuranceFormScreen'

type Nav = { name: 'list' } | { name: 'form'; syncId: string | null }

/** Owns insurance_policies: local state, sync orchestration, and the list/form
 * sub-navigation within the Insurance tab. */
export function InsuranceModule() {
  const { dataKey, token } = useAuth()
  const [nav, setNav] = useState<Nav>({ name: 'list' })
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    if (!dataKey || !token) return
    setRefreshing(true)
    try {
      await syncInsurance(dataKey, token)
    } catch {
      // Local-first — see AccountsModule's refresh for the same reasoning.
    } finally {
      setPolicies(listPolicies())
      setRefreshing(false)
    }
  }, [dataKey, token])

  useEffect(() => {
    setPolicies(listPolicies())
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerBackgroundSync = useCallback(() => {
    if (!dataKey || !token) return
    syncInsurance(dataKey, token)
      .then(() => setPolicies(listPolicies()))
      .catch(() => {})
  }, [dataKey, token])

  const handleSubmit = (input: InsurancePolicyFormInput) => {
    if (nav.name === 'form' && nav.syncId) {
      updatePolicy(nav.syncId, input)
    } else {
      createPolicy(input)
    }
    setPolicies(listPolicies())
    setNav({ name: 'list' })
    triggerBackgroundSync()
  }

  const handleDelete = (syncId: string) => {
    deletePolicy(syncId)
    setPolicies(listPolicies())
    triggerBackgroundSync()
  }

  if (nav.name === 'form') {
    const editing = nav.syncId ? policies.find((p) => p.sync_id === nav.syncId) ?? null : null
    return <InsuranceFormScreen initial={editing} onSubmit={handleSubmit} onCancel={() => setNav({ name: 'list' })} />
  }

  return (
    <InsuranceListScreen
      policies={policies}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      onAdd={() => setNav({ name: 'form', syncId: null })}
      onSelect={(syncId) => setNav({ name: 'form', syncId })}
      onDelete={handleDelete}
    />
  )
}
