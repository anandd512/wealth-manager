import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { itemsContainer, ItemDoc } from '../lib/cosmos'
import { requireUserId, UnauthorizedError } from '../lib/authToken'

interface PushItem {
  id: string
  type: string
  ciphertext: string
  updatedAt: string
  deleted?: boolean
}

interface PushBody {
  items: PushItem[]
}

const MAX_BATCH = 500

export async function syncPush(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let userId: string
  try {
    userId = requireUserId(request)
  } catch (err) {
    if (err instanceof UnauthorizedError) return { status: 401, jsonBody: { error: err.message } }
    throw err
  }

  let body: PushBody
  try {
    body = (await request.json()) as PushBody
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } }
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { status: 400, jsonBody: { error: 'items must be a non-empty array' } }
  }
  if (body.items.length > MAX_BATCH) {
    return { status: 400, jsonBody: { error: `items exceeds max batch size of ${MAX_BATCH}` } }
  }

  const container = itemsContainer()
  const accepted: string[] = []
  const conflicts: string[] = []

  for (const item of body.items) {
    if (!item.id || !item.type || !item.ciphertext || !item.updatedAt) {
      return { status: 400, jsonBody: { error: `item missing required fields: ${JSON.stringify(item.id)}` } }
    }

    // Last-write-wins per record, compared on the client-assigned updatedAt. The
    // server never inspects ciphertext content — it can't, it holds no key — so
    // conflict resolution is intentionally this simple rather than field-level merge.
    const existing = await container
      .item(item.id, userId)
      .read<ItemDoc>()
      .catch(() => ({ resource: undefined }))

    if (existing.resource && existing.resource.updatedAt >= item.updatedAt) {
      conflicts.push(item.id)
      continue
    }

    const doc: ItemDoc = {
      id: item.id,
      userId,
      type: item.type,
      ciphertext: item.ciphertext,
      updatedAt: item.updatedAt,
      deleted: Boolean(item.deleted),
      createdAt: existing.resource?.createdAt ?? new Date().toISOString()
    }

    try {
      await container.items.upsert(doc)
      accepted.push(item.id)
    } catch (err) {
      context.error(`syncPush upsert failed for item ${item.id}`, err)
      return { status: 500, jsonBody: { error: 'Internal error' } }
    }
  }

  return { status: 200, jsonBody: { accepted, conflicts } }
}

app.http('syncPush', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sync/push',
  handler: syncPush
})
