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

export type KeyState = 'none' | 'ready' | 'legacy'

/** What every sign-in endpoint returns — see backend/src/lib/users.ts SessionResponse. */
export interface AccountInfo {
  userId: string
  email: string | null
  keyState: KeyState
  keyProofHash: string | null
  legacyKdf: { kdfSalt: string; kdfParams: { N: number; r: number; p: number } } | null
}

export interface SessionResponse extends AccountInfo {
  token: string
}

export interface PendingDeviceRequest {
  id: string
  publicKey: string
  deviceName: string
  createdAt: string
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

// Lets AuthContext react to an expired session (sign in again, keep the Data Key)
// wherever the 401 happens — sync, file download, key calls — without every caller
// handling it.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...init } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${Config.apiBaseUrl}${path}`, { ...init, headers })
  const text = await response.text()
  let body: { error?: string } = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    // non-JSON error page (e.g. a gateway timeout) — fall through to the status message
  }

  if (!response.ok) {
    if (response.status === 401 && token && onUnauthorized) onUnauthorized()
    throw new ApiError(response.status, body.error ?? `Request failed (${response.status})`)
  }
  return body as T
}

export const ArthaApi = {
  // ── Sign-in (no passwords) ──
  providers(): Promise<{ email: boolean; google: boolean; microsoft: boolean }> {
    return request('/api/auth/providers')
  },

  emailStart(email: string): Promise<{ ok: true }> {
    return request('/api/auth/email/start', { method: 'POST', body: JSON.stringify({ email }) })
  },

  emailVerify(email: string, code: string): Promise<SessionResponse> {
    return request('/api/auth/email/verify', { method: 'POST', body: JSON.stringify({ email, code }) })
  },

  /** Opened in the system browser; the backend sends the user on to Google/Microsoft
   * and finally back to `redirectUri` with `?handoff=` (or `?error=`). */
  oauthStartUrl(provider: 'google' | 'microsoft', redirectUri: string, codeChallenge: string): string {
    const q = `provider=${provider}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}`
    return `${Config.apiBaseUrl}/api/auth/oauth/start?${q}`
  },

  oauthExchange(handoff: string, codeVerifier: string): Promise<SessionResponse> {
    return request('/api/auth/oauth/exchange', { method: 'POST', body: JSON.stringify({ handoff, codeVerifier }) })
  },

  account(token: string): Promise<AccountInfo> {
    return request('/api/account', { token })
  },

  // ── Encryption key ──
  keysSetup(token: string, recoveryWrappedKey: string, keyProofHash: string): Promise<AccountInfo> {
    return request('/api/keys/setup', { method: 'POST', token, body: JSON.stringify({ recoveryWrappedKey, keyProofHash }) })
  },

  keysRecovery(token: string): Promise<{ recoveryWrappedKey: string }> {
    return request('/api/keys/recovery', { token })
  },

  keysRotateRecovery(token: string, recoveryWrappedKey: string, keyProof: string): Promise<{ ok: true }> {
    return request('/api/keys/recovery', { method: 'PUT', token, body: JSON.stringify({ recoveryWrappedKey, keyProof }) })
  },

  keysMigrate(token: string, authKey: string, recoveryWrappedKey: string, keyProofHash: string): Promise<AccountInfo> {
    return request('/api/keys/migrate', {
      method: 'POST',
      token,
      body: JSON.stringify({ authKey, recoveryWrappedKey, keyProofHash })
    })
  },

  keysReset(token: string): Promise<AccountInfo> {
    return request('/api/keys/reset', { method: 'POST', token, body: JSON.stringify({ confirm: 'DELETE MY CLOUD DATA' }) })
  },

  // ── Approve-from-another-device ──
  linkCreate(token: string, publicKey: string, deviceName: string): Promise<{ id: string; expiresInSeconds: number }> {
    return request('/api/devices/link', { method: 'POST', token, body: JSON.stringify({ publicKey, deviceName }) })
  },

  linkGet(
    token: string,
    id: string
  ): Promise<{ status: 'pending' | 'approved'; ephemeralPublicKey?: string; wrappedKey?: string }> {
    return request(`/api/devices/link/${encodeURIComponent(id)}`, { token })
  },

  linkDelete(token: string, id: string): Promise<{ ok: true }> {
    return request(`/api/devices/link/${encodeURIComponent(id)}`, { method: 'DELETE', token })
  },

  pendingDevices(token: string): Promise<{ requests: PendingDeviceRequest[] }> {
    return request('/api/devices/pending', { token })
  },

  approveDevice(token: string, id: string, ephemeralPublicKey: string, wrappedKey: string, keyProof: string): Promise<{ ok: true }> {
    return request(`/api/devices/link/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      token,
      body: JSON.stringify({ ephemeralPublicKey, wrappedKey, keyProof })
    })
  },

  // ── Sync ──
  push(items: SyncPushItem[], token: string): Promise<SyncPushResponse> {
    return request('/api/sync/push', { method: 'POST', body: JSON.stringify({ items }), token })
  },

  pull(since: string, token: string): Promise<SyncPullResponse> {
    return request(`/api/sync/pull?since=${encodeURIComponent(since)}`, { token })
  },

  /** `data` is already client-encrypted (base64) — see mobile/src/files/fileStore.ts
   * and backend/src/functions/filesUpload.ts. */
  uploadFile(key: string, data: string, token: string): Promise<{ ok: true }> {
    return request('/api/files/upload', { method: 'POST', body: JSON.stringify({ key, data }), token })
  },

  downloadFile(key: string, token: string): Promise<{ data: string }> {
    return request(`/api/files/download?key=${encodeURIComponent(key)}`, { token })
  }
}
