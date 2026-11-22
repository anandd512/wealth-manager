import { app } from '@azure/functions'
import { consumeCode } from '../lib/otp'
import { issueVerificationToken } from '../lib/authToken'
import { handle, HttpError, normalizeEmail, readJson } from '../lib/http'

/** POST /api/auth/verify/confirm — exchanges the emailed code for a long-lived 'notify'
 * token (see authToken.ts). One-time use; capped guesses (see lib/otp.ts). */
app.http('verifyConfirm', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/verify/confirm',
  handler: handle('verifyConfirm', async (request) => {
    const body = await readJson<{ email?: string; code?: string }>(request)
    const email = normalizeEmail(body.email)
    if (!email || !body.code) throw new HttpError(400, 'email and code are required')

    if (!(await consumeCode(email, 'notify', body.code))) throw new HttpError(401, 'Incorrect or expired code')
    return { status: 200, jsonBody: { verificationToken: issueVerificationToken(email, 'notify') } }
  })
})
