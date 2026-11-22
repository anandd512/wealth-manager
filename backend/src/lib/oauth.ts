import { HttpError } from './http'
import { VerifiedIdentity } from './users'

/**
 * Google and Microsoft sign-in, brokered by this backend.
 *
 * Both apps (desktop and mobile) open the provider in a browser via
 * GET /api/auth/oauth/start; the provider redirects back HERE (a plain https callback,
 * which both providers accept for a "web" client), this backend exchanges the code
 * using a client secret that only lives in Key Vault, then redirects on to the app with
 * a short-lived sealed handoff. Doing the exchange server-side is what makes this work
 * from Expo Go — Google won't redirect straight to an `exp://` URL — and keeps client
 * secrets out of every install.
 *
 * The ID token comes straight from the provider's token endpoint over TLS, so per OIDC
 * Core §3.1.3.7 (6) its issuer is established by TLS rather than by re-checking the
 * signature; issuer, audience and expiry are still checked below.
 */
export type OAuthProvider = 'google' | 'microsoft'

// Microsoft's fixed tenant id for personal (outlook.com / hotmail / live) accounts.
// Microsoft verifies those addresses itself; work/school tenants can put any address
// in the `email` claim unless they've proven the domain (`xms_edov`).
const MICROSOFT_CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad'

interface ProviderConfig {
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
}

function env(name: string): string {
  const value = process.env[name]
  // An unresolved Key Vault reference (the secret hasn't been created yet) arrives as
  // its literal "@Microsoft.KeyVault(...)" text — treat that as unset, not as a secret.
  if (!value || value.startsWith('@Microsoft.KeyVault(')) {
    throw new HttpError(503, `${name} is not configured on the server`)
  }
  return value
}

function config(provider: OAuthProvider): ProviderConfig {
  if (provider === 'google') {
    return {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: env('GOOGLE_CLIENT_ID'),
      clientSecret: env('GOOGLE_CLIENT_SECRET')
    }
  }
  return {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: env('MICROSOFT_CLIENT_ID'),
    clientSecret: env('MICROSOFT_CLIENT_SECRET')
  }
}

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === 'google' || value === 'microsoft'
}

export function authorizeUrl(provider: OAuthProvider, callbackUrl: string, state: string): string {
  const c = config(provider)
  const url = new URL(c.authorizeUrl)
  url.searchParams.set('client_id', c.clientId)
  url.searchParams.set('redirect_uri', callbackUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  if (provider === 'microsoft') url.searchParams.set('response_mode', 'query')
  return url.toString()
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new HttpError(502, 'Malformed ID token from provider')
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf-8'))
}

export async function exchangeCode(provider: OAuthProvider, code: string, callbackUrl: string): Promise<VerifiedIdentity> {
  const c = config(provider)
  const response = await fetch(c.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      ...(provider === 'microsoft' ? { scope: 'openid email profile' } : {})
    })
  })
  const json = (await response.json().catch(() => ({}))) as { id_token?: string; error_description?: string }
  if (!response.ok || !json.id_token) {
    throw new HttpError(502, json.error_description ?? 'The sign-in provider rejected the request')
  }

  const claims = decodeJwtPayload(json.id_token)
  const now = Math.floor(Date.now() / 1000)
  if (claims.aud !== c.clientId || typeof claims.exp !== 'number' || claims.exp < now - 60) {
    throw new HttpError(502, 'ID token failed validation')
  }
  if (typeof claims.sub !== 'string' || !claims.sub) throw new HttpError(502, 'ID token has no subject')

  const rawEmail =
    typeof claims.email === 'string'
      ? claims.email
      : provider === 'microsoft' && typeof claims.preferred_username === 'string' && claims.preferred_username.includes('@')
        ? claims.preferred_username
        : null
  const email = rawEmail ? rawEmail.trim().toLowerCase() : null

  if (provider === 'google') {
    if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') {
      throw new HttpError(502, 'ID token failed validation')
    }
    return {
      provider,
      subject: claims.sub,
      email,
      emailVerified: Boolean(email) && (claims.email_verified === true || claims.email_verified === 'true')
    }
  }

  const tid = typeof claims.tid === 'string' ? claims.tid : ''
  if (claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) {
    throw new HttpError(502, 'ID token failed validation')
  }
  const edov = claims.xms_edov === true || claims.xms_edov === 'true' || claims.xms_edov === 1
  return {
    provider,
    // `sub` is pairwise (unique per user per app) and stable for this app registration.
    subject: claims.sub,
    email,
    emailVerified: Boolean(email) && typeof claims.email === 'string' && (tid === MICROSOFT_CONSUMER_TENANT || edov)
  }
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

/**
 * Where the backend may send a sign-in handoff. Anything else is refused outright —
 * an open redirect here would let an attacker start a flow with their own PKCE pair,
 * get a victim to finish it, and collect the victim's session.
 *  - http://127.0.0.1:<any port>/callback — the desktop app's one-shot loopback
 *    listener (RFC 8252 §7.3). Only a process on the user's own machine can receive it.
 *  - artha://auth — the mobile app's own scheme (development / store builds).
 *  - exp://<private-network host>/--/auth — Expo Go during development, which loads the
 *    app from the developer's machine on the LAN. Set ALLOW_EXPO_GO_REDIRECTS=false once
 *    the mobile app ships as a real build.
 */
export function isAllowedClientRedirect(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 512) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol === 'http:') {
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.pathname === '/callback' && url.port !== ''
  }
  if (url.protocol === 'artha:') return raw.startsWith('artha://auth')
  if (url.protocol === 'exp:') {
    return process.env.ALLOW_EXPO_GO_REDIRECTS !== 'false' && isPrivateHost(url.hostname) && url.pathname.endsWith('/--/auth')
  }
  return false
}
