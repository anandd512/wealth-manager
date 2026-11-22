import { app } from '@azure/functions'
import { sendVerificationCodeEmail } from '../lib/email'
import { issueCode } from '../lib/otp'
import { handle, HttpError, normalizeEmail, readJson } from '../lib/http'

/** POST /api/auth/verify/request — emails a 6-digit code that verifyConfirm.ts exchanges
 * for a 'notify' token, authorizing reminder emails to that address (notifySend.ts).
 * Needs no Artha account — a local-only user can get reminders too. Sign-in codes have
 * their own endpoints (authEmail.ts). */
app.http('verifyRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/verify/request',
  handler: handle('verifyRequest', async (request) => {
    const body = await readJson<{ email?: string }>(request)
    const email = normalizeEmail(body.email)
    if (!email) throw new HttpError(400, 'A valid email is required')

    const code = await issueCode(email, 'notify')
    await sendVerificationCodeEmail(email, code, 'notify')
    return { status: 200, jsonBody: { ok: true } }
  })
})
