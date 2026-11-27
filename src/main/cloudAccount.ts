import { BrowserWindow, shell } from 'electron'
import { createHash, randomBytes } from 'crypto'
import { createServer, Server } from 'http'
import { hostname } from 'os'
import { API_BASE_URL, apiRequest } from './backendApi'
import { getSecret, setSecret, clearSecret } from './secrets'
import { deriveKey } from './auth'
import { deriveSyncKeys } from './syncCrypto'
import { getDb } from './db'
import {
  formatRecoveryKey,
  generateDataKey,
  generateLinkKeyPair,
  generateRecoveryKey,
  keyProof,
  keyProofHash,
  linkCode,
  LinkKeyPair,
  openFromDevice,
  parseRecoveryKey,
  sealForDevice,
  unwrapWithRecoveryKey,
  wrapWithRecoveryKey
} from './cloudKeys'
import type { CloudStatus, CloudKeyState, CloudProviders, PendingDevice } from '../shared/types'

/**
 * Passwordless cloud account: sign in with Google, Microsoft or an emailed one-time
 * code, then get this device the account's Data Key (see cloudKeys.ts):
 *   - brand-new account → create one, show the Recovery Key once
 *   - existing account  → approve from a signed-in device, or type the Recovery Key
 *   - pre-passwordless account → the old password, one last time, to convert it
 * The session token and Data Key are kept with safeStorage (secrets.ts), like the AI
 * API keys — sync runs without asking for anything again until the session expires,
 * and even then only sign-in is repeated, never the key step.
 */

interface SessionResponse {
  userId: string
  token: string
  email: string | null
  keyState: CloudKeyState
  keyProofHash: string | null
  legacyKdf: { kdfSalt: string; kdfParams: { N: number; r: number; p: number } } | null
}

type AccountInfo = Omit<SessionResponse, 'token'>

// What the server last told us about the signed-in account — kept in memory between
// the sign-in and key steps, and refreshed from GET /api/account after a restart.
let account: AccountInfo | null = null

function token(): string | null {
  return getSecret('syncToken')
}

function cachedDataKey(): Buffer | null {
  const stored = getSecret('syncDataKey')
  return stored ? Buffer.from(stored, 'base64') : null
}

/** Forget pull cursors and "already uploaded" document markers, so the next sync
 * re-pulls and re-uploads everything — needed whenever the Data Key changes, since
 * whatever was uploaded under the old key is unreadable now. Only possible while the
 * local DB is unlocked; a device that's still onboarding has nothing to forget. */
function resetSyncBookkeeping(): void {
  try {
    getDb().prepare('DELETE FROM sync_meta').run()
  } catch {
    // locked / not created yet — nothing to reset
  }
}

function cacheDataKey(dataKey: Buffer): void {
  const previous = cachedDataKey()
  if (previous && !previous.equals(dataKey)) resetSyncBookkeeping()
  setSecret('syncDataKey', dataKey.toString('base64'))
}

function requireToken(): string {
  const t = token()
  if (!t) throw new Error('Signed out — please sign in again')
  return t
}

function applySession(session: SessionResponse): CloudStatus {
  setSecret('syncToken', session.token)
  setSecret('syncEmail', session.email ?? '')
  const { token: _t, ...info } = session
  account = info
  // A Data Key cached from an earlier sign-in is only kept if it's provably this
  // account's current key; otherwise (different account, or the key was reset from
  // another device) it's dropped and the key step runs again.
  const dk = cachedDataKey()
  if (dk && (session.keyState !== 'ready' || keyProofHash(dk) !== session.keyProofHash)) {
    clearSecret('syncDataKey')
    resetSyncBookkeeping()
  }
  return currentStatus()
}

function currentStatus(): CloudStatus {
  const signedIn = Boolean(token())
  const email = getSecret('syncEmail') || null
  if (!signedIn) return { stage: 'signedOut', email: null, keyState: null }
  if (cachedDataKey()) return { stage: 'ready', email, keyState: 'ready' }
  return { stage: 'needsKey', email, keyState: account?.keyState ?? null }
}

/** Cheap, offline status. After a restart mid-onboarding the key state isn't known
 * yet — `refreshStatus` asks the server. */
export function cloudStatus(): CloudStatus {
  return currentStatus()
}

export async function refreshCloudStatus(): Promise<CloudStatus> {
  const t = token()
  if (!t) return currentStatus()
  try {
    account = await apiRequest<AccountInfo>('/api/account', { token: t })
    const dk = cachedDataKey()
    if (dk && (account.keyState !== 'ready' || keyProofHash(dk) !== account.keyProofHash)) {
      clearSecret('syncDataKey')
      resetSyncBookkeeping()
    }
  } catch (err) {
    const message = (err as Error).message
    if (/account not found/i.test(message)) signOut()
    else if (isSessionError(err)) expireSession()
    else throw err
  }
  return currentStatus()
}

export function isSessionError(err: unknown): boolean {
  return /invalid or expired token|missing bearer token|invalid token/i.test((err as Error)?.message ?? '')
}

/** The session ran out (30 days): drop only the token. The Data Key stays cached, so
 * signing in again goes straight back to syncing — no recovery key, no approval. */
export function expireSession(): void {
  clearSecret('syncToken')
}

/** Which sign-in methods the backend has configured, so the UI doesn't offer a button
 * that would only open an error page. If the check itself fails (offline, or an older
 * backend without the endpoint), every method is shown — the attempt will explain. */
export async function signInProviders(): Promise<CloudProviders> {
  try {
    return await apiRequest<CloudProviders>('/api/auth/providers')
  } catch {
    return { email: true, google: true, microsoft: true }
  }
}

// ── Sign-in: email code ───────────────────────────────────────────────────────

export async function startEmailSignIn(email: string): Promise<void> {
  await apiRequest('/api/auth/email/start', { method: 'POST', body: { email } })
}

export async function verifyEmailSignIn(email: string, code: string): Promise<CloudStatus> {
  const session = await apiRequest<SessionResponse>('/api/auth/email/verify', {
    method: 'POST',
    body: { email, code: code.replace(/\s/g, '') }
  })
  return applySession(session)
}

// ── Sign-in: Google / Microsoft ───────────────────────────────────────────────
// RFC 8252 native-app flow: the user signs in in their real browser (where they're
// probably already signed in to Google/Microsoft, and where password managers work),
// the backend brokers the provider exchange, then redirects to a one-shot listener on
// 127.0.0.1 here. PKCE ties the handoff to this process.

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000
let activeOAuth: { server: Server; cancel: () => void } | null = null

function callbackPage(ok: boolean, message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Artha</title><body style="font-family:system-ui;max-width:420px;margin:80px auto;padding:0 16px;color:#222"><h2>${ok ? 'Signed in' : "Sign-in didn't complete"}</h2><p>${message}</p></body>`
}

export function cancelOAuthSignIn(): void {
  activeOAuth?.cancel()
}

export async function oauthSignIn(provider: 'google' | 'microsoft'): Promise<CloudStatus> {
  cancelOAuthSignIn()
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  const handoff = await new Promise<string>((resolve, reject) => {
    const server = createServer()
    let settled = false
    const finish = (err: Error | null, value?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      activeOAuth = null
      // Let the response flush before tearing the listener down.
      setTimeout(() => server.close(), 200)
      if (err) reject(err)
      else resolve(value!)
    }
    const timer = setTimeout(() => finish(new Error('Sign-in timed out — please try again')), OAUTH_TIMEOUT_MS)
    activeOAuth = { server, cancel: () => finish(new Error('Sign-in cancelled')) }

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const value = url.searchParams.get('handoff')
      const error = url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      if (value) {
        res.end(callbackPage(true, 'You can close this tab and return to Artha.'))
        finish(null, value)
      } else {
        res.end(callbackPage(false, 'You can close this tab and try again from Artha.'))
        finish(new Error(error === 'cancelled' ? 'Sign-in cancelled' : 'Sign-in failed — please try again'))
      }
    })
    server.on('error', (err) => finish(err))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const start = new URL(`${API_BASE_URL}/api/auth/oauth/start`)
      start.searchParams.set('provider', provider)
      start.searchParams.set('redirect_uri', `http://127.0.0.1:${port}/callback`)
      start.searchParams.set('code_challenge', challenge)
      shell.openExternal(start.toString()).catch((err) => finish(err))
    })
  })

  // Bring Artha back in front of the browser tab.
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }

  const session = await apiRequest<SessionResponse>('/api/auth/oauth/exchange', {
    method: 'POST',
    body: { handoff, codeVerifier: verifier }
  })
  return applySession(session)
}

// ── Key step ──────────────────────────────────────────────────────────────────

/** Brand-new account: mint the Data Key + Recovery Key. Returns the Recovery Key
 * (formatted) for the UI to show exactly once — it's never stored on this device. */
export async function createAccountKey(): Promise<{ recoveryKey: string; status: CloudStatus }> {
  const t = requireToken()
  const dataKey = generateDataKey()
  const recovery = generateRecoveryKey()
  account = await apiRequest<AccountInfo>('/api/keys/setup', {
    method: 'POST',
    token: t,
    body: { recoveryWrappedKey: wrapWithRecoveryKey(dataKey, recovery), keyProofHash: keyProofHash(dataKey) }
  })
  cacheDataKey(dataKey)
  return { recoveryKey: formatRecoveryKey(recovery), status: currentStatus() }
}

export async function useRecoveryKey(text: string): Promise<CloudStatus> {
  const t = requireToken()
  const recovery = parseRecoveryKey(text)
  const { recoveryWrappedKey } = await apiRequest<{ recoveryWrappedKey: string }>('/api/keys/recovery', { token: t })
  const dataKey = unwrapWithRecoveryKey(recoveryWrappedKey, recovery)
  if (account?.keyProofHash && keyProofHash(dataKey) !== account.keyProofHash) {
    throw new Error("That recovery key doesn't match this account")
  }
  cacheDataKey(dataKey)
  return currentStatus()
}

/** Pre-passwordless account: the old password derives the old Data Key exactly as
 * before (auth.ts's scrypt + syncCrypto.ts's HKDF split); the server checks it via the
 * old auth proof, then swaps the password verifier for a Recovery Key wrap of that
 * same Data Key. Nothing synced needs re-encrypting. */
export async function convertLegacyAccount(password: string): Promise<{ recoveryKey: string; status: CloudStatus }> {
  const t = requireToken()
  if (!account || account.keyState !== 'legacy' || !account.legacyKdf) await refreshCloudStatus()
  const kdf = account?.legacyKdf
  if (!kdf) throw new Error('This account has already been converted — sign in again')
  const { N, r, p } = kdf.kdfParams
  if (N !== 1 << 15 || r !== 8 || p !== 1) throw new Error('Unsupported key parameters on this account')

  const masterKey = deriveKey(password, Buffer.from(kdf.kdfSalt, 'base64').toString('hex'))
  const { authKey, dataKey } = deriveSyncKeys(masterKey)
  const recovery = generateRecoveryKey()
  account = await apiRequest<AccountInfo>('/api/keys/migrate', {
    method: 'POST',
    token: t,
    body: {
      authKey: authKey.toString('base64'),
      recoveryWrappedKey: wrapWithRecoveryKey(dataKey, recovery),
      keyProofHash: keyProofHash(dataKey)
    }
  })
  cacheDataKey(dataKey)
  return { recoveryKey: formatRecoveryKey(recovery), status: currentStatus() }
}

// New device side of "approve from another device".
let pendingLink: { id: string; pair: LinkKeyPair } | null = null

export async function startDeviceLink(): Promise<{ code: string; expiresInSeconds: number }> {
  const t = requireToken()
  await cancelDeviceLink()
  const pair = generateLinkKeyPair()
  const publicKey = pair.publicKey.toString('base64')
  const result = await apiRequest<{ id: string; expiresInSeconds: number }>('/api/devices/link', {
    method: 'POST',
    token: t,
    body: { publicKey, deviceName: `Artha for Windows (${hostname()})` }
  })
  pendingLink = { id: result.id, pair }
  return { code: linkCode(publicKey), expiresInSeconds: result.expiresInSeconds }
}

export async function pollDeviceLink(): Promise<{ status: 'pending' | 'approved' | 'expired'; cloud: CloudStatus }> {
  const t = requireToken()
  if (!pendingLink) return { status: 'expired', cloud: currentStatus() }
  let result: { status: 'pending' | 'approved'; ephemeralPublicKey?: string; wrappedKey?: string }
  try {
    result = await apiRequest(`/api/devices/link/${pendingLink.id}`, { token: t })
  } catch (err) {
    if (/expired/i.test((err as Error).message)) {
      pendingLink = null
      return { status: 'expired', cloud: currentStatus() }
    }
    throw err
  }
  if (result.status !== 'approved' || !result.ephemeralPublicKey || !result.wrappedKey) {
    return { status: 'pending', cloud: currentStatus() }
  }
  const dataKey = openFromDevice(pendingLink.pair, result.ephemeralPublicKey, result.wrappedKey)
  pendingLink = null
  if (account?.keyProofHash && keyProofHash(dataKey) !== account.keyProofHash) {
    throw new Error('The key received did not match this account — please try again')
  }
  cacheDataKey(dataKey)
  return { status: 'approved', cloud: currentStatus() }
}

export async function cancelDeviceLink(): Promise<void> {
  if (!pendingLink) return
  const { id } = pendingLink
  pendingLink = null
  const t = token()
  if (t) await apiRequest(`/api/devices/link/${id}`, { method: 'DELETE', token: t }).catch(() => undefined)
}

// Existing device side.
export async function listPendingDevices(): Promise<PendingDevice[]> {
  const t = token()
  if (!t || !cachedDataKey()) return []
  const { requests } = await apiRequest<{
    requests: { id: string; publicKey: string; deviceName: string; createdAt: string }[]
  }>('/api/devices/pending', { token: t })
  // The code is computed HERE from the public key itself — never taken from the
  // server — so a swapped key shows a different code than the new device does.
  return requests.map((r) => ({ id: r.id, deviceName: r.deviceName, createdAt: r.createdAt, code: linkCode(r.publicKey), publicKey: r.publicKey }))
}

export async function approveDevice(id: string, publicKey: string): Promise<void> {
  const t = requireToken()
  const dataKey = cachedDataKey()
  if (!dataKey) throw new Error("This device doesn't have the account key")
  const sealed = sealForDevice(dataKey, publicKey)
  await apiRequest(`/api/devices/link/${id}/approve`, {
    method: 'POST',
    token: t,
    body: { ...sealed, keyProof: keyProof(dataKey).toString('base64') }
  })
}

export async function denyDevice(id: string): Promise<void> {
  const t = requireToken()
  await apiRequest(`/api/devices/link/${id}`, { method: 'DELETE', token: t })
}

/** Replace the Recovery Key (old one lost or exposed). The old one stops working. */
export async function rotateRecoveryKey(): Promise<string> {
  const t = requireToken()
  const dataKey = cachedDataKey()
  if (!dataKey) throw new Error("This device doesn't have the account key")
  const recovery = generateRecoveryKey()
  await apiRequest('/api/keys/recovery', {
    method: 'PUT',
    token: t,
    body: { recoveryWrappedKey: wrapWithRecoveryKey(dataKey, recovery), keyProof: keyProof(dataKey).toString('base64') }
  })
  return formatRecoveryKey(recovery)
}

/** Lost every device and the Recovery Key: wipe the (unreadable) cloud copy and start
 * the account over with a fresh key. Local data on this device is untouched and gets
 * re-uploaded by the next sync. */
export async function resetCloudData(): Promise<CloudStatus> {
  const t = requireToken()
  account = await apiRequest<AccountInfo>('/api/keys/reset', {
    method: 'POST',
    token: t,
    body: { confirm: 'DELETE MY CLOUD DATA' }
  })
  clearSecret('syncDataKey')
  resetSyncBookkeeping()
  return currentStatus()
}

export function signOut(): void {
  cancelOAuthSignIn()
  pendingLink = null
  account = null
  clearSecret('syncEmail')
  clearSecret('syncToken')
  clearSecret('syncDataKey')
}
