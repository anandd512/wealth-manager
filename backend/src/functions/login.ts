import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { usersContainer, UserDoc } from '../lib/cosmos'
import { checkVerifier } from '../lib/verifier'
import { issueToken } from '../lib/authToken'

interface LoginBody {
  email: string
  authKey: string // base64, client-derived from the master password via scrypt
}

export async function login(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: LoginBody
  try {
    body = (await request.json()) as LoginBody
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } }
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !body.authKey) {
    return { status: 400, jsonBody: { error: 'email and authKey are required' } }
  }

  try {
    const { resources } = await usersContainer()
      .items.query<UserDoc>({
        query: 'SELECT * FROM c WHERE c.email = @email',
        parameters: [{ name: '@email', value: email }]
      })
      .fetchAll()

    const user = resources[0]
    // Same error for "no such user" and "wrong authKey" — don't let login responses
    // reveal which half of the credential was wrong.
    if (!user || !checkVerifier(body.authKey, user)) {
      return { status: 401, jsonBody: { error: 'Invalid email or password' } }
    }

    return { status: 200, jsonBody: { userId: user.id, token: issueToken(user.id) } }
  } catch (err) {
    context.error('login failed', err)
    return { status: 500, jsonBody: { error: 'Internal error' } }
  }
}

app.http('login', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: login
})
