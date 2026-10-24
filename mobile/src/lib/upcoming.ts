import type { InsurancePolicy } from '../db/insuranceRepo'
import type { IdentityDocument } from '../db/identityDocsRepo'
import type { CreditCard } from '../db/creditCardsRepo'
import { isDismissed, UpcomingItemType, UpcomingAction } from '../db/upcomingDismissalsRepo'
import { POLICY_TYPE_LABELS } from './insuranceCategories'
import { DOC_TYPE_LABELS } from './identityDocCategories'
import { dueDateBadge, daysUntilLocalDate } from './creditCardCycle'

const daysUntil = daysUntilLocalDate

export interface UpcomingItem {
  itemType: UpcomingItemType
  itemSyncId: string
  typeLabel: string
  title: string
  subtitle: string | null
  dueDate: string
  daysLeft: number
  actionLabel: string
}

/** Ported from src/main/services/upcoming.ts's getUpcomingItems — the desktop-only
 * monthly "check-in reminder" item is deliberately out of scope here (see the
 * approved UX-overhaul plan's scope note): it's tied to a separate scheduling
 * preference (getCheckInScheduleSettings) never built on mobile, so only the three
 * data-driven types (insurance renewal, ID expiry, credit card due) are ported. */
export function getUpcomingItems(
  policies: InsurancePolicy[],
  identityDocs: IdentityDocument[],
  creditCards: CreditCard[],
  windowDays = 45
): UpcomingItem[] {
  const items: UpcomingItem[] = []

  for (const p of policies) {
    const due = p.renewal_date ?? p.expiry_date
    const d = daysUntil(due)
    if (!due || d === null || d > windowDays) continue
    if (isDismissed('insurance', p.sync_id, due)) continue
    items.push({
      itemType: 'insurance',
      itemSyncId: p.sync_id,
      typeLabel: 'Insurance renewal',
      title: POLICY_TYPE_LABELS[p.policy_type ?? ''] ?? 'Insurance',
      subtitle: p.policy_number,
      dueDate: due,
      daysLeft: d,
      actionLabel: 'Dismiss'
    })
  }

  for (const doc of identityDocs) {
    const d = daysUntil(doc.expiry_date)
    if (!doc.expiry_date || d === null || d > windowDays) continue
    if (isDismissed('identity', doc.sync_id, doc.expiry_date)) continue
    items.push({
      itemType: 'identity',
      itemSyncId: doc.sync_id,
      typeLabel: 'ID expiry',
      title: DOC_TYPE_LABELS[doc.doc_type] ?? 'ID document',
      subtitle: doc.label,
      dueDate: doc.expiry_date,
      daysLeft: d,
      actionLabel: 'Dismiss'
    })
  }

  for (const card of creditCards) {
    const badge = dueDateBadge(card.statement_day, card.status)
    if (!badge || badge.daysLeft > windowDays) continue
    if (isDismissed('credit_card', card.sync_id, badge.dueDate)) continue
    items.push({
      itemType: 'credit_card',
      itemSyncId: card.sync_id,
      typeLabel: 'Credit card due',
      title: `${card.nickname} bill`,
      subtitle: card.issuer,
      dueDate: badge.dueDate,
      daysLeft: badge.daysLeft,
      actionLabel: 'Mark as paid'
    })
  }

  items.sort((a, b) => a.daysLeft - b.daysLeft)
  return items
}

export function dismissActionFor(itemType: UpcomingItemType): UpcomingAction {
  return itemType === 'credit_card' ? 'paid' : 'dismissed'
}
