import React from 'react'
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SwipeableRow } from '../components/SwipeableRow'
import type { InsurancePolicy } from '../db/insuranceRepo'
import { policyTypeLabel, frequencyLabel, policyStatus, dateBadge } from '../lib/insuranceCategories'

function formatCurrency(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}

const TONE_COLORS: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: '#f0f0f0', fg: '#777' },
  danger: { bg: '#fdecea', fg: '#c0392b' },
  warn: { bg: '#fdf3e0', fg: '#b8860b' },
  ok: { bg: '#e8f5e9', fg: '#2e7d32' }
}

interface Props {
  policies: InsurancePolicy[]
  refreshing: boolean
  onRefresh: () => void
  onAdd: () => void
  onSelect: (syncId: string) => void
  onDelete: (syncId: string) => void
}

export function InsuranceListScreen({ policies, refreshing, onRefresh, onAdd, onSelect, onDelete }: Props) {
  const confirmDelete = (policy: InsurancePolicy) => {
    Alert.alert('Delete policy', `Remove "${policyTypeLabel(policy.policy_type)}" policy? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(policy.sync_id) }
    ])
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={policies}
        keyExtractor={(item) => item.sync_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const status = policyStatus(item.renewal_date)
          const badge = dateBadge(item.renewal_date ?? item.expiry_date)
          const tone = TONE_COLORS[badge.tone]
          return (
            <SwipeableRow
              rightAction={{ label: 'Edit', color: '#2e7d32', onPress: () => onSelect(item.sync_id) }}
              leftAction={{ label: 'Delete', color: '#c0392b', onPress: () => confirmDelete(item) }}
            >
              <Pressable style={styles.row} onPress={() => onSelect(item.sync_id)}>
                <View style={styles.rowTop}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{policyTypeLabel(item.policy_type)}</Text>
                    <Text style={styles.rowSubtitle}>
                      {[item.insurer, item.policy_number].filter(Boolean).join(' · ') || ' '}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.badgeText, { color: tone.fg }]}>{badge.label}</Text>
                  </View>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.premium}>
                    {formatCurrency(item.premium_amount)} {frequencyLabel(item.premium_frequency)}
                  </Text>
                  {status && <Text style={[styles.statusText, { color: TONE_COLORS[status.tone].fg }]}>{status.label}</Text>}
                </View>
              </Pressable>
            </SwipeableRow>
          )
        }}
        ListEmptyComponent={<Text style={styles.empty}>No policies yet. Tap "Add policy" to create your first one.</Text>}
        contentContainerStyle={policies.length === 0 ? styles.emptyContainer : undefined}
      />

      <Pressable style={styles.fab} onPress={onAdd}>
        <Text style={styles.fabText}>+ Add policy</Text>
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
  badge: { borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  premium: { fontSize: 12.5, color: '#555' },
  statusText: { fontSize: 12.5, fontWeight: '600' },
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
