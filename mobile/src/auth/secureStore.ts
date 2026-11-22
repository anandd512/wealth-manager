import * as SecureStore from 'expo-secure-store'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { Buffer } from 'buffer'

/**
 * Local-device-only storage (iOS Keychain / Android Keystore via expo-secure-store).
 * The Data Key is gated behind Face ID so the app unlocks on launch without asking for
 * anything else; it only has to be fetched again (device approval or recovery key)
 * if this device is wiped or signed out.
 *
 * `requireAuthentication` needs NSFaceIDUsageDescription from this app's own
 * Info.plist (already set in app.json), which only takes effect in a dev client
 * or standalone build — Expo Go runs a fixed binary and ignores it. So it's
 * skipped under Expo Go; the key is still Keychain-encrypted, just not Face-ID-gated.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

const SESSION_KEY = 'artha.session'
const DATA_KEY_KEY = 'artha.dataKey'
// Second copy of the Data Key, not biometric-gated, released only after the phone's
// own passcode/biometric check (expo-local-authentication) in UnlockScreen. It's what
// lets a passwordless account still unlock offline when Face ID fails or isn't set
// up — the old design used a typed master password for that. Still Keychain/Keystore
// encrypted and bound to this device (THIS_DEVICE_ONLY: never in backups).
const DATA_KEY_FALLBACK_KEY = 'artha.dataKey.fallback'
// sha256(HKDF(DataKey,'artha-key-proof')) — not secret. Lets sign-in check whether the
// key already on this device is the account's current one without a Face ID prompt.
const DATA_KEY_PROOF_KEY = 'artha.dataKeyProofHash'

export interface StoredSession {
  email: string
  userId: string
  token: string
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session))
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY)
}

export async function saveDataKey(dataKey: Buffer, proofHash: string): Promise<void> {
  await SecureStore.setItemAsync(DATA_KEY_KEY, dataKey.toString('base64'), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    ...(isExpoGo ? {} : { requireAuthentication: true, authenticationPrompt: 'Unlock Artha' })
  })
  await SecureStore.setItemAsync(DATA_KEY_FALLBACK_KEY, dataKey.toString('base64'), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  })
  await SecureStore.setItemAsync(DATA_KEY_PROOF_KEY, proofHash)
}

/** Triggers the system Face ID / fingerprint prompt (outside Expo Go). Throws if the
 * user cancels or biometry isn't enrolled — callers fall back to the passcode path. */
export async function loadDataKey(): Promise<Buffer | null> {
  const raw = await SecureStore.getItemAsync(
    DATA_KEY_KEY,
    isExpoGo ? undefined : { requireAuthentication: true, authenticationPrompt: 'Unlock Artha' }
  )
  return raw ? Buffer.from(raw, 'base64') : null
}

/** Only call after LocalAuthentication.authenticateAsync() succeeded — see UnlockScreen. */
export async function loadDataKeyAfterDeviceAuth(): Promise<Buffer | null> {
  const raw = await SecureStore.getItemAsync(DATA_KEY_FALLBACK_KEY)
  return raw ? Buffer.from(raw, 'base64') : null
}

export async function loadDataKeyProofHash(): Promise<string | null> {
  return SecureStore.getItemAsync(DATA_KEY_PROOF_KEY)
}

export async function clearDataKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DATA_KEY_KEY)
  await SecureStore.deleteItemAsync(DATA_KEY_FALLBACK_KEY)
  await SecureStore.deleteItemAsync(DATA_KEY_PROOF_KEY)
}

// Left behind by the pre-passwordless offline-unlock design (KDF salt + verifier for
// the old master password). Nothing reads them any more; removed on sign-out/wipe.
export async function clearLegacyUnlockItems(): Promise<void> {
  await SecureStore.deleteItemAsync('artha.offlineSalt')
  await SecureStore.deleteItemAsync('artha.offlineVerifier')
}

// Per-device preference (never synced — biometric hardware/enrollment is a device
// property, not an account one) for whether app unlock should attempt Face ID/
// passcode at all. Defaults to enabled; UnlockScreen checks this before trying.
const BIOMETRIC_ENABLED_KEY = 'artha.biometricEnabled'

export async function saveBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? '1' : '0')
}

export async function loadBiometricEnabled(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)
  return raw !== '0'
}

// Per-device — whether the onboarding tour has been shown. Not synced: a tour is a
// one-time "orient the user on this device/install" thing, not account state, same
// reasoning as biometricEnabled above.
const TOUR_SEEN_KEY = 'artha.tourSeen'

export async function saveTourSeen(seen: boolean): Promise<void> {
  await SecureStore.setItemAsync(TOUR_SEEN_KEY, seen ? '1' : '0')
}

export async function loadTourSeen(): Promise<boolean> {
  return (await SecureStore.getItemAsync(TOUR_SEEN_KEY)) === '1'
}

// AI provider API keys — deliberately per-device, same as desktop's secrets.ts
// (getSecret('anthropicApiKey')/getSecret('openaiApiKey')): never synced, so a key
// pasted on one device doesn't silently travel to another.
const API_KEY_PREFIX = 'artha.apiKey.'

export async function saveApiKey(name: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_PREFIX + name, value)
}

export async function loadApiKey(name: string): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY_PREFIX + name)
}

export async function clearApiKey(name: string): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_PREFIX + name)
}
