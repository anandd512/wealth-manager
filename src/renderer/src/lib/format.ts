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

// A single transaction's amount is rounded to paise at write time (parseIndianAmount
// below), but the rounded-to-whole-rupee formatCurrency above would hide that last
// bit of precision — used for individual ledger rows, never the big rounded stat
// cards (which stay formatCurrency; paise-level precision is noise at that scale).
// Shows 2 decimals only when the amount actually has paise, so a whole-rupee amount
// (still the common case) doesn't grow a redundant ".00".
export function formatCurrencyPrecise(value: number, currency = 'INR'): string {
  const hasPaise = Math.round(value * 100) % 100 !== 0
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: hasPaise ? 2 : 0,
      maximumFractionDigits: 2
    }).format(value)
  } catch {
    return hasPaise ? value.toFixed(2) : value.toFixed(0)
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

// A date is shown as "12th October, 2026" everywhere in the UI — pure date strings
// (expiry_date, renewal_date, etc., plain YYYY-MM-DD with no time component) have
// their components read directly, with no Date parsing at all, so there's no risk of
// the UTC-vs-local shift described above. A full timestamp (last_updated and the
// like, which legitimately needs time precision for sync's last-write-wins) is
// parsed and reduced to its local calendar date via toLocalDateString first — only
// the display changes; the stored value keeps its time.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  let ymd = iso
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    ymd = toLocalDateString(d)
  }
  const [y, m, d] = ymd.split('-').map(Number)
  return `${ordinal(d)} ${MONTH_NAMES[m - 1]}, ${y}`
}

// A compact variant for crowded spots like chart axis ticks, e.g. "12 Oct 2026" —
// formatDate's full "12th October, 2026" is too wide once there are many ticks.
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  let ymd = iso
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    ymd = toLocalDateString(d)
  }
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${MONTH_NAMES_SHORT[m - 1]} ${y}`
}

// 'YYYY-MM' -> 'October 2026' (style 'long', the default) or 'Oct 2026' (style
// 'short', for compact spots like chart axis ticks). Used for month selectors and
// headings — never for an <input type="month"> value, which must stay raw ISO.
export function formatMonthYear(month: string, style: 'long' | 'short' = 'long'): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const [, y, m] = match
  const names = style === 'short' ? MONTH_NAMES_SHORT : MONTH_NAMES
  return `${names[Number(m) - 1]} ${y}`
}

export function todayLocalDateString(): string {
  return toLocalDateString(new Date())
}

// Accepts the way Indian users actually type amounts — "1,20,000", "₹500", "Rs. 1500" —
// instead of only bare JS-number strings. Returns null (never a silent 0) for anything
// that isn't a clean, single number, so callers can show an error instead of saving a
// wrong amount. At most 2 decimal places (paise); a bare '-' sign is allowed through so
// callers can reject negative amounts explicitly with their own message.
export function parseIndianAmount(input: string): number | null {
  let cleaned = input.trim()
  if (!cleaned) return null
  cleaned = cleaned.replace(/^(₹|Rs\.?|INR)\s*/i, '')
  cleaned = cleaned.replace(/[,\s]/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// True only for a real calendar date in plain YYYY-MM-DD form — rejects both
// malformed strings and JS's own date-rollover behavior (e.g. "2026-02-30" silently
// becoming March 2nd), by round-tripping through toLocalDateString and comparing.
export function isValidIsoDate(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00`)
  return !isNaN(d.getTime()) && toLocalDateString(d) === s
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const targetMs = new Date(iso).getTime()
  if (isNaN(targetMs)) return null
  const now = new Date()
  const fromMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((targetMs - fromMs) / (1000 * 60 * 60 * 24))
}
