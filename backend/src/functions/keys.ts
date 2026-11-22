import { app } from '@azure/functions'
import { deviceLinksContainer, itemsContainer, usersContainer, UserDoc } from '../lib/cosmos'
import { filesContainer } from '../lib/blobStorage'
import { checkVerifier } from '../lib/verifier'
import { accountInfo, getUser, keyStateOf } from '../lib/users'
import { requireKeyProof } from '../lib/keyProof'
import { authed, HttpError, isBase64OfLength, readJson } from '../lib/http'

// Data Key lifecycle endpoints. The server never holds the Data Key — see the
// zero-knowledge notes on UserDoc in lib/cosmos.ts for what each stored field is.

// iv(12) + tag(16) + 32-byte key = 60 bytes; allow a little slack for future formats.
const WRAPPED_KEY_MIN = 60
const WRAPPED_KEY_MAX = 128

function isKeyProofHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

// Replaces the user doc only if nobody else changed it since we read it — so two
// devices racing to set up (or migrate) the same account can't both "win" with
// different keys.
async function replaceIfUnchanged(user: UserDoc, next: UserDoc): Promise<UserDoc> {
  const etag = (user as UserDoc & { _etag?: string })._etag
  try {
    const { resource } = await usersContainer()
      .item(user.id, user.id)
      .replace<UserDoc>(next, etag ? { accessCondition: { type: 'IfMatch', condition: etag } } : undefined)
    return resource ?? next
  } catch (err) {
    if ((err as { code?: number }).code === 412) {
      throw new HttpError(409, 'Another device just changed this account — please try again')
    }
    throw err
  }
}

/** GET /api/account — current key state (same shape as a sign-in, minus the token). */
app.http('account', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'account',
  handler: authed('account', async (_request, _context, userId) => {
    return { status: 200, jsonBody: accountInfo(await getUser(userId)) }
  })
})

/** POST /api/keys/setup — first device of a brand-new account registers its key. */
app.http('keysSetup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'keys/setup',
  handler: authed('keysSetup', async (request, _context, userId) => {
    const body = await readJson<{ recoveryWrappedKey?: string; keyProofHash?: string }>(request)
    if (!isBase64OfLength(body.recoveryWrappedKey, WRAPPED_KEY_MIN, WRAPPED_KEY_MAX) || !isKeyProofHash(body.keyProofHash)) {
      throw new HttpError(400, 'recoveryWrappedKey and keyProofHash are required')
    }
    const user = await getUser(userId)
    if (keyStateOf(user) !== 'none') throw new HttpError(409, 'This account already has a key')
    const saved = await replaceIfUnchanged(user, {
      ...user,
      recoveryWrappedKey: body.recoveryWrappedKey,
      keyProofHash: body.keyProofHash
    })
    return { status: 200, jsonBody: accountInfo(saved) }
  })
})

/** GET /api/keys/recovery — the Recovery-Key-sealed Data Key, for a new device that
 * has the Recovery Key. Opaque without it. */
app.http('keysRecoveryGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'keys/recovery',
  handler: authed('keysRecoveryGet', async (_request, _context, userId) => {
    const user = await getUser(userId)
    if (!user.recoveryWrappedKey) throw new HttpError(404, 'This account has no recovery key yet')
    return { status: 200, jsonBody: { recoveryWrappedKey: user.recoveryWrappedKey } }
  })
})

/** PUT /api/keys/recovery — replace the Recovery Key (e.g. the old one was lost or
 * exposed). Requires proof of holding the Data Key, so a stolen session alone can't
 * swap in a recovery wrap the attacker controls. */
app.http('keysRecoveryRotate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'keys/recovery',
  handler: authed('keysRecoveryRotate', async (request, _context, userId) => {
    const body = await readJson<{ recoveryWrappedKey?: string; keyProof?: string }>(request)
    if (!isBase64OfLength(body.recoveryWrappedKey, WRAPPED_KEY_MIN, WRAPPED_KEY_MAX)) {
      throw new HttpError(400, 'recoveryWrappedKey is required')
    }
    const user = await getUser(userId)
    requireKeyProof(user, body.keyProof)
    await replaceIfUnchanged(user, { ...user, recoveryWrappedKey: body.recoveryWrappedKey })
    return { status: 200, jsonBody: { ok: true } }
  })
})

/** POST /api/keys/migrate — converts a pre-passwordless account. The client derives the
 * old authKey + Data Key from the old password (one last time), proves the password via
 * authKey, and registers a Recovery-Key wrap of that same Data Key. The password
 * verifier and KDF salt are then deleted — the password is never used again, and every
 * already-synced record stays readable because the Data Key itself didn't change. */
app.http('keysMigrate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'keys/migrate',
  handler: authed('keysMigrate', async (request, _context, userId) => {
    const body = await readJson<{ authKey?: string; recoveryWrappedKey?: string; keyProofHash?: string }>(request)
    if (
      !isBase64OfLength(body.authKey, 32, 32) ||
      !isBase64OfLength(body.recoveryWrappedKey, WRAPPED_KEY_MIN, WRAPPED_KEY_MAX) ||
      !isKeyProofHash(body.keyProofHash)
    ) {
      throw new HttpError(400, 'authKey, recoveryWrappedKey and keyProofHash are required')
    }
    const user = await getUser(userId)
    if (keyStateOf(user) !== 'legacy' || !user.authVerifier || !user.authVerifierSalt) {
      throw new HttpError(409, 'This account has already been converted')
    }
    if (!checkVerifier(body.authKey, { authVerifier: user.authVerifier, authVerifierSalt: user.authVerifierSalt })) {
      throw new HttpError(401, "That isn't the password this account used")
    }
    const {
      kdfAlgorithm: _a,
      kdfSalt: _s,
      kdfParams: _p,
      authVerifier: _v,
      authVerifierSalt: _vs,
      ...rest
    } = user
    const saved = await replaceIfUnchanged(user, {
      ...rest,
      recoveryWrappedKey: body.recoveryWrappedKey,
      keyProofHash: body.keyProofHash
    })
    return { status: 200, jsonBody: accountInfo(saved) }
  })
})

/** POST /api/keys/reset — the "I lost every device AND my recovery key" escape hatch.
 * Without the Data Key nothing in the cloud is readable by anyone, so it's deleted
 * (records, files, pending device requests) and the account goes back to keyState
 * 'none'; the next device sets up a fresh key and re-uploads whatever it has locally. */
app.http('keysReset', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'keys/reset',
  handler: authed('keysReset', async (request, context, userId) => {
    const body = await readJson<{ confirm?: string }>(request)
    if (body.confirm !== 'DELETE MY CLOUD DATA') throw new HttpError(400, 'Confirmation text is required')
    const user = await getUser(userId)

    const items = itemsContainer()
    const { resources: ids } = await items.items
      .query<string>({ query: 'SELECT VALUE c.id FROM c WHERE c.userId = @u', parameters: [{ name: '@u', value: userId }] })
      .fetchAll()
    for (let i = 0; i < ids.length; i += 100) {
      await items.items.bulk(
        ids.slice(i, i + 100).map((id) => ({ operationType: 'Delete' as const, id, partitionKey: userId }))
      )
    }

    const links = deviceLinksContainer()
    const { resources: linkIds } = await links.items
      .query<string>({ query: 'SELECT VALUE c.id FROM c WHERE c.userId = @u', parameters: [{ name: '@u', value: userId }] })
      .fetchAll()
    for (const id of linkIds) await links.item(id, userId).delete().catch(() => undefined)

    try {
      const files = filesContainer()
      for await (const blob of files.listBlobsFlat({ prefix: `${userId}/` })) {
        await files.deleteBlob(blob.name).catch(() => undefined)
      }
    } catch (err) {
      // Orphaned ciphertext blobs are unreadable without the old key; don't fail the
      // reset over them, but do leave a trace for cleanup.
      context.warn('keysReset: file cleanup incomplete', err)
    }

    const {
      recoveryWrappedKey: _r,
      keyProofHash: _k,
      kdfAlgorithm: _a,
      kdfSalt: _s,
      kdfParams: _p,
      authVerifier: _v,
      authVerifierSalt: _vs,
      ...rest
    } = user
    const saved = await replaceIfUnchanged(user, rest)
    return { status: 200, jsonBody: accountInfo(saved) }
  })
})
