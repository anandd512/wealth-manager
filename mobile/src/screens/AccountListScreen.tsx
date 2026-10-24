import React, { useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native'
import { SwipeableRow } from '../components/SwipeableRow'
import { SearchBar, matchesSearch } from '../components/SearchBar'
import type { Account } from '../db/accountsRepo'
import { computeTotals } from '../lib/netWorth'
import { CATEGORY_LABELS, getSubtypeLabel } from '../lib/categories'

function formatCurrency(value: number): string {
  return value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}

interface Props {
  accounts: Account[]
  refreshing: boolean
  onRefresh: () => void
  onAddAccount: () => void
  onSelectAccount: (syncId: string) => void
  onDeleteAccount: (syncId: string) => void
  onCheckIn: (syncId: string) => void
}

export function AccountListScreen({
  accounts,
  refreshing,
  onRefresh,
  onAddAccount,
  onSelectAccount,
  onDeleteAccount,
  onCheckIn
}: Props) {
  const [query, setQuery] = useState('')
  const totals = useMemo(() => computeTotals(accounts), [accounts])

  const sections = useMemo(() => {
    const filtered = accounts.filter((a) => matchesSearch(query, a.name, a.institution, getSubtypeLabel(a.category, a.subtype)))
    const byCategory = new Map<string, Account[]>()
    for (const account of filtered) {
      const list = byCategory.get(account.category) ?? []
      list.push(account)
      byCategory.set(account.category, list)
    }
    return Array.from(byCategory.entries()).map(([category, data]) => ({
      title: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category,
      data
    }))
  }, [accounts, query])

  const confirmDelete = (account: Account) => {
    Alert.alert('Delete account', `Remove "${account.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteAccount(account.sync_id) }
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Assets</Text>
          <Text style={styles.tileValue}>{formatCurrency(totals.totalAssets)}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Liabilities</Text>
          <Text style={styles.tileValue}>{formatCurrency(totals.totalLiabilities)}</Text>
        </View>
        <View style={[styles.tile, styles.tileNetWorth]}>
          <Text style={styles.tileLabel}>Net Worth</Text>
          <Text style={styles.tileValueLarge}>{formatCurrency(totals.netWorth)}</Text>
        </View>
      </View>

      {accounts.length > 0 && <SearchBar value={query} onChangeText={setQuery} placeholder="Search accounts…" />}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.sync_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => (
          <SwipeableRow
            rightAction={{ label: 'Edit', color: '#2e7d32', onPress: () => onSelectAccount(item.sync_id) }}
            leftAction={{ label: 'Delete', color: '#c0392b', onPress: () => confirmDelete(item) }}
          >
            <Pressable style={styles.row} onPress={() => onCheckIn(item.sync_id)}>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowSubtitle}>
                  {getSubtypeLabel(item.category, item.subtype)}
                  {item.institution ? ` · ${item.institution}` : ''}
                </Text>
              </View>
              <View style={styles.rowEnd}>
                <Text style={[styles.rowValue, item.is_liability ? styles.rowValueLiability : null]}>
                  {formatCurrency(item.current_value)}
                </Text>
              </View>
            </Pressable>
          </SwipeableRow>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query
              ? `No accounts match "${query}".`
              : 'No accounts yet. Tap "Add account" to create your first one.'}
          </Text>
        }
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : undefined}
      />

      <Pressable style={styles.fab} onPress={onAddAccount}>
        <Text style={styles.fabText}>+ Add account</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  tiles: { flexDirection: 'row', padding: 16, gap: 8 },
  tile: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 10 },
  tileNetWorth: { backgroundColor: '#111' },
  tileLabel: { fontSize: 11, color: '#777', marginBottom: 4 },
  tileValue: { fontSize: 14, fontWeight: '700', color: '#111' },
  tileValueLarge: { fontSize: 14, fontWeight: '700', color: '#fff' },
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
  rowText: { flex: 1, marginRight: 12 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  rowEnd: { alignItems: 'flex-end', gap: 4 },
  rowValue: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowValueLiability: { color: '#c0392b' },
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
