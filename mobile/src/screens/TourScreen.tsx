import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Sparkles,
  LayoutDashboard,
  Wallet,
  CreditCard,
  ShieldCheck,
  IdCard,
  KeyRound,
  Bot,
  LockKeyhole,
  Bell,
  Hand,
  Star,
  ChevronRight,
  X
} from 'lucide-react-native'

interface Step {
  icon: typeof Sparkles
  title: string
  desc: string
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: 'Welcome to Artha',
    desc: 'Your personal finance command center — accounts, insurance, identity documents, credit cards, and passwords, all encrypted before they ever leave this device.'
  },
  {
    icon: LayoutDashboard,
    title: 'Net worth at a glance',
    desc: 'The Dashboard tab shows your total assets, liabilities, and net worth trend the moment you open the app — plus a breakdown by category and anything coming up soon.'
  },
  {
    icon: Hand,
    title: 'Swipe to act faster',
    desc: 'On any list, swipe a row right for its quick action (check in on Accounts, edit elsewhere) or left to delete. Swipe right anywhere on a screen to go back — no need to hunt for a button.'
  },
  {
    icon: Wallet,
    title: 'Accounts & net worth',
    desc: 'Add every account that makes up your wealth — bank, investments, real estate, loans. Tap a row to check in a new value; your net worth updates instantly.'
  },
  {
    icon: CreditCard,
    title: 'Credit cards',
    desc: 'Track statement and due dates so a payment never slips through — Artha works out when each bill is due from your statement date.'
  },
  {
    icon: ShieldCheck,
    title: 'Insurance & IDs',
    desc: 'Keep policies and identity documents in one encrypted place, with renewal and expiry dates tracked automatically.'
  },
  {
    icon: KeyRound,
    title: 'Password vault',
    desc: 'A secure home for your logins, encrypted alongside everything else — no separate password manager needed.'
  },
  {
    icon: Bot,
    title: 'AI reads your documents',
    desc: 'Upload a policy PDF, ID scan, or loan schedule and your chosen AI provider fills in the details automatically. It reads the document and the details are saved privately on your device.'
  },
  {
    icon: Bell,
    title: 'Never miss a deadline',
    desc: 'Artha can send you a reminder before a policy lapses, an ID expires, or a card payment is due — right from this device, no account needed.'
  },
  {
    icon: LockKeyhole,
    title: 'Your data stays private',
    desc: 'Everything is encrypted on this device before it ever syncs — the same zero-knowledge encryption as the desktop app. Unlock with Face ID, or your master password if you prefer.'
  },
  {
    icon: Star,
    title: "You're all set",
    desc: 'Start by adding your first account from the Accounts tab — your net worth will appear on the Dashboard right away.'
  }
]

interface Props {
  onDone: () => void
}

export function TourScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets()
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const Icon = step.icon
  const isLast = index === STEPS.length - 1

  const next = () => {
    if (isLast) onDone()
    else setIndex((i) => i + 1)
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <Pressable onPress={onDone} style={styles.skip} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip tour">
        <X size={18} color="#999" />
      </Pressable>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Icon size={36} color="#111" />
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.desc}>{step.desc}</Text>
      </View>

      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <Pressable style={styles.button} onPress={next} accessibilityRole="button">
        <Text style={styles.buttonText}>{isLast ? 'Get started' : 'Next'}</Text>
        {!isLast && <ChevronRight size={18} color="#fff" />}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 28 },
  skip: { alignSelf: 'flex-end', padding: 8 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 12 },
  desc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ddd' },
  dotActive: { backgroundColor: '#111', width: 18 },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
})
