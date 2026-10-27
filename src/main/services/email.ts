import { sendReminderEmail } from '../notify'
import { policyTypeLabel } from '../../shared/insuranceTypes'
import { formatLocalDate } from '../dateUtils'
import type { InsurancePolicy, IdentityDocument, CreditCard } from '../../shared/types'

export async function sendTestEmail(): Promise<void> {
  await sendReminderEmail(
    'Artha - test email',
    'This is a test email from your Artha app. If you received this, email reminders are working.'
  )
}

export async function sendPolicyReminderEmail(policy: InsurancePolicy, daysBefore: number): Promise<void> {
  const label = `${policyTypeLabel(policy.policy_type)} policy`
  const dueDate = formatLocalDate(policy.renewal_date ?? policy.expiry_date)
  await sendReminderEmail(
    `Reminder: ${label} ${policy.policy_number ? `#${policy.policy_number}` : ''} due ${dueDate}`,
    [
      `This is a reminder that your ${label} needs renewal soon.`,
      '',
      `Policy number: ${policy.policy_number ?? 'N/A'}`,
      `Insurer: ${policy.insurer ?? 'N/A'}`,
      `Insured: ${policy.insured_name ?? 'N/A'}`,
      policy.vehicle_number ? `Vehicle number: ${policy.vehicle_number}` : null,
      `Renewal date: ${formatLocalDate(policy.renewal_date)}`,
      `Expiry date: ${formatLocalDate(policy.expiry_date)}`,
      `Premium amount: ${policy.premium_amount ?? 'N/A'}`,
      '',
      `Please pay the premium / renew before the policy lapses.`,
      `(Reminder configured for ${daysBefore} days before the due date.)`
    ]
      .filter((line) => line !== null)
      .join('\n')
  )
}

export async function sendCreditCardReminderEmail(card: CreditCard, dueDate: string): Promise<void> {
  const formattedDueDate = formatLocalDate(dueDate)
  await sendReminderEmail(
    `Reminder: ${card.nickname} payment due ${formattedDueDate}`,
    [
      `This is a reminder that your ${card.nickname} credit card payment is due soon.`,
      '',
      `Issuer: ${card.issuer ?? 'N/A'}`,
      `Due date: ${formattedDueDate}`,
      '',
      `Pay the bill before the due date to avoid late fees/interest.`
    ].join('\n')
  )
}

export async function sendIdentityDocReminderEmail(
  doc: IdentityDocument,
  daysBefore: number
): Promise<void> {
  const label = doc.label || doc.doc_type.replace(/_/g, ' ')
  await sendReminderEmail(
    `Reminder: ${label} expires ${formatLocalDate(doc.expiry_date)}`,
    [
      `This is a reminder that your ${label} is expiring soon.`,
      '',
      `ID number: ${doc.id_number ?? 'N/A'}`,
      `Name: ${doc.full_name ?? 'N/A'}`,
      `Expiry date: ${formatLocalDate(doc.expiry_date)}`,
      '',
      `(Reminder configured for ${daysBefore} days before expiry.)`
    ].join('\n')
  )
}
