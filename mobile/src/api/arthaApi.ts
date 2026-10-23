import { Buffer } from '@craftzdog/react-native-buffer'
import { Config } from '../config'

/** Thin client for the Azure Functions backend in /backend — see backend/README.md
 * for the exact request/response shapes each endpoint returns. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export interface KdfParams {
  N: number
  r: number
  p: number
}

export interface SaltResponse {
  kdfAlgorithm: string
  kdfSalt: string
  kdfParams: KdfParams
}

export interface AuthResponse {
  userId: string
  token: string
}

export interface SyncPushItem {
  id: string
  type: string
  ciphertext: string
  updatedAt: string
  deleted: boolean
}

export interface SyncPushResponse {
  accepted: string[]
  conflicts: string[]
}

export interface SyncPullItem {
  id: string
  type: string
  ciphertext: string
  updatedAt: string
  deleted: boolean
}

export interface SyncPullResponse {
  items: SyncPullItem[]
  cursor: string
  hasMore: boolean
}

async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...init } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${Config.apiBaseUrl}${path}`, { ...init, headers })
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}

  if (!response.ok) {
    throw new ApiError(response.status, body.error ?? `Request failed (${response.status})`)
  }
  return body as T
}

export const ArthaApi = {
  fetchSalt(email: string): Promise<SaltResponse> {
    return request(`/api/auth/salt?email=${encodeURIComponent(email)}`)
  },

  requestEmailVerification(email: string): Promise<{ ok: true }> {
    return request('/api/auth/verify/request', { method: 'POST', body: JSON.stringify({ email }) })
  },

  confirmEmailVerification(email: string, code: string): Promise<{ verificationToken: string }> {
    return request('/api/auth/verify/confirm', { method: 'POST', body: JSON.stringify({ email, code }) })
  },

  register(
    email: string,
    kdfSaltHex: string,
    kdfParams: KdfParams,
    authKey: Buffer,
    verificationToken: string
  ): Promise<AuthResponse> {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        kdfSalt: Buffer.from(kdfSaltHex, 'hex').toString('base64'),
        kdfParams,
        authKey: authKey.toString('base64'),
        verificationToken
      })
    })
  },

  login(email: string, authKey: Buffer): Promise<AuthResponse> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, authKey: authKey.toString('base64') })
    })
  },

  push(items: SyncPushItem[], token: string): Promise<SyncPushResponse> {
    return request('/api/sync/push', { method: 'POST', body: JSON.stringify({ items }), token })
  },

  pull(since: string, token: string): Promise<SyncPullResponse> {
    return request(`/api/sync/pull?since=${encodeURIComponent(since)}`, { token })
  }
}
