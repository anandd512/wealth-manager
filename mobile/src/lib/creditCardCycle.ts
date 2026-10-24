// Ported from src/main/services/creditCards.ts + src/main/dateUtils.ts — the "due in
// Nd" badge is genuinely computed from statement_day, not read off a stored date
// column, so it can't be skipped as a trivial client-side derivation.

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function daysUntilLocalDate(targetIso: string | null | undefined, from: Date = new Date()): number | null {
  if (!targetIso) return null
  const targetMs = new Date(targetIso).getTime()
  if (isNaN(targetMs)) return null
  const fromMs = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((targetMs - fromMs) / (1000 * 60 * 60 * 24))
}

// Bills are due this many days after the statement is generated. Not stored
// per-card — a fixed, reasonable default rather than another field to fill in.
const DUE_DATE_OFFSET_DAYS = 15

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function statementDateFor(day: number, year: number, month: number): Date {
  return new Date(year, month, Math.min(day, daysInMonth(year, month)))
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// A bill only exists — and is only actionable — once its statement has generated and
// before its due date passes. Outside that window there's nothing to pay yet (the next
// statement hasn't been cut) or it's already been superseded by the next cycle. Checking
// a 3-month window (last/this/next month's statement) finds whichever cycle, if any,
// today actually falls inside.
export function computeCurrentBillingCycle(day: number, from: Date): { statementDate: Date; dueDate: Date } | null {
  const todayStart = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let offset = -1; offset <= 1; offset++) {
    const monthIndex = from.getMonth() + offset
    const year = from.getFullYear() + Math.floor(monthIndex / 12)
    const month = ((monthIndex % 12) + 12) % 12
    const statementDate = statementDateFor(day, year, month)
    const dueDate = addDays(statementDate, DUE_DATE_OFFSET_DAYS)
    if (todayStart.getTime() >= statementDate.getTime() && todayStart.getTime() <= dueDate.getTime()) {
      return { statementDate, dueDate }
    }
  }
  return null
}

/** Per-card "due in Nd" badge data, or null if the card has no statement_day, is
 * disabled, or isn't currently inside a billable window. */
export function dueDateBadge(
  statementDay: number | null,
  status: string,
  now: Date = new Date()
): { dueDate: string; daysLeft: number } | null {
  if (statementDay == null || status === 'disabled') return null
  const cycle = computeCurrentBillingCycle(statementDay, now)
  if (!cycle) return null
  const dueDate = toLocalDateString(cycle.dueDate)
  const daysLeft = daysUntilLocalDate(dueDate, now)
  if (daysLeft === null) return null
  return { dueDate, daysLeft }
}
