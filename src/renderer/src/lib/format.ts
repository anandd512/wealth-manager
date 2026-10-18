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

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
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
