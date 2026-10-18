import type { InsurancePolicyType } from './types'

export const POLICY_TYPES: { value: InsurancePolicyType; label: string; icon: string }[] = [
  { value: 'term_life', label: 'Term Life', icon: '🛡️' },
  { value: 'life', label: 'Life (Endowment/ULIP)', icon: '❤️' },
  { value: 'health', label: 'Health', icon: '⚕️' },
  { value: 'vehicle_2w', label: '2-Wheeler Vehicle', icon: '🏍️' },
  { value: 'vehicle_4w', label: '4-Wheeler Vehicle', icon: '🚗' },
  { value: 'home', label: 'Home', icon: '🏠' },
  { value: 'travel', label: 'Travel', icon: '✈️' },
  { value: 'personal_accident', label: 'Personal Accident', icon: '🩹' },
  { value: 'other', label: 'Other', icon: '📄' }
]

export const POLICY_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  POLICY_TYPES.map((t) => [t.value, t.label])
)

export const POLICY_TYPE_ICONS: Record<string, string> = Object.fromEntries(
  POLICY_TYPES.map((t) => [t.value, t.icon])
)

export const VEHICLE_POLICY_TYPES: InsurancePolicyType[] = ['vehicle_2w', 'vehicle_4w']

export function policyTypeLabel(policyType: string | null): string {
  if (!policyType) return 'Insurance'
  return POLICY_TYPE_LABELS[policyType] ?? policyType
}
