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
