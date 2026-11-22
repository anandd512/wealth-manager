import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Platform } from 'react-native'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import * as LocalAuthentication from 'expo-local-authentication'
import { Buffer } from 'buffer'
import { AccountInfo, ArthaApi, KeyState, SessionResponse, setUnauthorizedHandler } from '../api/arthaApi'
import { deriveKeys } from '../crypto/cryptoBox'
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
  pkcePair,
  sealForDevice,
  unwrapWithRecoveryKey,
  wrapWithRecoveryKey
} from '../crypto/cloudKeys'
import * as secureStore from './secureStore'
import { getDb, wipeLocalDb } from '../db/db'

/**
 * Passwordless account + zero-knowledge key, mirroring the desktop app's
 * src/main/cloudAccount.ts.
 *
 *   signedOut ─ sign in (Google / Microsoft / emailed code) ─▶ needsKey or locked
 *   needsKey  ─ create key | approve from another device | recovery key | old password ─▶ unlocked
 *   locked    ─ Face ID, or the phone's passcode ─▶ unlocked
 *
 * The Data Key lives only in this device's Keychain/Keystore (see secureStore.ts).
 * Signing out — or the 30-day session expiring — never touches the server copy; an
 * expired session keeps the key, so signing back in skips the key step entirely.
 */

export type AuthStatus = 'loading' | 'signedOut' | 'needsKey' | 'locked' | 'unlocked'

export interface PendingDevice {
  id: string
  deviceName: string
  createdAt: string
  code: string // computed here from publicKey, never taken from the server
  publicKey: string
}

interface AuthState {
  status: AuthStatus
  email: string | null
  token: string | null
  dataKey: Buffer | null
  keyState: KeyState | null
  error: string | null
}

interface AuthContextValue extends AuthState {
  startEmailSignIn: (email: string) => Promise<void>
  verifyEmailSignIn: (email: string, code: string) => Promise<void>
  oauthSignIn: (provider: 'google' | 'microsoft') => Promise<void>
  refreshAccount: () => Promise<void>
  /** New account: returns the Recovery Key to show; call finishKeySetup() once saved. */
  createKey: () => Promise<string>
  convertLegacy: (password: string) => Promise<string>
  finishKeySetup: () => void
  useRecoveryKey: (text: string) => Promise<void>
  startDeviceLink: () => Promise<{ code: string }>
  pollDeviceLink: () => Promise<'pending' | 'approved' | 'expired'>
  cancelDeviceLink: () => Promise<void>
  listPendingDevices: () => Promise<PendingDevice[]>
  approveDevice: (device: PendingDevice) => Promise<void>
  denyDevice: (id: string) => Promise<void>
  rotateRecoveryKey: () => Promise<string>
  resetCloudData: () => Promise<void>
  unlockWithBiometrics: () => Promise<boolean>
  unlockWithDevicePasscode: () => Promise<boolean>
  signOut: () => Promise<void>
  wipeDeviceAndStartOver: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const DEVICE_NAME = `Artha for ${Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'mobile'}`

function message(err: unknown): string {
  return (err as Error)?.message ?? 'Something went wrong'
}

/** Pull cursors + upload markers are only valid for the key they were made under. */
function resetSyncBookkeeping(): void {
  try {
    getDb().runSync('DELETE FROM sync_meta')
  } catch {
    // table not created yet — nothing to forget
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    email: null,
    token: null,
    dataKey: null,
    keyState: null,
    error: null
  })
  // Kept outside React state: the server's view of the account (for proof-hash checks),
  // a key created/converted but not yet "finished" (recovery key still on screen), and
  // the in-flight device-link keypair.
  const account = useRef<AccountInfo | null>(null)
  const pendingKey = useRef<Buffer | null>(null)
  const pendingLink = useRef<{ id: string; pair: LinkKeyPair } | null>(null)

  const fail = useCallback((err: unknown): never => {
    setState((s) => ({ ...s, error: message(err) }))
    throw err
  }, [])

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), [])

  // Startup: a session plus a stored key → locked (Face ID next); session without a
  // key → finish the key step; nothing → sign in.
  useEffect(() => {
    ;(async () => {
      const session = await secureStore.loadSession()
      if (!session) {
        setState((s) => ({ ...s, status: 'signedOut' }))
        return
      }
      const hasKey = Boolean(await secureStore.loadDataKeyProofHash())
      setState((s) => ({
        ...s,
        status: hasKey ? 'locked' : 'needsKey',
        email: session.email,
        token: session.token
      }))
    })()
  }, [])

  // 401 anywhere → the session expired: back to sign-in, Data Key kept.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void secureStore.clearSession()
      setState((s) => ({
        ...s,
        status: 'signedOut',
        token: null,
        dataKey: null,
        error: 'Your session expired — sign in again to keep syncing.'
      }))
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const applySession = useCallback(async (session: SessionResponse) => {
    const { token, ...info } = session
    account.current = info
    await secureStore.saveSession({ email: info.email ?? '', userId: info.userId, token })
    await secureStore.clearLegacyUnlockItems()
    const storedProof = await secureStore.loadDataKeyProofHash()
    const keyStillValid = Boolean(storedProof) && info.keyState === 'ready' && storedProof === info.keyProofHash
    if (storedProof && !keyStillValid) {
      // A different account, or the key was reset from another device.
      await secureStore.clearDataKey()
      resetSyncBookkeeping()
    }
    setState({
      status: keyStillValid ? 'locked' : 'needsKey',
      email: info.email,
      token,
      dataKey: null,
      keyState: info.keyState,
      error: null
    })
  }, [])

  const storeKey = useCallback(async (dataKey: Buffer) => {
    await secureStore.saveDataKey(dataKey, keyProofHash(dataKey))
  }, [])

  const unlockWith = useCallback((dataKey: Buffer) => {
    setState((s) => ({ ...s, status: 'unlocked', dataKey, error: null }))
  }, [])

  const requireToken = useCallback((): string => {
    if (!state.token) throw new Error('Signed out — please sign in again')
    return state.token
  }, [state.token])

  // ── Sign-in ──
  const startEmailSignIn = useCallback(
    async (email: string) => {
      clearError()
      try {
        await ArthaApi.emailStart(email)
      } catch (err) {
        fail(err)
      }
    },
    [clearError, fail]
  )

  const verifyEmailSignIn = useCallback(
    async (email: string, code: string) => {
      clearError()
      try {
        await applySession(await ArthaApi.emailVerify(email, code.replace(/\s/g, '')))
      } catch (err) {
        fail(err)
      }
    },
    [applySession, clearError, fail]
  )

  // The backend brokers the provider exchange (works in Expo Go, where Google refuses
  // to redirect to exp:// directly); openAuthSessionAsync catches the redirect back to
  // this app's URL. PKCE binds the handoff to this attempt.
  const oauthSignIn = useCallback(
    async (provider: 'google' | 'microsoft') => {
      clearError()
      try {
        const redirectUri = Linking.createURL('auth')
        const { verifier, challenge } = pkcePair()
        const result = await WebBrowser.openAuthSessionAsync(
          ArthaApi.oauthStartUrl(provider, redirectUri, challenge),
          redirectUri
        )
        if (result.type !== 'success') return // closed / cancelled — not an error
        const params = Linking.parse(result.url).queryParams ?? {}
        const handoff = typeof params.handoff === 'string' ? params.handoff : null
        if (!handoff) {
          if (params.error === 'cancelled') return
          throw new Error('Sign-in failed — please try again')
        }
        await applySession(await ArthaApi.oauthExchange(handoff, verifier))
      } catch (err) {
        fail(err)
      }
    },
    [applySession, clearError, fail]
  )

  const refreshAccount = useCallback(async () => {
    try {
      const info = await ArthaApi.account(requireToken())
      account.current = info
      setState((s) => ({ ...s, keyState: info.keyState }))
    } catch (err) {
      fail(err)
    }
  }, [fail, requireToken])

  // ── Key step ──
  const createKey = useCallback(async (): Promise<string> => {
    clearError()
    try {
      const dataKey = generateDataKey()
      const recovery = generateRecoveryKey()
      account.current = await ArthaApi.keysSetup(
        requireToken(),
        wrapWithRecoveryKey(dataKey, recovery),
        keyProofHash(dataKey)
      )
      await storeKey(dataKey)
      pendingKey.current = dataKey
      return formatRecoveryKey(recovery)
    } catch (err) {
      return fail(err)
    }
  }, [clearError, fail, requireToken, storeKey])

  const convertLegacy = useCallback(
    async (password: string): Promise<string> => {
      clearError()
      try {
        const t = requireToken()
        const info = account.current?.legacyKdf ? account.current : await ArthaApi.account(t)
        const kdf = info.legacyKdf
        if (!kdf) throw new Error('This account has already been converted — sign in again')
        const { N, r, p } = kdf.kdfParams
        if (N !== 1 << 15 || r !== 8 || p !== 1) throw new Error('Unsupported key parameters on this account')
        const saltHex = Buffer.from(kdf.kdfSalt, 'base64').toString('hex')
        const { authKey, dataKey } = await deriveKeys(password, saltHex)
        const recovery = generateRecoveryKey()
        account.current = await ArthaApi.keysMigrate(
          t,
          authKey.toString('base64'),
          wrapWithRecoveryKey(dataKey, recovery),
          keyProofHash(dataKey)
        )
        await storeKey(dataKey)
        pendingKey.current = dataKey
        return formatRecoveryKey(recovery)
      } catch (err) {
        return fail(err)
      }
    },
    [clearError, fail, requireToken, storeKey]
  )

  const finishKeySetup = useCallback(() => {
    if (pendingKey.current) unlockWith(pendingKey.current)
    pendingKey.current = null
  }, [unlockWith])

  const useRecoveryKey = useCallback(
    async (text: string) => {
      clearError()
      try {
        const recovery = parseRecoveryKey(text)
        const { recoveryWrappedKey } = await ArthaApi.keysRecovery(requireToken())
        const dataKey = unwrapWithRecoveryKey(recoveryWrappedKey, recovery)
        const expected = account.current?.keyProofHash
        if (expected && keyProofHash(dataKey) !== expected) throw new Error("That recovery key doesn't match this account")
        await storeKey(dataKey)
        unlockWith(dataKey)
      } catch (err) {
        fail(err)
      }
    },
    [clearError, fail, requireToken, storeKey, unlockWith]
  )

  const cancelDeviceLink = useCallback(async () => {
    const link = pendingLink.current
    pendingLink.current = null
    if (link && state.token) await ArthaApi.linkDelete(state.token, link.id).catch(() => undefined)
  }, [state.token])

  const startDeviceLink = useCallback(async () => {
    clearError()
    try {
      await cancelDeviceLink()
      const pair = generateLinkKeyPair()
      const publicKey = pair.publicKey.toString('base64')
      const { id } = await ArthaApi.linkCreate(requireToken(), publicKey, DEVICE_NAME)
      pendingLink.current = { id, pair }
      return { code: linkCode(publicKey) }
    } catch (err) {
      return fail(err)
    }
  }, [cancelDeviceLink, clearError, fail, requireToken])

  const pollDeviceLink = useCallback(async (): Promise<'pending' | 'approved' | 'expired'> => {
    const link = pendingLink.current
    if (!link) return 'expired'
    let result
    try {
      result = await ArthaApi.linkGet(requireToken(), link.id)
    } catch (err) {
      if (/expired/i.test(message(err))) {
        pendingLink.current = null
        return 'expired'
      }
      return fail(err)
    }
    if (result.status !== 'approved' || !result.ephemeralPublicKey || !result.wrappedKey) return 'pending'
    pendingLink.current = null
    const dataKey = openFromDevice(link.pair, result.ephemeralPublicKey, result.wrappedKey)
    const expected = account.current?.keyProofHash
    if (expected && keyProofHash(dataKey) !== expected) {
      return fail(new Error('The key received did not match this account — please try again'))
    }
    await storeKey(dataKey)
    unlockWith(dataKey)
    return 'approved'
  }, [fail, requireToken, storeKey, unlockWith])

  // ── Approving another device (this device holds the key) ──
  const listPendingDevices = useCallback(async (): Promise<PendingDevice[]> => {
    if (!state.token || !state.dataKey) return []
    const { requests } = await ArthaApi.pendingDevices(state.token)
    return requests.map((r) => ({ ...r, code: linkCode(r.publicKey) }))
  }, [state.token, state.dataKey])

  const approveDevice = useCallback(
    async (device: PendingDevice) => {
      if (!state.dataKey) throw new Error("This device doesn't have the account key")
      const sealed = sealForDevice(state.dataKey, device.publicKey)
      await ArthaApi.approveDevice(
        requireToken(),
        device.id,
        sealed.ephemeralPublicKey,
        sealed.wrappedKey,
        keyProof(state.dataKey).toString('base64')
      )
    },
    [requireToken, state.dataKey]
  )

  const denyDevice = useCallback(
    async (id: string) => {
      await ArthaApi.linkDelete(requireToken(), id)
    },
    [requireToken]
  )

  const rotateRecoveryKey = useCallback(async (): Promise<string> => {
    if (!state.dataKey) throw new Error("This device doesn't have the account key")
    const recovery = generateRecoveryKey()
    await ArthaApi.keysRotateRecovery(
      requireToken(),
      wrapWithRecoveryKey(state.dataKey, recovery),
      keyProof(state.dataKey).toString('base64')
    )
    return formatRecoveryKey(recovery)
  }, [requireToken, state.dataKey])

  const resetCloudData = useCallback(async () => {
    clearError()
    try {
      account.current = await ArthaApi.keysReset(requireToken())
      await secureStore.clearDataKey()
      resetSyncBookkeeping()
      setState((s) => ({ ...s, status: 'needsKey', dataKey: null, keyState: 'none' }))
    } catch (err) {
      fail(err)
    }
  }, [clearError, fail, requireToken])

  // ── Unlock ──
  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    try {
      const dataKey = await secureStore.loadDataKey()
      if (!dataKey) return false
      unlockWith(dataKey)
      return true
    } catch {
      return false
    }
  }, [unlockWith])

  // Works offline and without Face ID: the phone's own passcode releases the fallback
  // copy (see secureStore.ts). Replaces the old typed-master-password fallback.
  const unlockWithDevicePasscode = useCallback(async (): Promise<boolean> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Artha',
        disableDeviceFallback: false
      })
      if (!result.success) return false
      const dataKey = await secureStore.loadDataKeyAfterDeviceAuth()
      if (!dataKey) return false
      unlockWith(dataKey)
      return true
    } catch {
      return false
    }
  }, [unlockWith])

  const signOut = useCallback(async () => {
    await cancelDeviceLink()
    await secureStore.clearSession()
    await secureStore.clearDataKey()
    await secureStore.clearLegacyUnlockItems()
    account.current = null
    setState({ status: 'signedOut', email: null, token: null, dataKey: null, keyState: null, error: null })
  }, [cancelDeviceLink])

  // Clean slate on this device only — the cloud account is untouched.
  const wipeDeviceAndStartOver = useCallback(async () => {
    wipeLocalDb()
    await secureStore.clearSession()
    await secureStore.clearDataKey()
    await secureStore.clearLegacyUnlockItems()
    await secureStore.clearApiKey('anthropicApiKey')
    await secureStore.clearApiKey('openaiApiKey')
    account.current = null
    setState({ status: 'signedOut', email: null, token: null, dataKey: null, keyState: null, error: null })
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      startEmailSignIn,
      verifyEmailSignIn,
      oauthSignIn,
      refreshAccount,
      createKey,
      convertLegacy,
      finishKeySetup,
      useRecoveryKey,
      startDeviceLink,
      pollDeviceLink,
      cancelDeviceLink,
      listPendingDevices,
      approveDevice,
      denyDevice,
      rotateRecoveryKey,
      resetCloudData,
      unlockWithBiometrics,
      unlockWithDevicePasscode,
      signOut,
      wipeDeviceAndStartOver,
      clearError
    }),
    [
      state,
      startEmailSignIn,
      verifyEmailSignIn,
      oauthSignIn,
      refreshAccount,
      createKey,
      convertLegacy,
      finishKeySetup,
      useRecoveryKey,
      startDeviceLink,
      pollDeviceLink,
      cancelDeviceLink,
      listPendingDevices,
      approveDevice,
      denyDevice,
      rotateRecoveryKey,
      resetCloudData,
      unlockWithBiometrics,
      unlockWithDevicePasscode,
      signOut,
      wipeDeviceAndStartOver,
      clearError
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
