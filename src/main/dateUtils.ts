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
