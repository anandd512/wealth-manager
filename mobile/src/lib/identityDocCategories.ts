// Ported from src/shared/identityDocTypes.ts.

export type IdentityDocType = 'aadhaar' | 'pan' | 'passport' | 'driving_license' | 'voter_id' | 'birth_certificate' | 'rc' | 'other'

// expiryLabel is null for document types that don't expire in practice (Aadhaar, PAN,
// Voter ID, Birth Certificate) — the Expiry field is hidden entirely for those. For
// RC, what actually has a renewal date is the vehicle's Fitness Certificate, not the
// RC itself, so the field is labeled accordingly rather than generically "Expiry".
export const DOC_TYPES: { value: IdentityDocType; label: string; icon: string; expiryLabel: string | null }[] = [
  { value: 'aadhaar', label: 'Aadhaar', icon: '🪪', expiryLabel: null },
  { value: 'pan', label: 'PAN', icon: '🪪', expiryLabel: null },
  { value: 'passport', label: 'Passport', icon: '📘', expiryLabel: 'Expiry' },
  { value: 'driving_license', label: 'Driving License', icon: '🚘', expiryLabel: 'Expiry' },
  { value: 'voter_id', label: 'Voter ID', icon: '🗳️', expiryLabel: null },
  { value: 'birth_certificate', label: 'Birth Certificate', icon: '📜', expiryLabel: null },
  { value: 'rc', label: 'Registration Certificate (RC)', icon: '📋', expiryLabel: 'Fitness expiry' },
  { value: 'other', label: 'Other', icon: '📄', expiryLabel: 'Expiry' }
]

export const DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(DOC_TYPES.map((t) => [t.value, t.label]))
export const DOC_TYPE_ICONS: Record<string, string> = Object.fromEntries(DOC_TYPES.map((t) => [t.value, t.icon]))
export const DOC_TYPE_EXPIRY_LABELS: Record<string, string | null> = Object.fromEntries(
  DOC_TYPES.map((t) => [t.value, t.expiryLabel])
)

export const VEHICLE_CLASS_DOC_TYPES: IdentityDocType[] = ['driving_license', 'rc']
