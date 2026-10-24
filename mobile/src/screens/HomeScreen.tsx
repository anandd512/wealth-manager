import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LayoutDashboard, Wallet, CreditCard, ShieldCheck, IdCard, KeyRound, Settings as SettingsIcon } from 'lucide-react-native'
import { DashboardModule } from './DashboardModule'
import { AccountsModule } from './AccountsModule'
import { VaultModule } from './VaultModule'
import { CreditCardsModule } from './CreditCardsModule'
import { InsuranceModule } from './InsuranceModule'
import { IdentityDocsModule } from './IdentityDocsModule'
import { SettingsScreen } from './SettingsScreen'
import { TourScreen } from './TourScreen'
import { loadTourSeen, saveTourSeen } from '../auth/secureStore'

type Tab = 'dashboard' | 'accounts' | 'cards' | 'insurance' | 'ids' | 'vault' | 'settings'

const DATA_TABS: { key: Tab; label: string; icon: typeof Wallet }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'accounts', label: 'Accounts', icon: Wallet },
  { key: 'cards', label: 'Cards', icon: CreditCard },
  { key: 'insurance', label: 'Insurance', icon: ShieldCheck },
  { key: 'ids', label: 'IDs', icon: IdCard },
  { key: 'vault', label: 'Vault', icon: KeyRound }
]

/** Thin tab shell — each module (Accounts, Credit Cards, Vault, Insurance, Identity
 * Documents) owns its own local state, sync orchestration, and sub-navigation; this
 * just switches which one is mounted. Settings lives behind a persistent header icon
 * rather than in the bottom bar — six data tabs plus Settings wouldn't comfortably
 * fit a phone-width bottom bar with readable labels. Tab order matches desktop's nav
 * exactly (Dashboard, Accounts, Credit Cards, Insurance, IDs, Vault). */
export function HomeScreen() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [showTour, setShowTour] = useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    loadTourSeen().then((seen) => setShowTour(!seen))
  }, [])

  const dismissTour = () => {
    setShowTour(false)
    void saveTourSeen(true)
  }

  if (showTour) {
    return <TourScreen onDone={dismissTour} />
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Artha</Text>
        <Pressable
          onPress={() => setTab('settings')}
          hitSlop={10}
          style={[styles.settingsButton, tab === 'settings' && styles.settingsButtonActive]}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <SettingsIcon size={20} color={tab === 'settings' ? '#111' : '#777'} />
        </Pressable>
      </View>
      <View style={styles.content}>
        {tab === 'dashboard' && <DashboardModule />}
        {tab === 'accounts' && <AccountsModule />}
        {tab === 'cards' && <CreditCardsModule />}
        {tab === 'vault' && <VaultModule />}
        {tab === 'insurance' && <InsuranceModule />}
        {tab === 'ids' && <IdentityDocsModule />}
        {tab === 'settings' && (
          <SettingsScreen onBack={() => setTab('dashboard')} onShowTour={() => setShowTour(true)} />
        )}
      </View>
      {tab !== 'settings' && (
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {DATA_TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <Pressable
                key={t.key}
                style={styles.tabItem}
                onPress={() => setTab(t.key)}
                hitSlop={4}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: active }}
              >
                <Icon size={22} color={active ? '#111' : '#999'} strokeWidth={active ? 2.4 : 2} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 6
  },
  brand: { fontSize: 15, fontWeight: '700', color: '#555' },
  settingsButton: { padding: 8, borderRadius: 20 },
  settingsButtonActive: { backgroundColor: '#f1f1f1' },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    paddingTop: 8,
    backgroundColor: '#fff'
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, gap: 3, paddingVertical: 4 },
  tabLabel: { fontSize: 11, color: '#999', fontWeight: '600' },
  tabLabelActive: { color: '#111' }
})
