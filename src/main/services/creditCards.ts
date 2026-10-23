import { randomUUID } from 'crypto'
import { getDb } from '../db'
import { toLocalDateString, daysUntilLocalDate } from '../dateUtils'
import type { CreditCard, CreditCardInput } from '../../shared/types'

export function listCreditCards(): CreditCard[] {
  return getDb().prepare('SELECT * FROM credit_cards WHERE deleted = 0 ORDER BY nickname').all() as CreditCard[]
}

export function getCreditCard(id: number): CreditCard | undefined {
  return getDb().prepare('SELECT * FROM credit_cards WHERE id = ?').get(id) as
    | CreditCard
    | undefined
}

export function createCreditCard(input: CreditCardInput): CreditCard {
  const now = new Date().toISOString()
  const info = getDb()
    .prepare(
      `INSERT INTO credit_cards
        (nickname, network, issuer, card_number, name_on_card, expiry_month, expiry_year,
         cvv, credit_limit, statement_day, notes, status, created_at, sync_id, updated_at)
       VALUES (@nickname, @network, @issuer, @card_number, @name_on_card, @expiry_month, @expiry_year,
               @cvv, @credit_limit, @statement_day, @notes, @status, @created_at, @sync_id, @updated_at)`
    )
    .run({ ...input, status: input.status ?? 'active', created_at: now, sync_id: randomUUID(), updated_at: now })
  return getCreditCard(Number(info.lastInsertRowid))!
}

export function updateCreditCard(id: number, input: Partial<CreditCardInput>): CreditCard {
  const existing = getCreditCard(id)
  if (!existing) throw new Error('Card not found')
  const merged = { ...existing, ...input, updated_at: new Date().toISOString() }
  getDb()
    .prepare(
      `UPDATE credit_cards SET
        nickname=@nickname, network=@network, issuer=@issuer, card_number=@card_number,
        name_on_card=@name_on_card, expiry_month=@expiry_month, expiry_year=@expiry_year,
        cvv=@cvv, credit_limit=@credit_limit,
        statement_day=@statement_day, notes=@notes, status=@status, updated_at=@updated_at
       WHERE id=@id`
    )
    .run({ ...merged, id })
  return getCreditCard(id)!
}

// Soft delete — see src/main/services/accounts.ts's deleteAccount for why.
export function deleteCreditCard(id: number): void {
  getDb()
    .prepare('UPDATE credit_cards SET deleted = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
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
export function computeCurrentBillingCycle(
  day: number,
  from: Date
): { statementDate: Date; dueDate: Date } | null {
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

// Every card currently inside a billable window (statement generated, not yet past due) —
// used to surface actionable bills on the dashboard/credit cards page. A card outside that
// window has nothing due right now, so it's omitted rather than showing a date far off.
export function getUpcomingDueDates(): { id: number; statementDate: string; dueDate: string }[] {
  const now = new Date()
  const results: { id: number; statementDate: string; dueDate: string }[] = []
  for (const card of listCreditCards()) {
    if (card.statement_day == null || card.status === 'disabled') continue
    const cycle = computeCurrentBillingCycle(card.statement_day, now)
    if (!cycle) continue
    results.push({
      id: card.id,
      statementDate: toLocalDateString(cycle.statementDate),
      dueDate: toLocalDateString(cycle.dueDate)
    })
  }
  return results
}

export function markReminderSent(id: number, dueDateIso: string): void {
  getDb().prepare('UPDATE credit_cards SET last_reminder_sent = ? WHERE id = ?').run(dueDateIso, id)
}

export function getCreditCardsNeedingReminder(
  daysBefore: number
): { card: CreditCard; dueDate: string }[] {
  const all = listCreditCards()
  const now = new Date()
  const results: { card: CreditCard; dueDate: string }[] = []
  for (const card of all) {
    if (!card.statement_day || card.status === 'disabled') continue
    const cycle = computeCurrentBillingCycle(card.statement_day, now)
    if (!cycle) continue
    const dueIso = toLocalDateString(cycle.dueDate)
    const daysLeft = daysUntilLocalDate(dueIso, now)
    if (daysLeft === null || daysLeft > daysBefore) continue
    if (card.last_reminder_sent === dueIso) continue
    results.push({ card, dueDate: dueIso })
  }
  return results
}
