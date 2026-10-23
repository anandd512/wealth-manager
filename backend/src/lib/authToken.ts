import jwt from 'jsonwebtoken'
import { HttpRequest } from '@azure/functions'

const EXPIRY = '7d'

function signingKey(): string {
  const key = process.env.JWT_SIGNING_KEY
  if (!key) throw new Error('JWT_SIGNING_KEY is not configured')
  return key
}

export function issueToken(userId: string): string {
  return jwt.sign({ sub: userId }, signingKey(), { expiresIn: EXPIRY })
}

// Proof that verifyConfirm.ts already checked this email's OTP — scoped with
// `purpose` so it can never be mistaken for (or substituted into) a session token,
// which carries `sub` instead of `email`+`purpose`.
//
// 'register': used once, immediately, to create an account — 15 minutes is plenty
// and keeps the window an attacker who somehow saw the code would have narrow.
// 'notify': the opposite shape — stored locally by a client (see
// src/main/services/notify.ts) and reused indefinitely to authorize reminder
// emails to that address, so it needs to just not expire in practice. Re-verifying
// isn't a security backstop here the way it is for 'register' (the token itself,
// not a password, is what's checked on every send), so there's no reason to force
// it — a 10-year expiry is "permanent" without the code ever claiming to be.
export type VerificationPurpose = 'register' | 'notify'

function verificationTokenExpiry(purpose: VerificationPurpose): jwt.SignOptions['expiresIn'] {
  return purpose === 'register' ? '15m' : '3650d'
}

export function issueVerificationToken(email: string, purpose: VerificationPurpose): string {
  return jwt.sign({ email, purpose }, signingKey(), { expiresIn: verificationTokenExpiry(purpose) })
}

export class UnauthorizedError extends Error {}

// Used by register.ts and notifySend.ts — throws unless the token proves *this
// specific* email was OTP-verified for *this specific* purpose.
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

// Every sync endpoint requires this — it authenticates the device without ever
// granting the server the data-encryption key, which stays local (see lib/cosmos.ts).
export function requireUserId(request: HttpRequest): string {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Missing bearer token')
  const token = header.slice('Bearer '.length)
  try {
    const payload = jwt.verify(token, signingKey()) as jwt.JwtPayload
    if (typeof payload.sub !== 'string') throw new UnauthorizedError('Invalid token')
    return payload.sub
  } catch {
    throw new UnauthorizedError('Invalid or expired token')
  }
}
