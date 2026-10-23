import React, { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'

export function AuthScreen() {
  const { requestEmailVerification, register, login, error } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  // Register mode only: null until a code's been emailed, then holds the address it
  // was sent to (so a later email edit doesn't silently verify the wrong address).
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const passwordsMismatch = mode === 'register' && passwordConfirm.length > 0 && password !== passwordConfirm

  const submit = async () => {
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(email.trim().toLowerCase(), password)
        return
      }
      await requestEmailVerification(email.trim().toLowerCase())
      setVerificationSentTo(email.trim().toLowerCase())
    } catch {
      // error is surfaced via the shared `error` field from useAuth()
    } finally {
      setSubmitting(false)
    }
  }

  const confirmAndRegister = async () => {
    if (!verificationSentTo) return
    setSubmitting(true)
    try {
      await register(verificationSentTo, password, verificationCode)
    } catch {
      // surfaced via the shared `error` field
    } finally {
      setSubmitting(false)
    }
  }

  if (verificationSentTo) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to {verificationSentTo}. It expires in 15 minutes.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Verification code"
          keyboardType="number-pad"
          maxLength={6}
          value={verificationCode}
          onChangeText={(t) => setVerificationCode(t.replace(/\D/g, ''))}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={styles.button}
          onPress={confirmAndRegister}
          disabled={submitting || verificationCode.length !== 6}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verify & create account</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setVerificationSentTo(null)
            setVerificationCode('')
          }}
        >
          <Text style={styles.switchMode}>Use a different email</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Artha</Text>
      <Text style={styles.subtitle}>
        {mode === 'register'
          ? 'Create your master password. It never leaves this device.'
          : 'Unlock with your master password.'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Master password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {mode === 'register' && (
        <TextInput
          style={styles.input}
          placeholder="Confirm master password"
          secureTextEntry
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
        />
      )}
      {passwordsMismatch ? <Text style={styles.error}>Passwords don't match.</Text> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={styles.button}
        onPress={submit}
        disabled={
          submitting ||
          !email ||
          !password ||
          (mode === 'register' && (!passwordConfirm || password !== passwordConfirm))
        }
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === 'register' ? 'Send verification code' : 'Unlock'}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'register' ? 'login' : 'register')}>
        <Text style={styles.switchMode}>
          {mode === 'register' ? 'Already have an account? Log in' : "Don't have an account? Register"}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchMode: { color: '#555', textAlign: 'center', marginTop: 16 },
  error: { color: '#c0392b', marginBottom: 12, textAlign: 'center' }
})
