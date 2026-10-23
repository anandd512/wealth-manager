import { apiRequest } from './backendApi'
import { getSecret, setSecret, clearSecret } from './secrets'

/**
 * Reminder-email delivery via the backend's Azure Communication Services Email
 * (see backend/src/functions/notifySend.ts) — replaces the old per-user SMTP setup.
 * Deliberately independent of cloud sync (src/main/sync.ts): a fully local,
 * no-cloud-sync install can still get reminder emails, since all this needs is
 * proving you own an inbox once (same OTP mechanism as account registration, just
 * `purpose: 'notify'` instead of `'register'`) — no Artha account required. The
 * resulting token is long-lived (10 years — see backend's authToken.ts) and cached
 * locally (OS-keychain-backed, like everything else in secrets.ts) so this only
 * has to happen once per device.
 */

export function notifyStatus(): { verified: boolean; email: string | null } {
  const email = getSecret('notifyEmail')
  const token = getSecret('notifyToken')
  return { verified: Boolean(email && token), email }
}

export async function requestNotifyVerification(email: string): Promise<void> {
  await apiRequest('/api/auth/verify/request', { method: 'POST', body: { email, purpose: 'notify' } })
}

export async function confirmNotifyVerification(email: string, code: string): Promise<void> {
  const result = await apiRequest<{ verificationToken: string }>('/api/auth/verify/confirm', {
    method: 'POST',
    body: { email, code, purpose: 'notify' }
  })
  setSecret('notifyEmail', email)
  setSecret('notifyToken', result.verificationToken)
}

export function clearNotifyVerification(): void {
  clearSecret('notifyEmail')
  clearSecret('notifyToken')
}

export async function sendReminderEmail(subject: string, text: string): Promise<void> {
  const email = getSecret('notifyEmail')
  const token = getSecret('notifyToken')
  if (!email || !token) {
    throw new Error('Email reminders are not set up — verify an email in Settings first.')
  }
  await apiRequest('/api/notify/send', {
    method: 'POST',
    body: { to: email, subject, text, notifyToken: token }
  })
}
