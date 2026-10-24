import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Buffer } from 'buffer'
import { ArthaApi } from '../api/arthaApi'
import { deriveKeys, deriveVerifier, generateSaltHex } from '../crypto/cryptoBox'
import * as secureStore from './secureStore'
import { wipeLocalDb } from '../db/db'

interface AuthState {
  status: 'loading' | 'locked' | 'unlocked' | 'signedOut'
  email: string | null
  token: string | null
  dataKey: Buffer | null
  error: string | null
}

interface AuthContextValue extends AuthState {
  requestEmailVerification: (email: string) => Promise<void>
  register: (email: string, password: string, verificationCode: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  unlockWithBiometrics: () => Promise<boolean>
  unlockWithPassword: (password: string) => Promise<boolean>
  signOut: () => Promise<void>
  wipeDeviceAndStartOver: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/** scrypt cost parameters sent to the backend at registration (see backend/src/lib/cosmos.ts
 * `UserDoc.kdfParams`), stored rather than hardcoded server-side so a future device
 * can read back whatever parameters this account was actually created with. Must match
 * CryptoBox.deriveKeys' own scrypt call, and should match the Electron client's
 * src/main/auth.ts N/r/p once that app's sync client is built (phase 3) so a password
 * typed on either device derives the same keys. */
const SCRYPT_KDF_PARAMS = { N: 1 << 15, r: 8, p: 1 }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    email: null,
    token: null,
    dataKey: null,
    error: null
  })

  useEffect(() => {
    secureStore.loadSession().then((session) => {
      if (session) {
        setState((s) => ({ ...s, status: 'locked', email: session.email, token: session.token }))
      } else {
        setState((s) => ({ ...s, status: 'signedOut' }))
      }
    })
  }, [])

  const requestEmailVerification = useCallback(async (email: string) => {
    setState((s) => ({ ...s, error: null }))
    try {
      await ArthaApi.requestEmailVerification(email)
    } catch (err) {
      setState((s) => ({ ...s, error: (err as Error).message }))
      throw err
    }
  }, [])

  const register = useCallback(async (email: string, password: string, verificationCode: string) => {
    setState((s) => ({ ...s, error: null }))
    try {
      const { verificationToken } = await ArthaApi.confirmEmailVerification(email, verificationCode)
      const saltHex = generateSaltHex()
      const { authKey, dataKey } = await deriveKeys(password, saltHex)
      const result = await ArthaApi.register(email, saltHex, SCRYPT_KDF_PARAMS, authKey, verificationToken)
      await secureStore.saveSession({ email, userId: result.userId, token: result.token })
      await secureStore.saveDataKey(dataKey)
      await secureStore.saveOfflineUnlockInfo({ saltHex, verifier: deriveVerifier(dataKey) })
      setState({ status: 'unlocked', email, token: result.token, dataKey, error: null })
    } catch (err) {
      setState((s) => ({ ...s, error: (err as Error).message }))
      throw err
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, error: null }))
    try {
      const salt = await ArthaApi.fetchSalt(email)
      const saltHex = Buffer.from(salt.kdfSalt, 'base64').toString('hex')
      const { authKey, dataKey } = await deriveKeys(password, saltHex)
      const result = await ArthaApi.login(email, authKey)
      await secureStore.saveSession({ email, userId: result.userId, token: result.token })
      await secureStore.saveDataKey(dataKey)
      await secureStore.saveOfflineUnlockInfo({ saltHex, verifier: deriveVerifier(dataKey) })
      setState({ status: 'unlocked', email, token: result.token, dataKey, error: null })
    } catch (err) {
      setState((s) => ({ ...s, error: (err as Error).message }))
      throw err
    }
  }, [])

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    try {
      const dataKey = await secureStore.loadDataKey()
      const session = await secureStore.loadSession()
      if (!dataKey || !session) return false
      setState({ status: 'unlocked', email: session.email, token: session.token, dataKey, error: null })
      return true
    } catch {
      return false
    }
  }, [])

  // Falls back on a typed master password when biometric/passcode unlock isn't
  // available — the one path that works with zero network connectivity, closing the
  // gap where a cloud-sync user with no signal otherwise couldn't reach their own
  // already-downloaded local data. Re-derives the same Data Key deterministically
  // from the cached KDF salt (see register/login above) and checks it against the
  // cached verifier before trusting it; re-saves to the biometric-gated key too so
  // the next biometric unlock succeeds again.
  const unlockWithPassword = useCallback(async (password: string): Promise<boolean> => {
    try {
      const info = await secureStore.loadOfflineUnlockInfo()
      const session = await secureStore.loadSession()
      if (!info || !session) return false
      const { dataKey } = await deriveKeys(password, info.saltHex)
      if (deriveVerifier(dataKey) !== info.verifier) return false
      await secureStore.saveDataKey(dataKey)
      setState({ status: 'unlocked', email: session.email, token: session.token, dataKey, error: null })
      return true
    } catch {
      return false
    }
  }, [])

  const signOut = useCallback(async () => {
    await secureStore.clearSession()
    await secureStore.clearDataKey()
    await secureStore.clearOfflineUnlockInfo()
    setState({ status: 'signedOut', email: null, token: null, dataKey: null, error: null })
  }, [])

  // "Forgot password" escape hatch — zero-knowledge means a lost master password is
  // genuinely unrecoverable (it's the only key, nothing server-side can reset it),
  // so the only way forward is a clean slate on this device: wipe the local cache
  // and every cached credential, then return to sign-in so the user can either log
  // in correctly if the password does come back to them, or register fresh.
  // Mirrors desktop's AuthGate "Reset all data & start fresh" for the same reason,
  // though it only ever touches this device — there's no account-deletion endpoint
  // on the backend, so the old cloud account (if any) is untouched either way.
  const wipeDeviceAndStartOver = useCallback(async () => {
    wipeLocalDb()
    await secureStore.clearSession()
    await secureStore.clearDataKey()
    await secureStore.clearOfflineUnlockInfo()
    await secureStore.clearApiKey('anthropicApiKey')
    await secureStore.clearApiKey('openaiApiKey')
    setState({ status: 'signedOut', email: null, token: null, dataKey: null, error: null })
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      requestEmailVerification,
      register,
      login,
      unlockWithBiometrics,
      unlockWithPassword,
      signOut,
      wipeDeviceAndStartOver
    }),
    [
      state,
      requestEmailVerification,
      register,
      login,
      unlockWithBiometrics,
      unlockWithPassword,
      signOut,
      wipeDeviceAndStartOver
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
