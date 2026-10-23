import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { verificationsContainer, VerificationDoc } from '../lib/cosmos'
import { issueVerificationToken, VerificationPurpose } from '../lib/authToken'

interface VerifyConfirmBody {
  email: string
  code: string
  purpose?: VerificationPurpose // must match whatever verifyRequest.ts was called with
}

/** Exchanges the emailed code for a token scoped to `purpose` — see authToken.ts for
 * what each purpose is used for and how long its token lasts. One-time use: the code
 * is deleted on a correct match, so it can't be replayed even within its window. */
export async function verifyConfirm(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: VerifyConfirmBody
  try {
    body = (await request.json()) as VerifyConfirmBody
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } }
  }

  const email = body.email?.trim().toLowerCase()
  const purpose: VerificationPurpose = body.purpose === 'notify' ? 'notify' : 'register'
  if (!email || !body.code) {
    return { status: 400, jsonBody: { error: 'email and code are required' } }
  }

  const container = verificationsContainer()
  try {
    const { resource: doc } = await container.item(email, email).read<VerificationDoc>()
    // Same error whether the code never existed, already expired (Cosmos TTL swept
    // it), or just doesn't match — don't let the response distinguish those cases.
    if (!doc || doc.code !== body.code) {
      return { status: 401, jsonBody: { error: 'Incorrect or expired code' } }
    }

    await container.item(email, email).delete()
    return { status: 200, jsonBody: { verificationToken: issueVerificationToken(email, purpose) } }
  } catch (err) {
    context.error('verifyConfirm failed', err)
    return { status: 500, jsonBody: { error: 'Internal error' } }
  }
}

app.http('verifyConfirm', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/verify/confirm',
  handler: verifyConfirm
})
