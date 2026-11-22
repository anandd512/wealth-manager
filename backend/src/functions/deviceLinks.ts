import { randomUUID } from 'crypto'
import { app } from '@azure/functions'
import { deviceLinksContainer, DeviceLinkDoc } from '../lib/cosmos'
import { getUser, keyStateOf } from '../lib/users'
import { authed, HttpError, isBase64OfLength, readJson } from '../lib/http'
import { requireKeyProof } from '../lib/keyProof'

// "Approve this device from one you're already signed in on." The new device and an
// existing one exchange a Data Key through this relay without the server being able to
// read it: the existing device seals the key to the new device's X25519 public key.
// Both screens show a 6-digit code derived from that public key, so the user can spot a
// substituted key (a malicious relay) before approving. Requests expire after 10 minutes.

const LINK_TTL_SECONDS = 10 * 60
const MAX_PENDING = 5

async function readLink(id: string, userId: string): Promise<DeviceLinkDoc> {
  const { resource } = await deviceLinksContainer()
    .item(id, userId)
    .read<DeviceLinkDoc>()
    .catch(() => ({ resource: undefined }))
  if (!resource) throw new HttpError(404, 'This request has expired')
  return resource
}

/** POST /api/devices/link — new device asks for the key. */
app.http('deviceLinkCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'devices/link',
  handler: authed('deviceLinkCreate', async (request, _context, userId) => {
    const body = await readJson<{ publicKey?: string; deviceName?: string }>(request)
    if (!isBase64OfLength(body.publicKey, 32, 32)) throw new HttpError(400, 'publicKey is required')
    const deviceName = (typeof body.deviceName === 'string' ? body.deviceName.trim() : '').slice(0, 60) || 'New device'

    const user = await getUser(userId)
    if (keyStateOf(user) !== 'ready') throw new HttpError(409, 'This account has no key to share yet')

    const container = deviceLinksContainer()
    const { resources: pending } = await container.items
      .query<number>({
        query: "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @u AND c.status = 'pending'",
        parameters: [{ name: '@u', value: userId }]
      })
      .fetchAll()
    if ((pending[0] ?? 0) >= MAX_PENDING) throw new HttpError(429, 'Too many pending device requests — try again later')

    const doc: DeviceLinkDoc = {
      id: randomUUID(),
      userId,
      publicKey: body.publicKey,
      deviceName,
      status: 'pending',
      createdAt: new Date().toISOString(),
      ttl: LINK_TTL_SECONDS
    }
    await container.items.create(doc)
    return { status: 201, jsonBody: { id: doc.id, expiresInSeconds: LINK_TTL_SECONDS } }
  })
})

/** GET /api/devices/link/{id} — new device polls. Once approved, the sealed key is
 * returned exactly once and the request deleted. */
app.http('deviceLinkGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'devices/link/{id}',
  handler: authed('deviceLinkGet', async (request, _context, userId) => {
    const link = await readLink(request.params.id, userId)
    if (link.status !== 'approved') return { status: 200, jsonBody: { status: 'pending' } }
    await deviceLinksContainer().item(link.id, userId).delete().catch(() => undefined)
    return {
      status: 200,
      jsonBody: { status: 'approved', ephemeralPublicKey: link.ephemeralPublicKey, wrappedKey: link.wrappedKey }
    }
  })
})

/** DELETE /api/devices/link/{id} — the new device gives up, or an existing device denies. */
app.http('deviceLinkDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'devices/link/{id}',
  handler: authed('deviceLinkDelete', async (request, _context, userId) => {
    await deviceLinksContainer().item(request.params.id, userId).delete().catch(() => undefined)
    return { status: 200, jsonBody: { ok: true } }
  })
})

/** GET /api/devices/pending — an existing device lists requests awaiting approval. */
app.http('deviceLinkPending', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'devices/pending',
  handler: authed('deviceLinkPending', async (_request, _context, userId) => {
    const { resources } = await deviceLinksContainer()
      .items.query<DeviceLinkDoc>({
        query: "SELECT * FROM c WHERE c.userId = @u AND c.status = 'pending'",
        parameters: [{ name: '@u', value: userId }]
      })
      .fetchAll()
    return {
      status: 200,
      jsonBody: {
        requests: resources.map((r) => ({ id: r.id, publicKey: r.publicKey, deviceName: r.deviceName, createdAt: r.createdAt }))
      }
    }
  })
})

/** POST /api/devices/link/{id}/approve — an existing device posts the sealed key. Only a
 * device that can prove it holds the Data Key may approve. */
app.http('deviceLinkApprove', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'devices/link/{id}/approve',
  handler: authed('deviceLinkApprove', async (request, _context, userId) => {
    const body = await readJson<{ ephemeralPublicKey?: string; wrappedKey?: string; keyProof?: string }>(request)
    if (!isBase64OfLength(body.ephemeralPublicKey, 32, 32) || !isBase64OfLength(body.wrappedKey, 60, 128)) {
      throw new HttpError(400, 'ephemeralPublicKey and wrappedKey are required')
    }
    requireKeyProof(await getUser(userId), body.keyProof)

    const link = await readLink(request.params.id, userId)
    if (link.status !== 'pending') throw new HttpError(409, 'This request was already answered')
    const elapsed = Math.floor((Date.now() - Date.parse(link.createdAt)) / 1000)
    await deviceLinksContainer().items.upsert({
      ...link,
      status: 'approved',
      ephemeralPublicKey: body.ephemeralPublicKey,
      wrappedKey: body.wrappedKey,
      ttl: Math.max(60, LINK_TTL_SECONDS - elapsed)
    })
    return { status: 200, jsonBody: { ok: true } }
  })
})
