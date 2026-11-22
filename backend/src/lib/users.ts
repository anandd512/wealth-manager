import { randomUUID } from 'crypto'
import { usersContainer, UserDoc, UserIdentity, IdentityProvider } from './cosmos'
import { issueToken } from './authToken'
import { HttpError } from './http'

/** An identity a sign-in method has vouched for. `emailVerified` decides whether the
 * address may be used to link to (or claim) an account — see findOrCreateUser. */
export interface VerifiedIdentity {
  provider: IdentityProvider
  subject: string
  email: string | null
  emailVerified: boolean
}

export type KeyState = 'none' | 'ready' | 'legacy'

/** What every sign-in endpoint returns. `keyState` tells the client what to do next:
 *  - 'none'   — brand-new account: generate a Data Key + Recovery Key, POST keys/setup
 *  - 'ready'  — key exists: use the locally cached one if its proof hash matches,
 *               otherwise get it via device approval or the Recovery Key
 *  - 'legacy' — old password account: ask the old password once, POST keys/migrate */
export interface SessionResponse {
  userId: string
  token: string
  email: string | null
  keyState: KeyState
  keyProofHash: string | null
  legacyKdf: { kdfSalt: string; kdfParams: { N: number; r: number; p: number } } | null
}

export function keyStateOf(user: UserDoc): KeyState {
  if (user.keyProofHash && user.recoveryWrappedKey) return 'ready'
  if (user.kdfSalt && user.authVerifier) return 'legacy'
  return 'none'
}

export function displayEmail(user: UserDoc): string | null {
  return user.email ?? user.identities?.find((i) => i.email)?.email ?? null
}

export function accountInfo(user: UserDoc): Omit<SessionResponse, 'token'> {
  const keyState = keyStateOf(user)
  return {
    userId: user.id,
    email: displayEmail(user),
    keyState,
    keyProofHash: user.keyProofHash ?? null,
    // Only ever handed to an authenticated caller — unlike the old public
    // /auth/salt lookup, this no longer confirms to strangers that an email has an account.
    legacyKdf:
      keyState === 'legacy' && user.kdfSalt && user.kdfParams
        ? { kdfSalt: user.kdfSalt, kdfParams: user.kdfParams }
        : null
  }
}

export function sessionFor(user: UserDoc): SessionResponse {
  return { ...accountInfo(user), token: issueToken(user.id) }
}

export async function getUser(userId: string): Promise<UserDoc> {
  const { resource } = await usersContainer()
    .item(userId, userId)
    .read<UserDoc>()
    .catch(() => ({ resource: undefined }))
  if (!resource) throw new HttpError(404, 'Account not found')
  return resource
}

async function findByIdentity(provider: IdentityProvider, subject: string): Promise<UserDoc | undefined> {
  const { resources } = await usersContainer()
    .items.query<UserDoc>({
      query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(c.identities, { "provider": @provider, "subject": @subject }, true)',
      parameters: [
        { name: '@provider', value: provider },
        { name: '@subject', value: subject }
      ]
    })
    .fetchAll()
  return resources[0]
}

async function findByEmail(email: string): Promise<UserDoc | undefined> {
  const { resources } = await usersContainer()
    .items.query<UserDoc>({
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email }]
    })
    .fetchAll()
  return resources[0]
}

function toStoredIdentity(identity: VerifiedIdentity): UserIdentity {
  return { provider: identity.provider, subject: identity.subject, email: identity.email }
}

/**
 * Resolves a sign-in to an account, creating one on first sign-in.
 *
 * 1. Same provider + subject seen before → that account.
 * 2. Otherwise, if the provider *verified* the email and an account already has that
 *    email → link this sign-in method to it. (So Google, Microsoft and email codes for
 *    the same address all land in one account, and pre-passwordless accounts are found
 *    by their address.)
 * 3. Otherwise → new account.
 *
 * An unverified email (e.g. a Microsoft work account whose tenant doesn't vouch for the
 * domain) is never used to link, never stored as the account's `email`, and can't
 * create an account that collides with an existing address — otherwise anyone who can
 * set an arbitrary email claim on an identity provider could walk into, or squat on,
 * somebody else's account.
 */
export async function findOrCreateUser(identity: VerifiedIdentity): Promise<UserDoc> {
  const container = usersContainer()

  const known = await findByIdentity(identity.provider, identity.subject)
  if (known) return known

  const verifiedEmail = identity.emailVerified ? identity.email : null
  if (verifiedEmail) {
    const byEmail = await findByEmail(verifiedEmail)
    if (byEmail) {
      const updated: UserDoc = {
        ...byEmail,
        identities: [...(byEmail.identities ?? []), toStoredIdentity(identity)]
      }
      const { resource } = await container.item(byEmail.id, byEmail.id).replace<UserDoc>(updated)
      return resource ?? updated
    }
  } else if (identity.email && (await findByEmail(identity.email))) {
    throw new HttpError(
      409,
      `An Artha account already uses ${identity.email}. Sign in with an email code for that address instead.`
    )
  }

  const user: UserDoc = {
    id: randomUUID(),
    email: verifiedEmail,
    identities: [toStoredIdentity(identity)],
    createdAt: new Date().toISOString()
  }
  await container.items.create(user)
  return user
}
