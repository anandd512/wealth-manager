import { randomInt } from 'crypto'
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { usersContainer, verificationsContainer, VerificationDoc } from '../lib/cosmos'
import { sendVerificationCodeEmail } from '../lib/email'
import { VerificationPurpose } from '../lib/authToken'

const CODE_TTL_SECONDS = 15 * 60

interface VerifyRequestBody {
  email: string
  // 'register' (default, for backward compatibility with callers that predate this
  // field): the email must not already have an account. 'notify': used to authorize
  // reminder emails (see notifySend.ts) — verifying an address doesn't require an
  // Artha account at all, so that check is skipped.
  purpose?: VerificationPurpose
}

/** Sends a 6-digit code to the email, which verifyConfirm.ts then exchanges for a
 * token scoped to whatever `purpose` the caller asked for — see authToken.ts.
 * Never tells the caller whether the email is new or already registered via timing
 * or response shape beyond this one explicit check, to avoid casually confirming
 * account existence to anyone who just has an email address. */
export async function verifyRequest(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: VerifyRequestBody
  try {
    body = (await request.json()) as VerifyRequestBody
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } }
  }

  const email = body.email?.trim().toLowerCase()
  const purpose: VerificationPurpose = body.purpose === 'notify' ? 'notify' : 'register'
  if (!email || !email.includes('@')) {
    return { status: 400, jsonBody: { error: 'A valid email is required' } }
  }

  try {
    if (purpose === 'register') {
      const { resources: existing } = await usersContainer()
        .items.query<number>({
          query: 'SELECT VALUE COUNT(1) FROM c WHERE c.email = @email',
          parameters: [{ name: '@email', value: email }]
        })
        .fetchAll()
      if ((existing[0] ?? 0) > 0) {
        return { status: 409, jsonBody: { error: 'An account with this email already exists' } }
      }
    }

    const code = randomInt(100000, 1000000).toString() // always 6 digits
    const doc: VerificationDoc = {
      id: email,
      code,
      createdAt: new Date().toISOString(),
      ttl: CODE_TTL_SECONDS
    }
    await verificationsContainer().items.upsert(doc)
    await sendVerificationCodeEmail(email, code)

    return { status: 200, jsonBody: { ok: true } }
  } catch (err) {
    context.error('verifyRequest failed', err)
    return { status: 500, jsonBody: { error: 'Internal error' } }
  }
}

app.http('verifyRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/verify/request',
  handler: verifyRequest
})
