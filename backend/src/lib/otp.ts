import { randomInt, timingSafeEqual } from 'crypto'
import { verificationsContainer, VerificationDoc } from './cosmos'
import { HttpError } from './http'

// Emailed one-time codes. Used for passwordless sign-in ('signin') and for authorizing
// reminder emails to an address ('notify'). Since a 'signin' code is a full login
// credential, guessing is capped: 5 wrong tries burns the code (1-in-200,000 odds per
// code), and a new code can't be requested more than once every 30 seconds.
export type OtpPurpose = 'signin' | 'notify'

const CODE_TTL_SECONDS = 15 * 60
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 30 * 1000

function docId(purpose: OtpPurpose, email: string): string {
  return `${purpose}:${email}`
}

async function readDoc(id: string): Promise<VerificationDoc | undefined> {
  const { resource } = await verificationsContainer()
    .item(id, id)
    .read<VerificationDoc>()
    .catch(() => ({ resource: undefined }))
  return resource
}

/** Creates (or replaces) the pending code for this email+purpose and returns it for the
 * caller to send. Throws 429 if one was issued moments ago. */
export async function issueCode(email: string, purpose: OtpPurpose): Promise<string> {
  const id = docId(purpose, email)
  const existing = await readDoc(id)
  if (existing && Date.now() - Date.parse(existing.createdAt) < RESEND_COOLDOWN_MS) {
    throw new HttpError(429, 'A code was just sent — wait a few seconds before asking for another')
  }
  const code = randomInt(100000, 1000000).toString() // always 6 digits
  const doc: VerificationDoc = { id, code, attempts: 0, createdAt: new Date().toISOString(), ttl: CODE_TTL_SECONDS }
  await verificationsContainer().items.upsert(doc)
  return code
}

/** True exactly once for a correct, unexpired code — it's deleted on success, so it
 * can't be replayed. Same `false` whether the code never existed, expired (Cosmos TTL
 * swept it), was burned by too many guesses, or just doesn't match. */
export async function consumeCode(email: string, purpose: OtpPurpose, code: unknown): Promise<boolean> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return false
  const id = docId(purpose, email)
  const doc = await readDoc(id)
  if (!doc) return false

  const container = verificationsContainer()
  const match = timingSafeEqual(Buffer.from(doc.code), Buffer.from(code.trim()))
  if (match) {
    await container.item(id, id).delete()
    return true
  }

  const attempts = (doc.attempts ?? 0) + 1
  if (attempts >= MAX_ATTEMPTS) {
    await container.item(id, id).delete().catch(() => undefined)
  } else {
    // Keep the original expiry: Cosmos TTL counts from the last write, so shrink it by
    // the time already elapsed rather than granting a fresh 15 minutes per wrong guess.
    const elapsed = Math.floor((Date.now() - Date.parse(doc.createdAt)) / 1000)
    const ttl = Math.max(1, CODE_TTL_SECONDS - elapsed)
    await container.items.upsert({ ...doc, attempts, ttl })
  }
  return false
}
