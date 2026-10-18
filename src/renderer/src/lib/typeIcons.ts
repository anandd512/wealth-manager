import type { LucideIcon } from 'lucide-react'
import {
  IdCard,
  BookOpen,
  Car,
  Vote,
  FileText,
  ClipboardList,
  File,
  ShieldCheck,
  HeartPulse,
  Stethoscope,
  Bike,
  Home,
  Plane,
  Activity,
  CreditCard,
  CalendarCheck
} from 'lucide-react'
import type { UpcomingItemType } from '../../../shared/types'

// Renderer-only icon maps, keyed by the same identifiers used in shared/identityDocTypes.ts
// and shared/insuranceTypes.ts. Kept separate from those shared files since this module
// pulls in React components and shared/ is also compiled for the (non-React) main process.
export const DOC_TYPE_ICON_COMPONENTS: Record<string, LucideIcon> = {
  aadhaar: IdCard,
  pan: IdCard,
  passport: BookOpen,
  driving_license: Car,
  voter_id: Vote,
  birth_certificate: FileText,
  rc: ClipboardList,
  other: File
}

export function getDocTypeIcon(docType: string): LucideIcon {
  return DOC_TYPE_ICON_COMPONENTS[docType] ?? File
}

export const POLICY_TYPE_ICON_COMPONENTS: Record<string, LucideIcon> = {
  term_life: ShieldCheck,
  life: HeartPulse,
  health: Stethoscope,
  vehicle_2w: Bike,
  vehicle_4w: Car,
  home: Home,
  travel: Plane,
  personal_accident: Activity,
  other: FileText
}

export function getPolicyTypeIcon(policyType: string | null): LucideIcon {
  return POLICY_TYPE_ICON_COMPONENTS[policyType ?? ''] ?? FileText
}

export const UPCOMING_TYPE_ICONS: Record<UpcomingItemType, LucideIcon> = {
  insurance: ShieldCheck,
  identity: IdCard,
  credit_card: CreditCard,
  check_in: CalendarCheck
}

export function getUpcomingTypeIcon(itemType: UpcomingItemType): LucideIcon {
  return UPCOMING_TYPE_ICONS[itemType] ?? FileText
}
