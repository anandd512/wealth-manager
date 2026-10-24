import * as SecureStore from 'expo-secure-store'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { Buffer } from 'buffer'

/**
 * Local-device-only storage (iOS Keychain / Android Keystore via expo-secure-store).
 * The Data Key is gated behind Face ID / device passcode so the app can unlock on
 * launch without retyping the master password — see CryptoBox's module doc for why
 * the key itself never needs to be re-derived unless this device is wiped.
 *
 * `requireAuthentication` needs NSFaceIDUsageDescription from this app's own
 * Info.plist (already set in app.json), which only takes effect in a dev client
 * or standalone build — Expo Go runs a fixed binary and ignores it. So it's
 * skipped under Expo Go; the key is still Keychain-encrypted, just not Face-ID-gated.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

const SESSION_KEY = 'artha.session'
const DATA_KEY_KEY = 'artha.dataKey'

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

export async function saveDataKey(dataKey: Buffer): Promise<void> {
  await SecureStore.setItemAsync(DATA_KEY_KEY, dataKey.toString('base64'), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    ...(isExpoGo ? {} : { requireAuthentication: true, authenticationPrompt: 'Unlock Artha' })
  })
}

/** Triggers the system Face ID / passcode prompt (outside Expo Go). Throws if the
 * user cancels or biometry isn't enrolled — callers should fall back to the
 * master-password screen. */
export async function loadDataKey(): Promise<Buffer | null> {
  const raw = await SecureStore.getItemAsync(
    DATA_KEY_KEY,
    isExpoGo ? undefined : { requireAuthentication: true, authenticationPrompt: 'Unlock Artha' }
  )
  return raw ? Buffer.from(raw, 'base64') : null
}

export async function clearDataKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DATA_KEY_KEY)
}

// Cached after the first successful login/register so unlock can fall back to a
// typed master password with no network round-trip — see AuthContext's
// unlockWithPassword. Not biometric-gated (it has to be readable precisely when
// biometric unlock has failed), but it's still Keychain/Keystore-encrypted at rest
// like everything else here, and on its own it reveals nothing: the salt is
// non-secret by design (KDF salts aren't secrets) and the verifier is a one-way
// hash of the Data Key, not the Data Key itself.
const OFFLINE_SALT_KEY = 'artha.offlineSalt'
const OFFLINE_VERIFIER_KEY = 'artha.offlineVerifier'

export interface OfflineUnlockInfo {
  saltHex: string
  verifier: string
}

export async function saveOfflineUnlockInfo(info: OfflineUnlockInfo): Promise<void> {
  await SecureStore.setItemAsync(OFFLINE_SALT_KEY, info.saltHex)
  await SecureStore.setItemAsync(OFFLINE_VERIFIER_KEY, info.verifier)
}

export async function loadOfflineUnlockInfo(): Promise<OfflineUnlockInfo | null> {
  const saltHex = await SecureStore.getItemAsync(OFFLINE_SALT_KEY)
  const verifier = await SecureStore.getItemAsync(OFFLINE_VERIFIER_KEY)
  return saltHex && verifier ? { saltHex, verifier } : null
}

export async function clearOfflineUnlockInfo(): Promise<void> {
  await SecureStore.deleteItemAsync(OFFLINE_SALT_KEY)
  await SecureStore.deleteItemAsync(OFFLINE_VERIFIER_KEY)
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
