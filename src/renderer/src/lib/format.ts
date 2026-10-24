export function formatCurrency(value: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(value)
  } catch {
    return value.toFixed(0)
  }
}

// `Date#toISOString()` is UTC-based, which silently shifts "today" back a calendar day
// for positive-UTC-offset timezones (IST and most of Asia/Australia) during local hours
// before the UTC day rolls over. These stay anchored to local date components throughout.
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Every date shown in the UI is plain YYYY-MM-DD, no time component — a pure date
// string (expiry_date, renewal_date, etc.) is returned as-is, with no Date parsing
// at all, so there's no risk of the UTC-vs-local shift described above. A full
// timestamp (last_updated and the like, which legitimately needs time precision for
// sync's last-write-wins) is parsed and reduced to its local calendar date via
// toLocalDateString — only the display changes; the stored value keeps its time.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return toLocalDateString(d)
}

export function todayLocalDateString(): string {
  return toLocalDateString(new Date())
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const targetMs = new Date(iso).getTime()
  if (isNaN(targetMs)) return null
  const now = new Date()
  const fromMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((targetMs - fromMs) / (1000 * 60 * 60 * 24))
}
