import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { filesContainer, blobPathFor } from '../lib/blobStorage'
import { requireUserId, UnauthorizedError } from '../lib/authToken'

export async function filesDownload(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let userId: string
  try {
    userId = requireUserId(request)
  } catch (err) {
    if (err instanceof UnauthorizedError) return { status: 401, jsonBody: { error: err.message } }
    throw err
  }

  const key = request.query.get('key')
  if (!key) return { status: 400, jsonBody: { error: 'key query parameter is required' } }

  try {
    const blob = filesContainer().getBlockBlobClient(blobPathFor(userId, key))
    if (!(await blob.exists())) {
      return { status: 404, jsonBody: { error: 'Not found' } }
    }
    const downloaded = await blob.downloadToBuffer()
    return { status: 200, jsonBody: { data: downloaded.toString('base64') } }
  } catch (err) {
    context.error('filesDownload failed', err)
    return { status: 500, jsonBody: { error: 'Internal error' } }
  }
}

app.http('filesDownload', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'files/download',
  handler: filesDownload
})
