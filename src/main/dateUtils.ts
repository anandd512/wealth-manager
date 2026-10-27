// `Date#toISOString()` converts to UTC — for positive-UTC-offset timezones (IST and most
// of Asia/Australia) that silently shifts "today" back by a calendar day for roughly
// 18+ hours of the local day. Any code that needs "today" or a specific local calendar
// date as a YYYY-MM-DD string must go through these helpers instead, which stay anchored
// to local date components the whole way through.

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayLocalDateString(): string {
  return toLocalDateString(new Date())
}

// Whole-day difference between a stored date (date-only strings are UTC-midnight per the
// ECMA spec, which is exactly what toLocalDateString produces) and "today" in local time.
// Both sides are anchored to UTC-midnight-of-their-calendar-date before subtracting, so the
// division by a day in milliseconds is always an exact integer — no timezone-driven drift.
export function daysUntilLocalDate(targetIso: string | null | undefined, from: Date = new Date()): number | null {
  if (!targetIso) return null
  const targetMs = new Date(targetIso).getTime()
  if (isNaN(targetMs)) return null
  const fromMs = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((targetMs - fromMs) / (1000 * 60 * 60 * 24))
}

// True only for a real calendar date in plain YYYY-MM-DD form — rejects malformed
// strings and JS's date-rollover behavior (e.g. "2026-02-30" silently becoming
// March 2nd) by round-tripping through toLocalDateString and comparing.
export function isValidLocalDate(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00`)
  return !isNaN(d.getTime()) && toLocalDateString(d) === s
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`
  switch (day % 10) {
    case 1: return `${day}st`
    case 2: return `${day}nd`
    case 3: return `${day}rd`
    default: return `${day}th`
  }
}

// Main-process counterpart to renderer/src/lib/format.ts's formatDate (same "12th
// October, 2026" style) — used wherever a human-readable date needs to go into an
// email body or desktop notification, which never goes through the renderer at all.
// Deliberately not shared code between the two processes (see format.ts's own
// toLocalDateString duplication note) — this one only needs to handle plain
// YYYY-MM-DD strings, not the timestamp/short-format variants the UI also needs.
export function formatLocalDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  let ymd = iso
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    ymd = toLocalDateString(d)
  }
  const [y, m, day] = ymd.split('-').map(Number)
  return `${ordinal(day)} ${MONTH_NAMES[m - 1]}, ${y}`
}
