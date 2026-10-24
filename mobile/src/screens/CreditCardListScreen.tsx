import React, { useRef, useState } from 'react'
import { Alert, Pressable, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { SwipeableRow } from '../components/SwipeableRow'
import type { CreditCard } from '../db/creditCardsRepo'
import { maskCardNumber, cardDigits } from '../lib/cardNumber'
import { dueDateBadge } from '../lib/creditCardCycle'

const COPY_CLEAR_MS = 30_000

interface Props {
  cards: CreditCard[]
  refreshing: boolean
  onRefresh: () => void
  onAdd: () => void
  onSelect: (syncId: string) => void
  onDelete: (syncId: string) => void
}

export function CreditCardListScreen({ cards, refreshing, onRefresh, onAdd, onSelect, onDelete }: Props) {
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copySecondsLeft, setCopySecondsLeft] = useState(0)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const copyNumber = async (card: CreditCard) => {
    const digits = cardDigits(card.card_number)
    if (!digits) return
    await Clipboard.setStringAsync(digits)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    if (copyInterval.current) clearInterval(copyInterval.current)
    setCopiedId(card.sync_id)
    setCopySecondsLeft(COPY_CLEAR_MS / 1000)
    copyInterval.current = setInterval(() => setCopySecondsLeft((s) => Math.max(0, s - 1)), 1000)
    copyTimer.current = setTimeout(async () => {
      await Clipboard.setStringAsync('')
      setCopiedId(null)
      if (copyInterval.current) clearInterval(copyInterval.current)
    }, COPY_CLEAR_MS)
  }

  const confirmDelete = (card: CreditCard) => {
    Alert.alert('Delete card', `Remove "${card.nickname}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(card.sync_id) }
    ])
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.sync_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const revealed = revealedId === item.sync_id
          const copied = copiedId === item.sync_id
          const badge = dueDateBadge(item.statement_day, item.status)
          const digits = cardDigits(item.card_number)
          return (
            <SwipeableRow
              rightAction={{ label: 'Edit', color: '#2e7d32', onPress: () => onSelect(item.sync_id) }}
              leftAction={{ label: 'Delete', color: '#c0392b', onPress: () => confirmDelete(item) }}
            >
              <Pressable style={styles.row} onPress={() => onSelect(item.sync_id)}>
                <View style={styles.rowTop}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>
                      {item.nickname}
                      {item.status === 'disabled' ? ' (disabled)' : ''}
                    </Text>
                    <Text style={styles.rowSubtitle}>
                      {[item.issuer, item.network].filter(Boolean).join(' · ') || ' '}
                    </Text>
                  </View>
                  {badge && (
                    <View style={styles.dueBadge}>
                      <Text style={styles.dueBadgeText}>
                        {badge.daysLeft <= 0 ? 'Due today' : `Due in ${badge.daysLeft}d`}
                      </Text>
                    </View>
                  )}
                </View>
                {digits.length > 0 && (
                  <View style={styles.numberRow}>
                    <Text style={styles.numberText}>{revealed ? digits : maskCardNumber(item.card_number, item.network)}</Text>
                    <Pressable
                      style={styles.actionButton}
                      onPress={(e) => {
                        e.stopPropagation()
                        setRevealedId(revealed ? null : item.sync_id)
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.actionButtonText}>{revealed ? 'Hide' : 'Show'}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionButton}
                      onPress={(e) => {
                        e.stopPropagation()
                        void copyNumber(item)
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.actionButtonText}>{copied ? `${copySecondsLeft}s` : 'Copy'}</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            </SwipeableRow>
          )
        }}
        ListEmptyComponent={<Text style={styles.empty}>No cards yet. Tap "Add card" to create your first one.</Text>}
        contentContainerStyle={cards.length === 0 ? styles.emptyContainer : undefined}
      />

      <Pressable style={styles.fab} onPress={onAdd}>
        <Text style={styles.fabText}>+ Add card</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee'
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { flex: 1, marginRight: 8 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  dueBadge: { backgroundColor: '#fdecea', borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 },
  dueBadgeText: { fontSize: 11, color: '#c0392b', fontWeight: '700' },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  numberText: { fontSize: 13, color: '#555', flex: 1 },
  actionButton: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8 },
  actionButtonText: { fontSize: 11, color: '#333', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', marginTop: 48, paddingHorizontal: 32 },
  emptyContainer: { flexGrow: 1 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#111',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 20
  },
  fabText: { color: '#fff', fontWeight: '700' }
})
