import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { syncAccounts } from '../sync/accountsSync'
import { syncValueHistory } from '../sync/valueHistorySync'
import { listAccounts, createAccount, updateAccount, deleteAccount } from '../db/accountsRepo'
import type { Account, AccountFormInput } from '../db/accountsRepo'
import { recordValueHistory } from '../db/valueHistoryRepo'
import { AccountListScreen } from './AccountListScreen'
import { AccountFormScreen } from './AccountFormScreen'
import { CheckInScreen } from './CheckInScreen'

type Nav = { name: 'list' } | { name: 'form'; syncId: string | null } | { name: 'checkin'; syncId: string }

/** Owns accounts + value_history: local state, sync orchestration, and the
 * list/form/check-in sub-navigation within the Accounts tab. */
export function AccountsModule() {
  const { dataKey, token } = useAuth()
  const [nav, setNav] = useState<Nav>({ name: 'list' })
  const [accounts, setAccounts] = useState<Account[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    if (!dataKey || !token) return
    setRefreshing(true)
    try {
      await syncAccounts(dataKey, token)
      await syncValueHistory(dataKey, token)
    } catch {
      // Local-first: show whatever's cached even if the network round-trip failed —
      // anything unpushed stays queued (dirty=1) and is retried next sync.
    } finally {
      setAccounts(listAccounts())
      setRefreshing(false)
    }
  }, [dataKey, token])

  useEffect(() => {
    setAccounts(listAccounts())
    void refresh()
    // Only run once per unlock — refresh() itself is stable across re-renders via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerBackgroundSync = useCallback(() => {
    if (!dataKey || !token) return
    syncAccounts(dataKey, token)
      .then(() => syncValueHistory(dataKey, token))
      .then(() => setAccounts(listAccounts()))
      .catch(() => {})
  }, [dataKey, token])

  const handleSubmit = (input: AccountFormInput) => {
    if (nav.name === 'form' && nav.syncId) {
      const previous = accounts.find((a) => a.sync_id === nav.syncId)
      const updated = updateAccount(nav.syncId, input)
      // A direct value edit still contributes a 'manual' history point, same as
      // desktop's updateAccount — only when the value actually changed, so merely
      // renaming an account doesn't add a spurious entry.
      if (previous && previous.current_value !== input.current_value) {
        recordValueHistory(updated.sync_id, input.current_value, 'manual')
      }
    } else {
      const created = createAccount(input)
      recordValueHistory(created.sync_id, input.current_value, 'manual')
    }
    setAccounts(listAccounts())
    setNav({ name: 'list' })
    triggerBackgroundSync()
  }

  const handleDelete = (syncId: string) => {
    deleteAccount(syncId)
    setAccounts(listAccounts())
    triggerBackgroundSync()
  }

  const handleCheckInDone = () => {
    setAccounts(listAccounts())
    setNav({ name: 'list' })
    triggerBackgroundSync()
  }

  // If the account a check-in/form nav target points to vanished out from under us
  // (e.g. deleted via a background sync pull), bounce back to the list — done as an
  // effect, not inline during render, since render must stay a pure read of state.
  useEffect(() => {
    if (nav.name === 'checkin' && !accounts.some((a) => a.sync_id === nav.syncId)) {
      setNav({ name: 'list' })
    }
  }, [nav, accounts])

  if (nav.name === 'form') {
    const editing = nav.syncId ? accounts.find((a) => a.sync_id === nav.syncId) ?? null : null
    return <AccountFormScreen initial={editing} onSubmit={handleSubmit} onCancel={() => setNav({ name: 'list' })} />
  }

  if (nav.name === 'checkin') {
    const account = accounts.find((a) => a.sync_id === nav.syncId)
    // Briefly null while the useEffect above redirects back to the list — never
    // committed to a visible frame in practice, just avoids rendering CheckInScreen
    // with no account.
    if (!account) return null
    return <CheckInScreen account={account} onDone={handleCheckInDone} onCancel={() => setNav({ name: 'list' })} />
  }

  return (
    <AccountListScreen
      accounts={accounts}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      onAddAccount={() => setNav({ name: 'form', syncId: null })}
      onSelectAccount={(syncId) => setNav({ name: 'form', syncId })}
      onDeleteAccount={handleDelete}
      onCheckIn={(syncId) => setNav({ name: 'checkin', syncId })}
    />
  )
}
