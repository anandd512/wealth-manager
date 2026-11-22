import { createHash, timingSafeEqual } from 'crypto'
import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { openHandoff, sealHandoff, signOAuthState, verifyOAuthState } from '../lib/authToken'
import { authorizeUrl, exchangeCode, isAllowedClientRedirect, isOAuthProvider } from '../lib/oauth'
import { findOrCreateUser, sessionFor, VerifiedIdentity } from '../lib/users'
import { handle, HttpError, readJson } from '../lib/http'

// Flow (see lib/oauth.ts for why the backend brokers it):
//   app ──GET /auth/oauth/start?provider&redirect_uri&code_challenge──▶ backend ──302──▶ provider
//   provider ──302 /auth/oauth/callback?code&state──▶ backend ──302 redirect_uri?handoff──▶ app
//   app ──POST /auth/oauth/exchange {handoff, codeVerifier}──▶ backend ──▶ SessionResponse
// The PKCE pair (RFC 7636) binds the handoff to the app instance that started the flow,
// so a handoff intercepted on its way to the app (e.g. another app claiming the same
// URL scheme) is useless on its own.

const HANDOFF_TTL_SECONDS = 180

function callbackUrl(request: HttpRequest): string {
  if (process.env.OAUTH_CALLBACK_URL) return process.env.OAUTH_CALLBACK_URL
  return `${new URL(request.url).origin}/api/auth/oauth/callback`
}

function redirect(location: string): HttpResponseInit {
  return { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } }
}

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

function errorPage(message: string): HttpResponseInit {
  const safe = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  return {
    status: 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<!doctype html><meta charset="utf-8"><title>Artha sign-in</title><body style="font-family:system-ui;max-width:420px;margin:80px auto;padding:0 16px"><h2>Sign-in didn't complete</h2><p>${safe}</p><p>Close this tab and try again from the Artha app.</p></body>`
  }
}

app.http('authOAuthStart', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/oauth/start',
  handler: async (request) => {
    const provider = request.query.get('provider')
    const redirectUri = request.query.get('redirect_uri')
    const codeChallenge = request.query.get('code_challenge')
    if (!isOAuthProvider(provider)) return errorPage('Unknown sign-in provider.')
    if (!isAllowedClientRedirect(redirectUri)) return errorPage('This sign-in link is not valid.')
    if (!codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) return errorPage('This sign-in link is not valid.')
    try {
      const state = signOAuthState({ provider, redirectUri, codeChallenge })
      return redirect(authorizeUrl(provider, callbackUrl(request), state))
    } catch (err) {
      return errorPage(err instanceof HttpError ? err.message : 'Sign-in is unavailable right now.')
    }
  }
})

app.http('authOAuthCallback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/oauth/callback',
  handler: async (request, context) => {
    let state
    try {
      state = verifyOAuthState(request.query.get('state') ?? '')
    } catch {
      return errorPage('This sign-in attempt expired. Please start again.')
    }
    // A defense-in-depth re-check: the state is signed, but the allowlist may have
    // tightened (e.g. Expo Go redirects switched off) since the flow started.
    if (!isAllowedClientRedirect(state.redirectUri)) return errorPage('This sign-in link is not valid.')

    const providerError = request.query.get('error')
    const code = request.query.get('code')
    if (providerError || !code) {
      return redirect(withParams(state.redirectUri, { error: providerError === 'access_denied' ? 'cancelled' : 'failed' }))
    }

    try {
      const identity = await exchangeCode(state.provider, code, callbackUrl(request))
      const handoff = sealHandoff({ identity, cc: state.codeChallenge }, HANDOFF_TTL_SECONDS)
      return redirect(withParams(state.redirectUri, { handoff }))
    } catch (err) {
      context.error('authOAuthCallback failed', err)
      return redirect(withParams(state.redirectUri, { error: 'failed' }))
    }
  }
})

app.http('authOAuthExchange', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/oauth/exchange',
  handler: handle('authOAuthExchange', async (request) => {
    const body = await readJson<{ handoff?: string; codeVerifier?: string }>(request)
    if (!body.handoff || !body.codeVerifier) throw new HttpError(400, 'handoff and codeVerifier are required')

    const { identity, cc } = openHandoff<{ identity: VerifiedIdentity; cc: string }>(body.handoff)
    const computed = Buffer.from(createHash('sha256').update(body.codeVerifier).digest('base64url'))
    const expected = Buffer.from(cc)
    if (computed.length !== expected.length || !timingSafeEqual(computed, expected)) {
      throw new HttpError(401, 'Sign-in could not be verified — please try again')
    }

    const user = await findOrCreateUser(identity)
    return { status: 200, jsonBody: sessionFor(user) }
  })
})
