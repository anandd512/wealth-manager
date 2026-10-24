import React, { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'

/** Shown when a session exists but the Data Key isn't in memory yet (fresh app
 * launch) — tries Face ID immediately, with a manual retry if it's declined, and a
 * master-password fallback that works with zero network connectivity (see
 * AuthContext's unlockWithPassword) for whenever biometrics aren't available at all. */
export function UnlockScreen() {
  const { email, unlockWithBiometrics, unlockWithPassword, signOut } = useAuth()
  const [attempting, setAttempting] = useState(true)
  const [failed, setFailed] = useState(false)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

  const submitPassword = async () => {
    setPasswordError(null)
    setSubmitting(true)
    const ok = await unlockWithPassword(password)
    setSubmitting(false)
    if (!ok) setPasswordError('Incorrect password.')
  }

  if (usePassword) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Text style={styles.title}>Artha</Text>
        <Text style={styles.subtitle}>{email}</Text>

        <TextInput
          style={styles.input}
          placeholder="Master password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submitPassword}
        />
        {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}

        <Pressable style={styles.button} onPress={submitPassword} disabled={submitting || !password}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Unlock</Text>}
        </Pressable>

        <Pressable
          onPress={() => {
            setUsePassword(false)
            setPassword('')
            setPasswordError(null)
          }}
        >
          <Text style={styles.switchMode}>Use Face ID instead</Text>
        </Pressable>
      </KeyboardAvoidingView>
    )
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
          <Pressable onPress={() => setUsePassword(true)}>
            <Text style={styles.switchMode}>Use master password instead</Text>
          </Pressable>
          <Pressable onPress={() => void signOut()}>
            <Text style={styles.switchMode}>Sign out</Text>
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
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchMode: { color: '#555', textAlign: 'center', marginTop: 16 },
  error: { color: '#c0392b', marginBottom: 12, textAlign: 'center' }
})
