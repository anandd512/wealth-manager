export type PeriodType = 'month' | 'quarter' | 'fy' | 'ytd' | 'custom'

export interface PeriodRange {
  start: string // YYYY-MM-DD, inclusive
  end: string
  label: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Indian financial year: 1 April - 31 March, named by its starting calendar year
// (e.g. "FY 2026-27" for Apr 2026 - Mar 2027).
export function fyRangeFor(dateIso: string): PeriodRange {
  const [y, m] = dateIso.split('-').map(Number)
  const fyStartYear = m >= 4 ? y : y - 1
  return {
    start: `${fyStartYear}-04-01`,
    end: `${fyStartYear + 1}-03-31`,
    label: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`
  }
}

export function quarterRangeFor(dateIso: string): PeriodRange {
  const [y, m] = dateIso.split('-').map(Number)
  const q = Math.floor((m - 1) / 3)
  const startMonth = q * 3 + 1
  const endMonth = startMonth + 2
  const endDay = new Date(y, endMonth, 0).getDate() // day 0 of next month = last day of endMonth
  return {
    start: `${y}-${pad(startMonth)}-01`,
    end: `${y}-${pad(endMonth)}-${pad(endDay)}`,
    label: `Q${q + 1} ${y}`
  }
}

export function ytdRangeFor(dateIso: string): PeriodRange {
  const [y] = dateIso.split('-').map(Number)
  return { start: `${y}-01-01`, end: dateIso, label: `${y} year to date` }
}

export function monthRangeFor(month: string): PeriodRange {
  const [y, m] = month.split('-').map(Number)
  const endDay = new Date(y, m, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${pad(endDay)}`, label: month }
}

// Shifts a YYYY-MM month by `delta` months (negative goes back).
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

// How far the ‹ › arrows move for each period type — null where stepping makes no
// sense (YTD is always "this year so far"; a custom range has no natural step).
export const PERIOD_STEP_MONTHS: Record<PeriodType, number | null> = {
  month: 1,
  quarter: 3,
  fy: 12,
  ytd: null,
  custom: null
}

// The period immediately before the one on screen, so every "vs …" comparison is
// like-for-like (a quarter against the previous quarter, never against one month).
// YTD compares against the same dates last year. Custom ranges get no comparison.
export function previousRangeFor(
  type: PeriodType,
  selectedMonth: string,
  today: string
): { range: PeriodRange; label: string } | null {
  if (type === 'month') return { range: monthRangeFor(shiftMonth(selectedMonth, -1)), label: 'last month' }
  if (type === 'quarter') return { range: quarterRangeFor(`${shiftMonth(selectedMonth, -3)}-01`), label: 'last quarter' }
  if (type === 'fy') return { range: fyRangeFor(`${shiftMonth(selectedMonth, -12)}-01`), label: 'last FY' }
  if (type === 'ytd') {
    const lastYear = Number(today.slice(0, 4)) - 1
    return {
      range: { start: `${lastYear}-01-01`, end: `${lastYear}${today.slice(4)}`, label: `${lastYear} year to date` },
      label: 'same period last year'
    }
  }
  return null
}

// Number of months a period spans, for scaling monthly budgets and the monthly
// savings goal to the period on screen. Partial periods (YTD, custom) are measured
// in days so a 10-day range doesn't get a full month's budget.
export function monthsInRange(type: PeriodType, range: PeriodRange): number {
  if (type === 'month') return 1
  if (type === 'quarter') return 3
  if (type === 'fy') return 12
  const days = (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1
  return Math.max(0, days) / (365.25 / 12)
}

// Short phrase for the period on screen, used in "₹X reached this month"-style copy.
export function periodPhrase(type: PeriodType): string {
  if (type === 'month') return 'this month'
  if (type === 'quarter') return 'this quarter'
  if (type === 'fy') return 'this FY'
  if (type === 'ytd') return 'so far this year'
  return 'in this range'
}
