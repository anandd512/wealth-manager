import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { loadBiometricEnabled } from '../auth/secureStore'
import { authStyles as styles } from '../components/authStyles'

/** App launch with a session and a stored key: Face ID straight away, or the phone's
 * own passcode (works offline, and when Face ID is off or fails). No app password. */
export function UnlockScreen() {
  const { email, unlockWithBiometrics, unlockWithDevicePasscode, signOut } = useAuth()
  const [attempting, setAttempting] = useState(true)
  const [failed, setFailed] = useState(false)

  const tryBiometrics = async () => {
    setAttempting(true)
    setFailed(false)
    const ok = await unlockWithBiometrics()
    setAttempting(false)
    if (!ok) setFailed(true)
  }

  const tryPasscode = async () => {
    setAttempting(true)
    setFailed(false)
    const ok = await unlockWithDevicePasscode()
    setAttempting(false)
    if (!ok) setFailed(true)
  }

  useEffect(() => {
    loadBiometricEnabled().then((enabled) => void (enabled ? tryBiometrics() : tryPasscode()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={[styles.container, { flex: 1 }]}>
      <Text style={styles.title}>Artha</Text>
      <Text style={styles.subtitle}>{email}</Text>

      {attempting ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : failed ? (
        <>
          <Text style={styles.error}>Couldn't unlock.</Text>
          <Pressable style={styles.button} onPress={tryBiometrics}>
            <Text style={styles.buttonText}>Try Face ID again</Text>
          </Pressable>
          <Pressable onPress={tryPasscode}>
            <Text style={styles.link}>Use phone passcode instead</Text>
          </Pressable>
          <Pressable onPress={() => void signOut()}>
            <Text style={styles.link}>Sign out</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  )
}
