import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { SwipeableRow } from '../components/SwipeableRow'
import { SearchBar, matchesSearch } from '../components/SearchBar'
import type { VaultEntry } from '../db/vaultRepo'

const REVEAL_MS = 15_000
const COPY_CLEAR_MS = 30_000
const WEAK_LENGTH = 8
const OLD_PASSWORD_DAYS = 365

function isWeak(password: string | null): boolean {
  return !!password && password.length < WEAK_LENGTH
}

function isOld(changedAt: string | null): boolean {
  if (!changedAt) return false
  const days = (Date.now() - new Date(changedAt).getTime()) / (1000 * 60 * 60 * 24)
  return days > OLD_PASSWORD_DAYS
}

interface Props {
  entries: VaultEntry[]
  refreshing: boolean
  onRefresh: () => void
  onAdd: () => void
  onSelect: (syncId: string) => void
  onDelete: (syncId: string) => void
}

export function VaultListScreen({ entries, refreshing, onRefresh, onAdd, onSelect, onDelete }: Props) {
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copySecondsLeft, setCopySecondsLeft] = useState(0)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      if (copyInterval.current) clearInterval(copyInterval.current)
    },
    []
  )

  const toggleReveal = (syncId: string) => {
    if (revealTimer.current) clearTimeout(revealTimer.current)
    if (revealedId === syncId) {
      setRevealedId(null)
      return
    }
    setRevealedId(syncId)
    revealTimer.current = setTimeout(() => setRevealedId(null), REVEAL_MS)
  }

  const copyPassword = async (entry: VaultEntry) => {
    if (!entry.password) return
    await Clipboard.setStringAsync(entry.password)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    if (copyInterval.current) clearInterval(copyInterval.current)
    setCopiedId(entry.sync_id)
    setCopySecondsLeft(COPY_CLEAR_MS / 1000)
    copyInterval.current = setInterval(() => setCopySecondsLeft((s) => Math.max(0, s - 1)), 1000)
    copyTimer.current = setTimeout(async () => {
      await Clipboard.setStringAsync('')
      setCopiedId(null)
      if (copyInterval.current) clearInterval(copyInterval.current)
    }, COPY_CLEAR_MS)
  }

  const confirmDelete = (entry: VaultEntry) => {
    Alert.alert('Delete entry', `Remove "${entry.service_name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(entry.sync_id) }
    ])
  }

  const warnings = useMemo(
    () => entries.filter((e) => e.entry_type === 'login' && (isWeak(e.password) || isOld(e.password_changed_at))),
    [entries]
  )

  const [query, setQuery] = useState('')

  const sections = useMemo(() => {
    const filtered = entries.filter((e) => matchesSearch(query, e.service_name, e.username, e.url, e.category))
    const byCategory = new Map<string, VaultEntry[]>()
    for (const entry of filtered) {
      const key = entry.category ?? 'Uncategorized'
      const list = byCategory.get(key) ?? []
      list.push(entry)
      byCategory.set(key, list)
    }
    return Array.from(byCategory.entries()).map(([title, data]) => ({ title, data }))
  }, [entries, query])

  return (
    <View style={styles.container}>
      {warnings.length > 0 && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            {warnings.length} {warnings.length === 1 ? 'password needs' : 'passwords need'} attention — weak or
            unchanged for over a year.
          </Text>
        </View>
      )}

      {entries.length > 0 && <SearchBar value={query} onChangeText={setQuery} placeholder="Search vault…" />}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.sync_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => {
          const revealed = revealedId === item.sync_id
          const copied = copiedId === item.sync_id
          return (
            <SwipeableRow
              rightAction={{ label: 'Edit', color: '#2e7d32', onPress: () => onSelect(item.sync_id) }}
              leftAction={{ label: 'Delete', color: '#c0392b', onPress: () => confirmDelete(item) }}
            >
              <Pressable style={styles.row} onPress={() => onSelect(item.sync_id)}>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.service_name}</Text>
                  <Text style={styles.rowSubtitle}>{item.username || item.url || ' '}</Text>
                </View>
                {item.entry_type === 'login' && item.password && (
                  <View style={styles.rowActions}>
                    <Text style={styles.passwordText} numberOfLines={1}>
                      {revealed ? item.password : '••••••••'}
                    </Text>
                    <Pressable
                      style={styles.actionButton}
                      onPress={(e) => {
                        e.stopPropagation()
                        toggleReveal(item.sync_id)
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.actionButtonText}>{revealed ? 'Hide' : 'Show'}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionButton}
                      onPress={(e) => {
                        e.stopPropagation()
                        void copyPassword(item)
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
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query ? `No entries match "${query}".` : 'No entries yet. Tap "Add entry" to create your first one.'}
          </Text>
        }
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : undefined}
      />

      <Pressable style={styles.fab} onPress={onAdd}>
        <Text style={styles.fabText}>+ Add entry</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  warningBanner: { backgroundColor: '#fdecea', paddingHorizontal: 16, paddingVertical: 10 },
  warningText: { color: '#c0392b', fontSize: 12.5, fontWeight: '600' },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#777',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    backgroundColor: '#fff'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee'
  },
  rowText: { flex: 1, marginRight: 8 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  passwordText: { fontSize: 12, color: '#555', maxWidth: 90 },
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
