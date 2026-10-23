import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { usersContainer, UserDoc } from '../lib/cosmos'

// Public, unauthenticated lookup — a new device needs the KDF salt/params for an
// email *before* it can derive the auth key and log in. This necessarily confirms
// whether an email is registered; acceptable for a single/family-user app, but
// worth knowing if you ever open registration to strangers.
export async function authSalt(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const email = request.query.get('email')?.trim().toLowerCase()
  if (!email) {
    return { status: 400, jsonBody: { error: 'email query parameter is required' } }
  }

  try {
    const { resources } = await usersContainer()
      .items.query<UserDoc>({
        query: 'SELECT * FROM c WHERE c.email = @email',
        parameters: [{ name: '@email', value: email }]
      })
      .fetchAll()

    if (resources.length === 0) {
      return { status: 404, jsonBody: { error: 'No account for this email' } }
    }

    const user = resources[0]
    return {
      status: 200,
      jsonBody: {
        kdfAlgorithm: user.kdfAlgorithm,
        kdfSalt: user.kdfSalt,
        kdfParams: user.kdfParams
      }
    }
  } catch (err) {
    context.error('authSalt failed', err)
    return { status: 500, jsonBody: { error: 'Internal error' } }
  }
}

app.http('authSalt', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/salt',
  handler: authSalt
})
