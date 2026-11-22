import { app } from '@azure/functions'
import { sendVerificationCodeEmail } from '../lib/email'
import { consumeCode, issueCode } from '../lib/otp'
import { findOrCreateUser, sessionFor } from '../lib/users'
import { handle, HttpError, normalizeEmail, readJson } from '../lib/http'

/** POST /api/auth/email/start — emails a 6-digit sign-in code. There is no password:
 * the code IS the credential. Same response whether or not the address already has an
 * account, so this can't be used to probe who's registered. */
app.http('authEmailStart', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/email/start',
  handler: handle('authEmailStart', async (request) => {
    const body = await readJson<{ email?: string }>(request)
    const email = normalizeEmail(body.email)
    if (!email) throw new HttpError(400, 'Enter a valid email address')

    const code = await issueCode(email, 'signin')
    await sendVerificationCodeEmail(email, code, 'signin')
    return { status: 200, jsonBody: { ok: true } }
  })
})

/** POST /api/auth/email/verify — a correct code signs in, creating the account on first
 * use (or finding a pre-passwordless account by its address). Returns a SessionResponse
 * (lib/users.ts). */
app.http('authEmailVerify', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/email/verify',
  handler: handle('authEmailVerify', async (request) => {
    const body = await readJson<{ email?: string; code?: string }>(request)
    const email = normalizeEmail(body.email)
    if (!email || !body.code) throw new HttpError(400, 'email and code are required')

    if (!(await consumeCode(email, 'signin', body.code))) {
      throw new HttpError(401, 'That code is incorrect or has expired')
    }
    const user = await findOrCreateUser({ provider: 'email', subject: email, email, emailVerified: true })
    return { status: 200, jsonBody: sessionFor(user) }
  })
})
