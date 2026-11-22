import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { useAuth } from '../auth/AuthContext'
import { friendlyErrorMessage } from '../lib/friendlyError'
import { authStyles as styles } from '../components/authStyles'

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </Svg>
  )
}

function MicrosoftMark() {
  return (
    <Svg width={16} height={16} viewBox="0 0 21 21">
      <Rect x={1} y={1} width={9} height={9} fill="#F25022" />
      <Rect x={11} y={1} width={9} height={9} fill="#7FBA00" />
      <Rect x={1} y={11} width={9} height={9} fill="#00A4EF" />
      <Rect x={11} y={11} width={9} height={9} fill="#FFB900" />
    </Svg>
  )
}

/** Sign in with Google, Microsoft, or an emailed 6-digit code. No passwords — the first
 * sign-in for an address creates the account. */
export function AuthScreen() {
  const { startEmailSignIn, verifyEmailSignIn, oauthSignIn, error, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<null | 'google' | 'microsoft' | 'send' | 'verify'>(null)

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind)
    try {
      await fn()
    } catch {
      // surfaced through the shared `error` from useAuth()
    } finally {
      setBusy(null)
    }
  }

  const sendCode = () =>
    run('send', async () => {
      const address = email.trim().toLowerCase()
      await startEmailSignIn(address)
      setCodeSentTo(address)
      setCode('')
    })

  if (codeSentTo) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>We sent a 6-digit sign-in code to {codeSentTo}. It expires in 15 minutes.</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="000000"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
            autoFocus
            onSubmitEditing={() => code.length === 6 && run('verify', () => verifyEmailSignIn(codeSentTo, code))}
          />
          {error ? <Text style={styles.error}>{friendlyErrorMessage(error)}</Text> : null}
          <Pressable
            style={[styles.button, (busy !== null || code.length !== 6) && styles.disabled]}
            onPress={() => run('verify', () => verifyEmailSignIn(codeSentTo, code))}
            disabled={busy !== null || code.length !== 6}
          >
            {busy === 'verify' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
          </Pressable>
          <Pressable onPress={sendCode} disabled={busy !== null}>
            <Text style={styles.link}>Send a new code</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setCodeSentTo(null)
              clearError()
            }}
          >
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Artha</Text>
        <Text style={styles.subtitle}>Sign in to sync your encrypted data with your other devices.</Text>

        <Pressable style={styles.outlineButton} onPress={() => run('google', () => oauthSignIn('google'))} disabled={busy !== null}>
          {busy === 'google' ? <ActivityIndicator /> : <GoogleMark />}
          <Text style={styles.outlineButtonText}>Continue with Google</Text>
        </Pressable>
        <Pressable style={styles.outlineButton} onPress={() => run('microsoft', () => oauthSignIn('microsoft'))} disabled={busy !== null}>
          {busy === 'microsoft' ? <ActivityIndicator /> : <MicrosoftMark />}
          <Text style={styles.outlineButtonText}>Continue with Microsoft</Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or use your email</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          returnKeyType="send"
          onSubmitEditing={() => email.includes('@') && sendCode()}
        />
        {error ? <Text style={styles.error}>{friendlyErrorMessage(error)}</Text> : null}
        <Pressable
          style={[styles.button, (busy !== null || !email.includes('@')) && styles.disabled]}
          onPress={sendCode}
          disabled={busy !== null || !email.includes('@')}
        >
          {busy === 'send' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Email me a sign-in code</Text>}
        </Pressable>
        <Text style={styles.help}>No password needed. New here? Signing in creates your account.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
