import * as Notifications from 'expo-notifications'
import { getSetting } from '../db/kvSettingsRepo'
import { getUpcomingItems } from './upcoming'
import type { InsurancePolicy } from '../db/insuranceRepo'
import type { IdentityDocument } from '../db/identityDocsRepo'
import type { CreditCard } from '../db/creditCardsRepo'

/** Mobile had no proactive reminders at all — desktop emails renewal/due-date
 * nudges via a backend scheduler (src/main/scheduler.ts); mobile only ever showed
 * "Upcoming" if the user happened to open the Dashboard. This uses local
 * (on-device, no server/APNs) notifications instead, scheduled fresh after every
 * Dashboard sync. Reuses the SAME `daysBefore` preference as desktop's reminders
 * (reminderSettings syncs via kv_settings) so changing it on either device applies
 * to both, even though the delivery mechanism itself differs. */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
})

function reminderWindowDays(): number {
  const raw = getSetting('reminderSettings')
  if (!raw) return 30
  try {
    const parsed = JSON.parse(raw) as { daysBefore?: number }
    return parsed.daysBefore ?? 30
  } catch {
    return 30
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  const result = await Notifications.requestPermissionsAsync()
  return result.granted
}

const ID_PREFIX = 'upcoming:'

function notificationId(itemType: string, itemSyncId: string, dueDate: string): string {
  return `${ID_PREFIX}${itemType}:${itemSyncId}:${dueDate}`
}

// A single daily nudge time rather than firing the instant a sync happens to run —
// less spammy, and avoids a notification popping up mid-use of the app itself.
function nextNineAm(): Date {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
  return d
}

/** Schedules a local notification for each upcoming item inside the reminder
 * window, and cancels any previously-scheduled one that's no longer current
 * (resolved, dismissed, or its due date moved). No-ops quietly if permission was
 * never granted — never prompts on its own, see requestNotificationPermission. */
export async function syncUpcomingNotifications(
  policies: InsurancePolicy[],
  identityDocs: IdentityDocument[],
  creditCards: CreditCard[]
): Promise<void> {
  if (!(await hasNotificationPermission())) return

  const windowDays = reminderWindowDays()
  const items = getUpcomingItems(policies, identityDocs, creditCards, windowDays)
  const currentIds = new Set(items.map((i) => notificationId(i.itemType, i.itemSyncId, i.dueDate)))

  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  for (const req of scheduled) {
    if (req.identifier.startsWith(ID_PREFIX) && !currentIds.has(req.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(req.identifier)
    }
  }

  const fireAt = nextNineAm()
  for (const item of items) {
    const id = notificationId(item.itemType, item.itemSyncId, item.dueDate)
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: item.typeLabel,
        body: `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ''} — ${
          item.daysLeft <= 0 ? 'due today' : `due in ${item.daysLeft}d`
        }`
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt }
    })
  }
}
