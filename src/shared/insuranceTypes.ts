import type { InsurancePolicyType } from './types'

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

export const POLICY_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  POLICY_TYPES.map((t) => [t.value, t.label])
)


export const VEHICLE_POLICY_TYPES: InsurancePolicyType[] = ['vehicle_2w', 'vehicle_4w']

export function policyTypeLabel(policyType: string | null): string {
  if (!policyType) return 'Insurance'
  return POLICY_TYPE_LABELS[policyType] ?? policyType
}
