import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { sendNotificationEmail } from '../lib/email'
import { requireVerifiedEmail, UnauthorizedError } from '../lib/authToken'

interface NotifySendBody {
  to: string
  subject: string
  text: string
  notifyToken: string // from POST /api/auth/verify/confirm with purpose: 'notify'
}

/** Sends a reminder email — used by the Electron app instead of requiring each user
 * to configure their own SMTP server (src/main/services/email.ts). Deliberately not
 * tied to a sync account: a fully local, no-cloud-sync user can still verify an
 * email once (same OTP flow as registration, just a different `purpose`) and get
 * reminders, since the ACS credential that can actually send email only ever lives
 * here on the server — handing it to the desktop app directly would leak a
 * send-capable Azure secret to every install. `notifyToken` only authorizes sending
 * to the exact address it was issued for, so this can't be used to relay email to
 * arbitrary third parties. */
export async function notifySend(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: NotifySendBody
  try {
    body = (await request.json()) as NotifySendBody
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } }
  }

  const to = body.to?.trim().toLowerCase()
  if (!to || !body.subject || !body.text || !body.notifyToken) {
    return { status: 400, jsonBody: { error: 'to, subject, text, notifyToken are required' } }
  }

  try {
    requireVerifiedEmail(body.notifyToken, to, 'notify')
  } catch (err) {
    if (err instanceof UnauthorizedError) return { status: 401, jsonBody: { error: err.message } }
    throw err
  }

  try {
    await sendNotificationEmail(to, body.subject, body.text)
    return { status: 200, jsonBody: { ok: true } }
  } catch (err) {
    context.error('notifySend failed', err)
    return { status: 500, jsonBody: { error: 'Internal error' } }
  }
}

app.http('notifySend', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'notify/send',
  handler: notifySend
})
