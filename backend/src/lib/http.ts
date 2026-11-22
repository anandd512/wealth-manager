import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { requireUserId, UnauthorizedError } from './authToken'

/** Thrown from a handler to return a specific status + message without each handler
 * hand-rolling the same try/catch. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export async function readJson<T>(request: HttpRequest): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  // Deliberately loose — the real check is whether the emailed code arrives.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null
}

type Handler = (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>
type AuthedHandler = (request: HttpRequest, context: InvocationContext, userId: string) => Promise<HttpResponseInit>

/** Wraps a handler with uniform error mapping: HttpError → its status, anything else →
 * a logged 500 that never leaks internals to the caller. */
export function handle(name: string, fn: Handler): Handler {
  return async (request, context) => {
    try {
      return await fn(request, context)
    } catch (err) {
      if (err instanceof HttpError) return { status: err.status, jsonBody: { error: err.message } }
      if (err instanceof UnauthorizedError) return { status: 401, jsonBody: { error: err.message } }
      context.error(`${name} failed`, err)
      return { status: 500, jsonBody: { error: 'Internal error' } }
    }
  }
}

/** `handle`, plus a verified session — the handler receives the JWT's userId. */
export function authed(name: string, fn: AuthedHandler): Handler {
  return handle(name, async (request, context) => fn(request, context, requireUserId(request)))
}

export function isBase64OfLength(value: unknown, minBytes: number, maxBytes: number): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false
  const length = Buffer.from(value, 'base64').length
  return length >= minBytes && length <= maxBytes
}
