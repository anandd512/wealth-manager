import { randomUUID } from 'crypto'
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { usersContainer, UserDoc } from '../lib/cosmos'
import { createVerifier } from '../lib/verifier'
import { issueToken, requireVerifiedEmail, UnauthorizedError } from '../lib/authToken'

interface RegisterBody {
  email: string
  kdfSalt: string
  kdfParams: { N: number; r: number; p: number }
  authKey: string // base64, client-derived — see lib/verifier.ts for why this is safe to send
  verificationToken: string // from POST /api/auth/verify/confirm — proves this email was OTP-verified
}

export async function register(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: RegisterBody
  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } }
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !body.kdfSalt || !body.kdfParams || !body.authKey || !body.verificationToken) {
    return {
      status: 400,
      jsonBody: { error: 'email, kdfSalt, kdfParams, authKey, verificationToken are required' }
    }
  }

  try {
    requireVerifiedEmail(body.verificationToken, email, 'register')
  } catch (err) {
    if (err instanceof UnauthorizedError) return { status: 401, jsonBody: { error: err.message } }
    throw err
  }

  const container = usersContainer()
  const existing = await container.items
    .query<number>({
      query: 'SELECT VALUE COUNT(1) FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email }]
    })
    .fetchAll()
  if ((existing.resources[0] ?? 0) > 0) {
    return { status: 409, jsonBody: { error: 'An account with this email already exists' } }
  }

  const { authVerifierSalt, authVerifier } = createVerifier(body.authKey)
  const user: UserDoc = {
    id: randomUUID(),
    email,
    kdfAlgorithm: 'scrypt',
    kdfSalt: body.kdfSalt,
    kdfParams: body.kdfParams,
    authVerifierSalt,
    authVerifier,
    createdAt: new Date().toISOString()
  }

  try {
    await container.items.create(user)
  } catch (err) {
    context.error('register failed', err)
    return { status: 500, jsonBody: { error: 'Internal error' } }
  }

  return { status: 201, jsonBody: { userId: user.id, token: issueToken(user.id) } }
}

app.http('register', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/register',
  handler: register
})
