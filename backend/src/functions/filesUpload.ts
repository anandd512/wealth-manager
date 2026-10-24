import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { filesContainer, blobPathFor } from '../lib/blobStorage'
import { requireUserId, UnauthorizedError } from '../lib/authToken'

interface UploadBody {
  key: string
  data: string // base64 — already client-encrypted (see blobStorage.ts)
}

const MAX_BYTES = 25 * 1024 * 1024 // generous headroom over typical ID scans/PDFs; also bounded by the platform's own request-size limit

export async function filesUpload(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let userId: string
  try {
    userId = requireUserId(request)
  } catch (err) {
    if (err instanceof UnauthorizedError) return { status: 401, jsonBody: { error: err.message } }
    throw err
  }

  let body: UploadBody
  try {
    body = (await request.json()) as UploadBody
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } }
  }

  if (!body.key || !body.data) {
    return { status: 400, jsonBody: { error: 'key and data are required' } }
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(body.data, 'base64')
  } catch {
    return { status: 400, jsonBody: { error: 'data must be base64-encoded' } }
  }
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return { status: 400, jsonBody: { error: `data must be non-empty and under ${MAX_BYTES} bytes` } }
  }

  try {
    const blob = filesContainer().getBlockBlobClient(blobPathFor(userId, body.key))
    await blob.uploadData(bytes)
    return { status: 200, jsonBody: { ok: true } }
  } catch (err) {
    context.error('filesUpload failed', err)
    return { status: 500, jsonBody: { error: 'Internal error' } }
  }
}

app.http('filesUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'files/upload',
  handler: filesUpload
})
