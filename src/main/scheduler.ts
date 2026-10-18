import { Notification } from 'electron'
import { isUnlocked } from './db'
import { getPoliciesNeedingReminder, markReminderSent as markPolicyReminderSent } from './services/insurance'
import {
  getDocsNeedingReminder,
  markReminderSent as markDocReminderSent
} from './services/identityDocuments'
import {
  getCreditCardsNeedingReminder,
  markReminderSent as markCardReminderSent
} from './services/creditCards'
import {
  getReminderSettings,
  getCheckInScheduleSettings,
  getLastCheckInNotification,
  setLastCheckInNotification
} from './services/settings'
import { getCheckInReminderItem } from './services/upcoming'
import {
  sendPolicyReminderEmail,
  sendIdentityDocReminderEmail,
  sendCreditCardReminderEmail
} from './services/email'

let intervalHandle: NodeJS.Timeout | null = null

export async function checkReminders(): Promise<void> {
  if (!isUnlocked()) return
  const settings = getReminderSettings()

  const policies = getPoliciesNeedingReminder(settings.daysBefore)
  for (const policy of policies) {
    const label = policy.policy_type ? `${policy.policy_type} policy` : 'Insurance policy'
    const expiry = policy.expiry_date?.slice(0, 10) ?? 'unknown date'

    if (settings.desktopNotifications && Notification.isSupported()) {
      new Notification({
        title: 'Policy renewal reminder',
        body: `${label}${policy.policy_number ? ` #${policy.policy_number}` : ''} expires ${expiry}. Pay the premium to avoid lapse.`
      }).show()
    }

    if (settings.emailNotifications) {
      try {
        await sendPolicyReminderEmail(policy, settings.daysBefore)
      } catch (err) {
        console.error('Failed to send reminder email for policy', policy.id, err)
      }
    }

    markPolicyReminderSent(policy.id)
  }

  const docs = getDocsNeedingReminder(settings.daysBefore)
  for (const doc of docs) {
    const label = doc.label || doc.doc_type.replace(/_/g, ' ')
    const expiry = doc.expiry_date?.slice(0, 10) ?? 'unknown date'

    if (settings.desktopNotifications && Notification.isSupported()) {
      new Notification({
        title: 'ID document expiring',
        body: `${label} expires ${expiry}. Renew it before it lapses.`
      }).show()
    }

    if (settings.emailNotifications) {
      try {
        await sendIdentityDocReminderEmail(doc, settings.daysBefore)
      } catch (err) {
        console.error('Failed to send reminder email for document', doc.id, err)
      }
    }

    markDocReminderSent(doc.id)
  }

  const cardReminders = getCreditCardsNeedingReminder(settings.daysBefore)
  for (const { card, dueDate } of cardReminders) {
    if (settings.desktopNotifications && Notification.isSupported()) {
      new Notification({
        title: 'Credit card payment due',
        body: `${card.nickname} payment due ${dueDate}. Pay before the due date to avoid late fees.`
      }).show()
    }

    if (settings.emailNotifications) {
      try {
        await sendCreditCardReminderEmail(card, dueDate)
      } catch (err) {
        console.error('Failed to send reminder email for card', card.id, err)
      }
    }

    markCardReminderSent(card.id, dueDate)
  }

  const checkInItem = getCheckInReminderItem(getCheckInScheduleSettings(), settings.daysBefore)
  if (checkInItem && getLastCheckInNotification() !== checkInItem.dueDate) {
    if (settings.desktopNotifications && Notification.isSupported()) {
      new Notification({
        title: 'Monthly check-in reminder',
        body: 'Time to check in on your accounts and update balances.'
      }).show()
    }
    setLastCheckInNotification(checkInItem.dueDate)
  }
}

export function startScheduler(): void {
  if (intervalHandle) return
  // Check shortly after unlock, then once every 12 hours while the app is running.
  setTimeout(() => checkReminders(), 5000)
  intervalHandle = setInterval(() => checkReminders(), 12 * 60 * 60 * 1000)
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
