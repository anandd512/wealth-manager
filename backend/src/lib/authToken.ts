import jwt from 'jsonwebtoken'
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto'
import { HttpRequest } from '@azure/functions'

// Session lifetime. Every device keeps the Data Key locally, so an expired session
// only means signing in again (Google/Microsoft/email code) — never re-entering the
// recovery key.
const EXPIRY = '30d'

function signingKey(): string {
  const key = process.env.JWT_SIGNING_KEY
  if (!key) throw new Error('JWT_SIGNING_KEY is not configured')
  return key
}

export function issueToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: 'session' }, signingKey(), { expiresIn: EXPIRY })
}

// Proof that verifyConfirm.ts already checked this email's OTP. 'notify' tokens are
// stored by a client (see src/main/notify.ts) and reused indefinitely to authorize
// reminder emails to that address, so they effectively don't expire — re-verifying
// isn't a security backstop here (the token itself is what's checked on every send).
export type VerificationPurpose = 'notify'

export function issueVerificationToken(email: string, purpose: VerificationPurpose): string {
  return jwt.sign({ email, purpose }, signingKey(), { expiresIn: '3650d' })
}

export class UnauthorizedError extends Error {}

// Used by notifySend.ts — throws unless the token proves *this specific* email was
// OTP-verified for *this specific* purpose.
export function requireVerifiedEmail(token: string, email: string, purpose: VerificationPurpose): void {
  let payload: jwt.JwtPayload
  try {
    payload = jwt.verify(token, signingKey()) as jwt.JwtPayload
  } catch {
    throw new UnauthorizedError('Email verification expired — request a new code')
  }
  if (payload.purpose !== purpose || payload.email !== email) {
    throw new UnauthorizedError('Email verification does not match this email')
  }
}

// Every sync/key/device endpoint requires this — it authenticates the device without
// ever granting the server the data-encryption key, which stays on devices.
export function requireUserId(request: HttpRequest): string {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Missing bearer token')
  const token = header.slice('Bearer '.length)
  let payload: jwt.JwtPayload
  try {
    payload = jwt.verify(token, signingKey()) as jwt.JwtPayload
  } catch {
    throw new UnauthorizedError('Invalid or expired token')
  }
  // Sessions issued before `purpose` existed carry only `sub`; anything with a
  // different purpose (an OAuth state, a notify token) is never a session.
  if (typeof payload.sub !== 'string' || (payload.purpose !== undefined && payload.purpose !== 'session')) {
    throw new UnauthorizedError('Invalid token')
  }
  return payload.sub
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────

/** Round-trips through Google/Microsoft as the OAuth `state` parameter, so the callback
 * knows which client redirect and PKCE challenge the flow belongs to without any
 * server-side session storage. Signed, so it can't be forged or altered. */
export interface OAuthState {
  provider: 'google' | 'microsoft'
  redirectUri: string
  codeChallenge: string
}

export function signOAuthState(state: OAuthState): string {
  return jwt.sign({ ...state, purpose: 'oauth-state' }, signingKey(), { expiresIn: '10m' })
}

export function verifyOAuthState(token: string): OAuthState {
  const payload = jwt.verify(token, signingKey()) as jwt.JwtPayload
  if (payload.purpose !== 'oauth-state') throw new UnauthorizedError('Invalid state')
  return { provider: payload.provider, redirectUri: payload.redirectUri, codeChallenge: payload.codeChallenge }
}

// The handoff travels in a redirect URL (to the desktop app's loopback listener or the
// mobile app's deep link), so it's sealed rather than merely signed — the identity it
// carries (including the email address) isn't readable from browser history or logs.
// It's only redeemable together with the PKCE verifier the client kept to itself.
function handoffKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', signingKey(), Buffer.alloc(0), 'artha-oauth-handoff', 32))
}

export function sealHandoff(payload: object, ttlSeconds: number): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', handoffKey(), iv)
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 }), 'utf-8')
  const ciphertext = Buffer.concat([cipher.update(body), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

export function openHandoff<T>(sealed: string): T {
  try {
    const blob = Buffer.from(sealed, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', handoffKey(), blob.subarray(0, 12))
    decipher.setAuthTag(blob.subarray(12, 28))
    const body = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()])
    const payload = JSON.parse(body.toString('utf-8')) as T & { exp: number }
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) throw new Error('expired')
    return payload
  } catch {
    throw new UnauthorizedError('Sign-in link expired — please try again')
  }
}
