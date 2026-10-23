import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'

/** Shown when a session exists but the Data Key isn't in memory yet (fresh app
 * launch) — tries Face ID immediately, with a manual retry if it's declined. */
export function UnlockScreen() {
  const { email, unlockWithBiometrics, signOut } = useAuth()
  const [attempting, setAttempting] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void tryUnlock()
  }, [])

  const tryUnlock = async () => {
    setAttempting(true)
    setFailed(false)
    const ok = await unlockWithBiometrics()
    setAttempting(false)
    if (!ok) setFailed(true)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Artha</Text>
      <Text style={styles.subtitle}>{email}</Text>

      {attempting ? (
        <ActivityIndicator style={styles.spinner} />
      ) : failed ? (
        <>
          <Text style={styles.error}>Couldn't unlock with Face ID.</Text>
          <Pressable style={styles.button} onPress={tryUnlock}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
          <Pressable onPress={() => void signOut()}>
            <Text style={styles.switchMode}>Sign out and use master password instead</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 24 },
  spinner: { marginTop: 24 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchMode: { color: '#555', textAlign: 'center', marginTop: 16 },
  error: { color: '#c0392b', marginBottom: 12, textAlign: 'center' }
})
