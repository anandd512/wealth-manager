import React, { useState } from 'react'
import { Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { friendlyErrorMessage } from '../lib/friendlyError'

const MIN_PASSWORD_LENGTH = 8

function passwordStrength(pw: string): { label: string; color: string } | null {
  if (!pw) return null
  let score = 0
  if (pw.length >= MIN_PASSWORD_LENGTH) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Weak', color: '#c0392b' }
  if (score <= 2) return { label: 'Fair', color: '#b8860b' }
  if (score <= 3) return { label: 'Good', color: '#2e7d32' }
  return { label: 'Strong', color: '#2e7d32' }
}

export function AuthScreen() {
  const { requestEmailVerification, register, login, error, wipeDeviceAndStartOver } = useAuth()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  // Register mode only: null until a code's been emailed, then holds the address it
  // was sent to (so a later email edit doesn't silently verify the wrong address).
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [wiping, setWiping] = useState(false)

  const passwordsMismatch = mode === 'register' && passwordConfirm.length > 0 && password !== passwordConfirm
  const passwordTooShort = mode === 'register' && password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const strength = mode === 'register' ? passwordStrength(password) : null

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

  const confirmWipe = () => {
    Alert.alert(
      'Erase this device?',
      "This is permanent. Everything cached on this device — accounts, policies, IDs, credit cards, vault entries, and uploaded files — will be erased. There's no undo, and your old account's password still can't be recovered (that's what keeps it private). You can sign in correctly afterward if the password comes back to you, or register fresh.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase & start over',
          style: 'destructive',
          onPress: async () => {
            setWiping(true)
            await wipeDeviceAndStartOver()
            setWiping(false)
            setMode('login')
          }
        }
      ]
    )
  }

  if (mode === 'forgot') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Forgot your password</Text>
        <Text style={styles.subtitle}>
          Artha uses zero-knowledge encryption — your master password is never stored anywhere,
          including on our servers, so it genuinely can't be recovered or reset.
        </Text>
        <Text style={[styles.subtitle, styles.warningText]}>
          The only way forward is to erase this device's local data and start over. Your old
          account's data stays encrypted and unreachable — this doesn't recover it, it just lets
          you move on.
        </Text>
        <Pressable style={styles.dangerButton} onPress={confirmWipe} disabled={wiping}>
          {wiping ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Erase this device & start over</Text>}
        </Pressable>
        <Pressable onPress={() => setMode('login')}>
          <Text style={styles.switchMode}>Back to login</Text>
        </Pressable>
      </View>
    )
  }

  if (verificationSentTo) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
          returnKeyType="done"
          onSubmitEditing={() => verificationCode.length === 6 && void confirmAndRegister()}
        />

        {error ? <Text style={styles.error}>{friendlyErrorMessage(error)}</Text> : null}

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
          <Text style={styles.switchMode}>Use a different email, or resend the code</Text>
        </Pressable>
      </KeyboardAvoidingView>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
        returnKeyType="next"
      />
      <TextInput
        style={styles.input}
        placeholder="Master password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        returnKeyType={mode === 'register' ? 'next' : 'done'}
        onSubmitEditing={mode === 'login' ? submit : undefined}
      />
      {mode === 'register' && strength && (
        <Text style={[styles.strengthText, { color: strength.color }]}>Password strength: {strength.label}</Text>
      )}
      {mode === 'register' && (
        <TextInput
          style={styles.input}
          placeholder="Confirm master password"
          secureTextEntry
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      )}
      {passwordTooShort ? (
        <Text style={styles.error}>Use at least {MIN_PASSWORD_LENGTH} characters.</Text>
      ) : null}
      {passwordsMismatch ? <Text style={styles.error}>Passwords don't match.</Text> : null}
      {mode === 'register' && (
        <Text style={styles.warningText}>
          This can't be recovered if you forget it — that's what keeps your data private. Keep it
          somewhere safe.
        </Text>
      )}

      {error ? <Text style={styles.error}>{friendlyErrorMessage(error)}</Text> : null}

      <Pressable
        style={styles.button}
        onPress={submit}
        disabled={
          submitting ||
          !email ||
          !password ||
          (mode === 'register' && (password.length < MIN_PASSWORD_LENGTH || !passwordConfirm || password !== passwordConfirm))
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
      {mode === 'login' && (
        <Pressable onPress={() => setMode('forgot')}>
          <Text style={styles.switchMode}>Forgot password?</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
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
  strengthText: { fontSize: 12, fontWeight: '600', marginTop: -6, marginBottom: 12 },
  warningText: { fontSize: 12, color: '#b8860b', textAlign: 'center', marginBottom: 12, lineHeight: 17 },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8
  },
  dangerButton: {
    backgroundColor: '#c0392b',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchMode: { color: '#555', textAlign: 'center', marginTop: 16 },
  error: { color: '#c0392b', marginBottom: 12, textAlign: 'center' }
})
