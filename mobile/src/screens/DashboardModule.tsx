import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { syncAccounts } from '../sync/accountsSync'
import { syncValueHistory } from '../sync/valueHistorySync'
import { syncInsurance } from '../sync/insuranceSync'
import { syncIdentityDocs } from '../sync/identityDocsSync'
import { syncCreditCards } from '../sync/creditCardsSync'
import { syncNetWorthSnapshots } from '../sync/netWorthSnapshotsSync'
import { syncUpcomingDismissals } from '../sync/upcomingDismissalsSync'
import { backfillDocumentUploads } from '../sync/documentBackfillSync'
import { listAccounts } from '../db/accountsRepo'
import type { Account } from '../db/accountsRepo'
import { listPolicies } from '../db/insuranceRepo'
import type { InsurancePolicy } from '../db/insuranceRepo'
import { listIdentityDocuments } from '../db/identityDocsRepo'
import type { IdentityDocument } from '../db/identityDocsRepo'
import { listCreditCards } from '../db/creditCardsRepo'
import type { CreditCard } from '../db/creditCardsRepo'
import { listSnapshots } from '../db/netWorthSnapshotsRepo'
import type { NetWorthSnapshot } from '../db/netWorthSnapshotsRepo'
import { dismissItem } from '../db/upcomingDismissalsRepo'
import { dismissActionFor, UpcomingItem } from '../lib/upcoming'
import { getLastSyncedAt, setLastSyncedAt } from '../sync/syncStatus'
import { DashboardScreen } from './DashboardScreen'

/** Owns loading + sync orchestration for the Dashboard tab. Unlike the other
 * modules, this one reads across five tables (accounts, insurance, identity docs,
 * credit cards, net worth snapshots) plus upcoming_dismissals, so it triggers each
 * table's own sync on mount/refresh rather than owning its own data. */
export function DashboardModule() {
  const { dataKey, token } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [identityDocs, setIdentityDocs] = useState<IdentityDocument[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncedAt, setLastSyncedAtState] = useState<string | null>(null)
  const [syncFailed, setSyncFailed] = useState(false)

  const loadLocal = useCallback(() => {
    setAccounts(listAccounts())
    setPolicies(listPolicies())
    setIdentityDocs(listIdentityDocuments())
    setCreditCards(listCreditCards())
    setSnapshots(listSnapshots())
    setLastSyncedAtState(getLastSyncedAt())
  }, [])

  const refresh = useCallback(async () => {
    if (!dataKey || !token) return
    setRefreshing(true)
    try {
      await Promise.all([
        syncAccounts(dataKey, token).then(() => syncValueHistory(dataKey, token)),
        syncInsurance(dataKey, token),
        syncIdentityDocs(dataKey, token),
        syncCreditCards(dataKey, token),
        syncNetWorthSnapshots(dataKey, token)
      ])
      // Dismissals reference the other tables' sync_ids — run after they've landed.
      await syncUpcomingDismissals(dataKey, token)
      await backfillDocumentUploads(token)
      setLastSyncedAt(new Date().toISOString())
      setSyncFailed(false)
    } catch {
      // Local-first: show whatever's cached even if the network round-trip failed —
      // but the last-synced indicator now makes that staleness visible instead of
      // silently pretending everything's current.
      setSyncFailed(true)
    } finally {
      loadLocal()
      setRefreshing(false)
    }
  }, [dataKey, token, loadLocal])

  useEffect(() => {
    loadLocal()
    void refresh()
    // Only run once per unlock — refresh() itself is stable across re-renders via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDismiss = (item: UpcomingItem) => {
    dismissItem(item.itemType, item.itemSyncId, item.dueDate, dismissActionFor(item.itemType))
    loadLocal()
    if (dataKey && token) {
      syncUpcomingDismissals(dataKey, token).catch(() => {})
    }
  }

  return (
    <DashboardScreen
      accounts={accounts}
      snapshots={snapshots}
      policies={policies}
      identityDocs={identityDocs}
      creditCards={creditCards}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      onDismiss={handleDismiss}
      lastSyncedAt={lastSyncedAt}
      syncFailed={syncFailed}
    />
  )
}
