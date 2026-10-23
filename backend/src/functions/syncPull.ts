import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { itemsContainer, ItemDoc } from '../lib/cosmos'
import { requireUserId, UnauthorizedError } from '../lib/authToken'

const PAGE_SIZE = 500

export async function syncPull(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let userId: string
  try {
    userId = requireUserId(request)
  } catch (err) {
    if (err instanceof UnauthorizedError) return { status: 401, jsonBody: { error: err.message } }
    throw err
  }

  // Epoch start on first sync (no cursor yet) pulls everything for this user.
  const since = request.query.get('since') ?? '1970-01-01T00:00:00.000Z'

  try {
    const { resources } = await itemsContainer()
      .items.query<ItemDoc>({
        query:
          'SELECT * FROM c WHERE c.userId = @userId AND c.updatedAt > @since ORDER BY c.updatedAt ASC OFFSET 0 LIMIT @limit',
        parameters: [
          { name: '@userId', value: userId },
          { name: '@since', value: since },
          { name: '@limit', value: PAGE_SIZE }
        ]
      })
      .fetchAll()

    const nextCursor = resources.length > 0 ? resources[resources.length - 1].updatedAt : since

    return {
      status: 200,
      jsonBody: {
        items: resources.map((r) => ({
          id: r.id,
          type: r.type,
          ciphertext: r.ciphertext,
          updatedAt: r.updatedAt,
          deleted: r.deleted
        })),
        cursor: nextCursor,
        hasMore: resources.length === PAGE_SIZE
      }
    }
  } catch (err) {
    context.error('syncPull failed', err)
    return { status: 500, jsonBody: { error: 'Internal error' } }
  }
}

app.http('syncPull', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sync/pull',
  handler: syncPull
})
