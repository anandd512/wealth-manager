import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { syncCreditCards } from '../sync/creditCardsSync'
import { listCreditCards, createCreditCard, updateCreditCard, deleteCreditCard } from '../db/creditCardsRepo'
import type { CreditCard, CreditCardFormInput } from '../db/creditCardsRepo'
import { CreditCardListScreen } from './CreditCardListScreen'
import { CreditCardFormScreen } from './CreditCardFormScreen'

type Nav = { name: 'list' } | { name: 'form'; syncId: string | null }

/** Owns credit_cards: local state, sync orchestration, and the list/form
 * sub-navigation within the Credit Cards tab. */
export function CreditCardsModule() {
  const { dataKey, token } = useAuth()
  const [nav, setNav] = useState<Nav>({ name: 'list' })
  const [cards, setCards] = useState<CreditCard[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    if (!dataKey || !token) return
    setRefreshing(true)
    try {
      await syncCreditCards(dataKey, token)
    } catch {
      // Local-first — see AccountsModule's refresh for the same reasoning.
    } finally {
      setCards(listCreditCards())
      setRefreshing(false)
    }
  }, [dataKey, token])

  useEffect(() => {
    setCards(listCreditCards())
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerBackgroundSync = useCallback(() => {
    if (!dataKey || !token) return
    syncCreditCards(dataKey, token)
      .then(() => setCards(listCreditCards()))
      .catch(() => {})
  }, [dataKey, token])

  const handleSubmit = (input: CreditCardFormInput) => {
    if (nav.name === 'form' && nav.syncId) {
      updateCreditCard(nav.syncId, input)
    } else {
      createCreditCard(input)
    }
    setCards(listCreditCards())
    setNav({ name: 'list' })
    triggerBackgroundSync()
  }

  const handleDelete = (syncId: string) => {
    deleteCreditCard(syncId)
    setCards(listCreditCards())
    triggerBackgroundSync()
  }

  if (nav.name === 'form') {
    const editing = nav.syncId ? cards.find((c) => c.sync_id === nav.syncId) ?? null : null
    return <CreditCardFormScreen initial={editing} onSubmit={handleSubmit} onCancel={() => setNav({ name: 'list' })} />
  }

  return (
    <CreditCardListScreen
      cards={cards}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      onAdd={() => setNav({ name: 'form', syncId: null })}
      onSelect={(syncId) => setNav({ name: 'form', syncId })}
      onDelete={handleDelete}
    />
  )
}
