// Ported from src/shared/insuranceTypes.ts.

export type InsurancePolicyType =
  | 'term_life'
  | 'life'
  | 'health'
  | 'vehicle_2w'
  | 'vehicle_4w'
  | 'home'
  | 'travel'
  | 'personal_accident'
  | 'other'

export const POLICY_TYPES: { value: InsurancePolicyType; label: string }[] = [
  { value: 'term_life', label: 'Term Life' },
  { value: 'life', label: 'Life (Endowment/ULIP)' },
  { value: 'health', label: 'Health' },
  { value: 'vehicle_2w', label: '2-Wheeler Vehicle' },
  { value: 'vehicle_4w', label: '4-Wheeler Vehicle' },
  { value: 'home', label: 'Home' },
  { value: 'travel', label: 'Travel' },
  { value: 'personal_accident', label: 'Personal Accident' },
  { value: 'other', label: 'Other' }
]

export const POLICY_TYPE_LABELS: Record<string, string> = Object.fromEntries(POLICY_TYPES.map((t) => [t.value, t.label]))

export const VEHICLE_POLICY_TYPES: InsurancePolicyType[] = ['vehicle_2w', 'vehicle_4w']

export function policyTypeLabel(policyType: string | null): string {
  if (!policyType) return 'Insurance'
  return POLICY_TYPE_LABELS[policyType] ?? policyType
}

export const PREMIUM_FREQUENCIES: { value: string; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half-yearly', label: 'Half-yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'single', label: 'Single premium' }
]

const FREQUENCY_SHORT: Record<string, string> = {
  monthly: '/mo',
  quarterly: '/qtr',
  'half-yearly': '/6mo',
  yearly: '/yr',
  single: 'one-time'
}

export function frequencyLabel(freq: string | null): string {
  if (!freq) return '/yr'
  return FREQUENCY_SHORT[freq] ?? freq
}

/** Ported from src/renderer/src/pages/Insurance.tsx's getStatus. */
export function policyStatus(renewalDate: string | null): { label: string; tone: 'danger' | 'warn' | 'ok' } | null {
  if (!renewalDate) return null
  const days = Math.floor((new Date(renewalDate).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { label: 'Lapsed', tone: 'danger' }
  if (days <= 90) return { label: `Renews in ${days}d`, tone: 'warn' }
  return { label: 'Active', tone: 'ok' }
}

/** Ported from src/renderer/src/pages/Insurance.tsx's badgeFor. */
export function dateBadge(date: string | null): { label: string; tone: 'neutral' | 'danger' | 'warn' | 'ok' } {
  if (!date) return { label: 'Not set', tone: 'neutral' }
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { label: 'Expired', tone: 'danger' }
  if (days <= 15) return { label: `${days} days`, tone: 'danger' }
  if (days <= 45) return { label: `${days} days`, tone: 'warn' }
  return { label: `${days} days`, tone: 'ok' }
}
