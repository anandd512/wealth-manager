import nodemailer, { type Transporter } from 'nodemailer'
import { getSmtpConfig, getSmtpPassword } from './settings'
import { policyTypeLabel } from '../../shared/insuranceTypes'
import type { InsurancePolicy, IdentityDocument, CreditCard } from '../../shared/types'

function buildTransporter(): { transporter: Transporter; from: string; to: string } {
  const config = getSmtpConfig()
  const password = getSmtpPassword()
  if (!config.host || !config.user || !password || !config.toAddress) {
    throw new Error('SMTP is not fully configured. Fill in all fields in Settings first.')
  }
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: password }
  })
  return { transporter, from: config.fromAddress || config.user, to: config.toAddress }
}

export async function sendTestEmail(): Promise<void> {
  const { transporter, from, to } = buildTransporter()
  await transporter.sendMail({
    from,
    to,
    subject: 'Artha - test email',
    text: 'This is a test email from your Artha app. If you received this, email reminders are working.'
  })
}

export async function sendPolicyReminderEmail(policy: InsurancePolicy, daysBefore: number): Promise<void> {
  const { transporter, from, to } = buildTransporter()
  const label = `${policyTypeLabel(policy.policy_type)} policy`
  const dueDate = (policy.renewal_date ?? policy.expiry_date)?.slice(0, 10)
  await transporter.sendMail({
    from,
    to,
    subject: `Reminder: ${label} ${policy.policy_number ? `#${policy.policy_number}` : ''} due ${dueDate}`,
    text: [
      `This is a reminder that your ${label} needs renewal soon.`,
      '',
      `Policy number: ${policy.policy_number ?? 'N/A'}`,
      `Insurer: ${policy.insurer ?? 'N/A'}`,
      `Insured: ${policy.insured_name ?? 'N/A'}`,
      policy.vehicle_number ? `Vehicle number: ${policy.vehicle_number}` : null,
      `Renewal date: ${policy.renewal_date?.slice(0, 10) ?? 'N/A'}`,
      `Expiry date: ${policy.expiry_date?.slice(0, 10) ?? 'N/A'}`,
      `Premium amount: ${policy.premium_amount ?? 'N/A'}`,
      '',
      `Please pay the premium / renew before the policy lapses.`,
      `(Reminder configured for ${daysBefore} days before the due date.)`
    ]
      .filter((line) => line !== null)
      .join('\n')
  })
}

export async function sendCreditCardReminderEmail(card: CreditCard, dueDate: string): Promise<void> {
  const { transporter, from, to } = buildTransporter()
  await transporter.sendMail({
    from,
    to,
    subject: `Reminder: ${card.nickname} payment due ${dueDate}`,
    text: [
      `This is a reminder that your ${card.nickname} credit card payment is due soon.`,
      '',
      `Issuer: ${card.issuer ?? 'N/A'}`,
      `Due date: ${dueDate}`,
      '',
      `Pay the bill before the due date to avoid late fees/interest.`
    ].join('\n')
  })
}

export async function sendIdentityDocReminderEmail(
  doc: IdentityDocument,
  daysBefore: number
): Promise<void> {
  const { transporter, from, to } = buildTransporter()
  const label = doc.label || doc.doc_type.replace(/_/g, ' ')
  await transporter.sendMail({
    from,
    to,
    subject: `Reminder: ${label} expires ${doc.expiry_date?.slice(0, 10)}`,
    text: [
      `This is a reminder that your ${label} is expiring soon.`,
      '',
      `ID number: ${doc.id_number ?? 'N/A'}`,
      `Name: ${doc.full_name ?? 'N/A'}`,
      `Expiry date: ${doc.expiry_date?.slice(0, 10) ?? 'N/A'}`,
      '',
      `(Reminder configured for ${daysBefore} days before expiry.)`
    ].join('\n')
  })
}
