import React, { useMemo } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LineChart, PieChart } from 'react-native-gifted-charts'
import type { Account } from '../db/accountsRepo'
import type { InsurancePolicy } from '../db/insuranceRepo'
import type { IdentityDocument } from '../db/identityDocsRepo'
import type { CreditCard } from '../db/creditCardsRepo'
import type { NetWorthSnapshot } from '../db/netWorthSnapshotsRepo'
import { computeTotals, getBreakdownByCategory } from '../lib/netWorth'
import { getUpcomingItems, UpcomingItem } from '../lib/upcoming'
import { CATEGORY_LABELS } from '../lib/categories'

const BREAKDOWN_LABELS: Record<string, string> = { ...CATEGORY_LABELS, fixed_deposits: 'Fixed Deposits' }
const PIE_COLORS = ['#5b8def', '#3ecf8e', '#e8b14f', '#ef5b5b', '#9d7bd8', '#4fd0e8']

function formatCurrency(value: number): string {
  return value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}

function formatCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`
  if (abs >= 100_000) return `${(value / 100_000).toFixed(1)}L`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(Math.round(value))
}

interface Props {
  accounts: Account[]
  snapshots: NetWorthSnapshot[]
  policies: InsurancePolicy[]
  identityDocs: IdentityDocument[]
  creditCards: CreditCard[]
  refreshing: boolean
  onRefresh: () => void
  onDismiss: (item: UpcomingItem) => void
}

export function DashboardScreen({
  accounts,
  snapshots,
  policies,
  identityDocs,
  creditCards,
  refreshing,
  onRefresh,
  onDismiss
}: Props) {
  const totals = useMemo(() => computeTotals(accounts), [accounts])
  const breakdown = useMemo(() => getBreakdownByCategory(accounts), [accounts])
  const upcoming = useMemo(
    () => getUpcomingItems(policies, identityDocs, creditCards),
    [policies, identityDocs, creditCards]
  )

  const lineData = useMemo(
    () => snapshots.map((s) => ({ value: s.net_worth, label: s.snapshot_date.slice(5) })),
    [snapshots]
  )

  const pieData = useMemo(
    () =>
      breakdown.map((b, i) => ({
        value: b.value,
        color: PIE_COLORS[i % PIE_COLORS.length],
        text: ''
      })),
    [breakdown]
  )

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
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

      {lineData.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Net worth over time</Text>
          <LineChart
            data={lineData}
            height={160}
            thickness={2.5}
            color="#111"
            startFillColor="#111"
            endFillColor="#fff"
            startOpacity={0.15}
            endOpacity={0.02}
            areaChart
            hideDataPoints
            hideRules
            hideYAxisText
            xAxisColor="#eee"
            yAxisColor="transparent"
            noOfSections={3}
            spacing={Math.max(8, 280 / Math.max(1, lineData.length))}
            initialSpacing={8}
            endSpacing={8}
            curved
          />
        </View>
      )}

      {breakdown.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Assets by category</Text>
          <View style={styles.breakdownRow}>
            <PieChart data={pieData} donut radius={60} innerRadius={38} />
            <View style={styles.legend}>
              {breakdown.map((b, i) => (
                <View key={b.category} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }]} />
                  <Text style={styles.legendLabel} numberOfLines={1}>
                    {BREAKDOWN_LABELS[b.category] ?? b.category}
                  </Text>
                  <Text style={styles.legendValue}>{formatCompact(b.value)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {upcoming.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Upcoming</Text>
          {upcoming.map((item) => (
            <View key={`${item.itemType}:${item.itemSyncId}:${item.dueDate}`} style={styles.upcomingRow}>
              <View style={styles.upcomingText}>
                <Text style={styles.upcomingTitle}>{item.title}</Text>
                <Text style={styles.upcomingSubtitle}>
                  {item.typeLabel}
                  {item.subtitle ? ` · ${item.subtitle}` : ''}
                </Text>
              </View>
              <View style={styles.upcomingEnd}>
                <Text style={[styles.upcomingDays, item.daysLeft <= 15 && styles.upcomingDaysUrgent]}>
                  {item.daysLeft <= 0 ? 'Due today' : `${item.daysLeft}d`}
                </Text>
                <Pressable style={styles.dismissButton} onPress={() => onDismiss(item)} hitSlop={8}>
                  <Text style={styles.dismissButtonText}>{item.actionLabel}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {accounts.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Add an account to see your net worth here.</Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  tiles: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tile: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 10 },
  tileNetWorth: { backgroundColor: '#111' },
  tileLabel: { fontSize: 11, color: '#777', marginBottom: 4 },
  tileValue: { fontSize: 14, fontWeight: '700', color: '#111' },
  tileValueLarge: { fontSize: 14, fontWeight: '700', color: '#fff' },
  card: { backgroundColor: '#f7f7f7', borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 12, color: '#555' },
  legendValue: { fontSize: 12, fontWeight: '600', color: '#111' },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5'
  },
  upcomingText: { flex: 1, marginRight: 8 },
  upcomingTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  upcomingSubtitle: { fontSize: 11.5, color: '#888', marginTop: 2 },
  upcomingEnd: { alignItems: 'flex-end', gap: 4 },
  upcomingDays: { fontSize: 12, fontWeight: '700', color: '#2e7d32' },
  upcomingDaysUrgent: { color: '#c0392b' },
  dismissButton: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10, backgroundColor: '#fff' },
  dismissButtonText: { fontSize: 11, color: '#333', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: '#999', fontSize: 13 }
})
