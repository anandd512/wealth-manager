import * as SecureStore from 'expo-secure-store'
import { Buffer } from '@craftzdog/react-native-buffer'

/**
 * Local-device-only storage (iOS Keychain / Android Keystore via expo-secure-store).
 * The Data Key is gated behind Face ID / device passcode so the app can unlock on
 * launch without retyping the master password — see CryptoBox's module doc for why
 * the key itself never needs to be re-derived unless this device is wiped.
 */

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
    requireAuthentication: true,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    authenticationPrompt: 'Unlock Artha'
  })
}

/** Triggers the system Face ID / passcode prompt. Throws if the user cancels or
 * biometry isn't enrolled — callers should fall back to the master-password screen. */
export async function loadDataKey(): Promise<Buffer | null> {
  const raw = await SecureStore.getItemAsync(DATA_KEY_KEY, {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock Artha'
  })
  return raw ? Buffer.from(raw, 'base64') : null
}

export async function clearDataKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DATA_KEY_KEY)
}
