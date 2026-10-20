import { getDb } from '../db'
import { listPolicies } from './insurance'
import { listIdentityDocuments } from './identityDocuments'
import { getUpcomingDueDates, listCreditCards } from './creditCards'
import { getReminderSettings, getCheckInScheduleSettings } from './settings'
import { POLICY_TYPE_LABELS } from '../../shared/insuranceTypes'
import { DOC_TYPE_LABELS } from '../../shared/identityDocTypes'
import { toLocalDateString, daysUntilLocalDate } from '../dateUtils'
import type { CheckInScheduleSettings, UpcomingAction, UpcomingItem, UpcomingItemType } from '../../shared/types'

const daysUntil = daysUntilLocalDate

function isDismissed(itemType: UpcomingItemType, itemId: number, dueDate: string): boolean {
  const row = getDb()
    .prepare(
      'SELECT id FROM upcoming_dismissals WHERE item_type = ? AND item_id = ? AND due_date = ?'
    )
    .get(itemType, itemId, dueDate) as { id: number } | undefined
  return row != null
}

export function dismissUpcomingItem(
  itemType: UpcomingItemType,
  itemId: number,
  dueDate: string,
  status: UpcomingAction
): void {
  getDb()
    .prepare(
      `INSERT INTO upcoming_dismissals (item_type, item_id, due_date, status, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_type, item_id, due_date) DO UPDATE SET status = excluded.status`
    )
    .run(itemType, itemId, dueDate, status, new Date().toISOString())
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number): Date {
  const first = new Date(year, month, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  const day = 1 + offset + (occurrence - 1) * 7
  return new Date(year, month, day)
}

export function getCheckInReminderItem(
  schedule: CheckInScheduleSettings,
  windowDays: number
): UpcomingItem | null {
  if (!schedule.enabled) return null
  const now = new Date()

  const resolveDate = (year: number, month: number): Date => {
    if ((schedule.scheduleType ?? 'weekday') === 'day_of_month' && schedule.dayOfMonth) {
      return new Date(year, month, schedule.dayOfMonth)
    }
    return nthWeekdayOfMonth(year, month, schedule.weekday, schedule.occurrence)
  }

  const thisMonthDate = resolveDate(now.getFullYear(), now.getMonth())
  const thisMonthKey = toLocalDateString(thisMonthDate)

  let target = thisMonthDate
  if (isDismissed('check_in', 0, thisMonthKey)) {
    const nextMonthIndex = now.getMonth() + 1
    const year = now.getFullYear() + Math.floor(nextMonthIndex / 12)
    const month = ((nextMonthIndex % 12) + 12) % 12
    target = resolveDate(year, month)
  }

  const dueDate = toLocalDateString(target)
  const daysLeft = daysUntil(dueDate)
  if (daysLeft === null || daysLeft > windowDays) return null

  // Don't surface next month's check-in before the 1st of that month —
  // prevents "due in November" appearing while it's still October.
  const targetFirstOfMonth = new Date(target.getFullYear(), target.getMonth(), 1)
  if (now < targetFirstOfMonth) return null

  return {
    itemType: 'check_in',
    itemId: 0,
    typeLabel: 'Monthly check-in',
    title: 'Check in on your accounts',
    subtitle: 'Update balances and values so trends stay accurate',
    dueDate,
    daysLeft,
    actionLabel: 'Mark as completed'
  }
}

export function getUpcomingItems(windowDays = 45): UpcomingItem[] {
  const items: UpcomingItem[] = []

  for (const p of listPolicies()) {
    const due = p.renewal_date ?? p.expiry_date
    const d = daysUntil(due)
    if (!due || d === null || d > windowDays) continue
    if (isDismissed('insurance', p.id, due)) continue
    items.push({
      itemType: 'insurance',
      itemId: p.id,
      typeLabel: 'Insurance renewal',
      title: POLICY_TYPE_LABELS[p.policy_type ?? ''] ?? 'Insurance',
      subtitle: p.policy_number,
      dueDate: due,
      daysLeft: d,
      actionLabel: 'Dismiss'
    })
  }

  for (const doc of listIdentityDocuments()) {
    const d = daysUntil(doc.expiry_date)
    if (!doc.expiry_date || d === null || d > windowDays) continue
    if (isDismissed('identity', doc.id, doc.expiry_date)) continue
    items.push({
      itemType: 'identity',
      itemId: doc.id,
      typeLabel: 'ID expiry',
      title: DOC_TYPE_LABELS[doc.doc_type] ?? 'ID document',
      subtitle: doc.label,
      dueDate: doc.expiry_date,
      daysLeft: d,
      actionLabel: 'Dismiss'
    })
  }

  const cardsById = new Map(listCreditCards().map((c) => [c.id, c]))
  for (const cycle of getUpcomingDueDates()) {
    const card = cardsById.get(cycle.id)
    if (!card) continue
    const d = daysUntil(cycle.dueDate)
    if (d === null || d > windowDays) continue
    if (isDismissed('credit_card', card.id, cycle.dueDate)) continue
    items.push({
      itemType: 'credit_card',
      itemId: card.id,
      typeLabel: 'Credit card due',
      title: `${card.nickname} bill`,
      subtitle: card.issuer,
      dueDate: cycle.dueDate,
      daysLeft: d,
      actionLabel: 'Mark as paid'
    })
  }

  const checkInItem = getCheckInReminderItem(getCheckInScheduleSettings(), windowDays)
  if (checkInItem) items.push(checkInItem)

  items.sort((a, b) => a.daysLeft - b.daysLeft)
  return items
}

// Exposed so the reminder scheduler can reuse the same "within window" logic for
// desktop/email nudges, keeping it consistent with what the dashboard shows.
export function getReminderWindowDays(): number {
  return getReminderSettings().daysBefore
}
