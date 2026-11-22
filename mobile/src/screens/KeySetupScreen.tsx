import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { friendlyErrorMessage } from '../lib/friendlyError'
import { RecoveryKeyView } from '../components/RecoveryKeyView'
import { authStyles as styles } from '../components/authStyles'

const POLL_MS = 2500

/** Signed in, but this phone doesn't hold the account's encryption key yet. */
export function KeySetupScreen() {
  const { keyState, email, error, refreshAccount, createKey, convertLegacy, finishKeySetup, signOut } = useAuth()
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (keyState === null) refreshAccount().catch(() => undefined)
  }, [keyState, refreshAccount])

  const footer = (
    <Pressable onPress={() => void signOut()}>
      <Text style={styles.link}>Signed in as {email ?? 'your account'} · Use a different account</Text>
    </Pressable>
  )

  const wrap = (body: React.ReactNode) => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  )

  if (recoveryKey) return wrap(<RecoveryKeyView recoveryKey={recoveryKey} onDone={finishKeySetup} />)

  if (keyState === null) {
    return wrap(
      <>
        {error ? <Text style={styles.error}>{friendlyErrorMessage(error)}</Text> : <ActivityIndicator />}
        {footer}
      </>
    )
  }

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    try {
      setRecoveryKey(await fn())
    } catch {
      // shown via `error`
    } finally {
      setBusy(false)
    }
  }

  if (keyState === 'none') {
    return wrap(
      <>
        <Text style={styles.title}>Secure your account</Text>
        <Text style={styles.subtitle}>
          Artha creates an encryption key on this phone. Everything is encrypted with it before it's uploaded, so the
          server only ever stores data it can't read. You'll get a recovery key to keep as a backup.
        </Text>
        {error ? <Text style={styles.error}>{friendlyErrorMessage(error)}</Text> : null}
        <Pressable style={[styles.button, busy && styles.disabled]} onPress={() => run(createKey)} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create my encryption key</Text>}
        </Pressable>
        {footer}
      </>
    )
  }

  if (keyState === 'legacy') {
    return wrap(
      <>
        <Text style={styles.title}>One-time upgrade</Text>
        <Text style={styles.subtitle}>
          This account was set up with a password. Enter it one last time to unlock your existing data — after this
          you'll sign in without a password and keep a recovery key instead.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Old Artha password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoFocus
          onSubmitEditing={() => password && run(() => convertLegacy(password))}
        />
        {error ? <Text style={styles.error}>{friendlyErrorMessage(error)}</Text> : null}
        <Pressable
          style={[styles.button, (busy || !password) && styles.disabled]}
          onPress={() => run(() => convertLegacy(password))}
          disabled={busy || !password}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Unlock and upgrade</Text>}
        </Pressable>
        {footer}
      </>
    )
  }

  return wrap(
    <>
      <ExistingAccountKey />
      {footer}
    </>
  )
}

function ExistingAccountKey() {
  const { error, startDeviceLink, pollDeviceLink, cancelDeviceLink, useRecoveryKey, resetCloudData } = useAuth()
  const [method, setMethod] = useState<'approve' | 'recovery' | 'reset'>('approve')
  const [code, setCode] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [recoveryText, setRecoveryText] = useState('')
  const [resetText, setResetText] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }, [])

  const begin = useCallback(async () => {
    stop()
    setExpired(false)
    setCode(null)
    try {
      const { code: c } = await startDeviceLink()
      setCode(c)
      timer.current = setInterval(async () => {
        try {
          const status = await pollDeviceLink()
          if (status === 'expired') {
            stop()
            setExpired(true)
          } else if (status === 'approved') stop()
        } catch {
          stop()
        }
      }, POLL_MS)
    } catch {
      // shown via `error`
    }
  }, [pollDeviceLink, startDeviceLink, stop])

  useEffect(() => {
    if (method === 'approve') void begin()
    return () => {
      stop()
      void cancelDeviceLink()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method])

  const submitRecovery = async () => {
    setBusy(true)
    try {
      await useRecoveryKey(recoveryText)
    } catch {
      // shown via `error`
    } finally {
      setBusy(false)
    }
  }

  if (method === 'reset') {
    return (
      <>
        <View style={[styles.callout, styles.calloutDanger]}>
          <Text style={styles.calloutTitle}>Start your cloud data over?</Text>
          <Text style={styles.calloutText}>
            Without a signed-in device or your recovery key, nobody — including Artha — can decrypt what's in the cloud.
            This deletes it and sets up a new key. Other devices will need to be set up again.
          </Text>
        </View>
        <TextInput style={styles.input} placeholder="Type DELETE to confirm" autoCapitalize="characters" value={resetText} onChangeText={setResetText} />
        {error ? <Text style={styles.error}>{friendlyErrorMessage(error)}</Text> : null}
        <Pressable
          style={[styles.dangerButton, (busy || resetText !== 'DELETE') && styles.disabled]}
          disabled={busy || resetText !== 'DELETE'}
          onPress={async () => {
            setBusy(true)
            try {
              await resetCloudData()
            } catch {
              // shown via `error`
            } finally {
              setBusy(false)
            }
          }}
        >
          <Text style={styles.buttonText}>Delete cloud data and start over</Text>
        </Pressable>
        <Pressable onPress={() => setMethod('approve')}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </>
    )
  }

  return (
    <>
      <Text style={styles.title}>Unlock your data</Text>
      <Text style={styles.subtitle}>Your account already has encrypted data. Give this phone the key:</Text>
      <View style={styles.segment}>
        {(['approve', 'recovery'] as const).map((m) => (
          <Pressable key={m} style={[styles.segmentItem, method === m && styles.segmentItemActive]} onPress={() => setMethod(m)}>
            <Text style={[styles.segmentText, method === m && styles.segmentTextActive]}>
              {m === 'approve' ? 'Approve from a device' : 'Recovery key'}
            </Text>
          </Pressable>
        ))}
      </View>

      {method === 'approve' ? (
        <>
          {code && !expired ? (
            <>
              <Text style={styles.bigCode}>{code}</Text>
              <Text style={styles.step}>1. On a computer or phone already signed in to Artha, open Settings → Cloud Sync.</Text>
              <Text style={styles.step}>2. Under "Approve a new device", check the code matches this one.</Text>
              <Text style={styles.step}>3. Tap Approve — this screen continues by itself.</Text>
              <ActivityIndicator style={{ marginTop: 14 }} />
            </>
          ) : expired ? (
            <Pressable style={styles.button} onPress={() => void begin()}>
              <Text style={styles.buttonText}>Request expired — try again</Text>
            </Pressable>
          ) : !error ? (
            <ActivityIndicator />
          ) : null}
        </>
      ) : (
        <>
          <TextInput
            style={[styles.input, styles.monoInput]}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            value={recoveryText}
            onChangeText={setRecoveryText}
            onSubmitEditing={submitRecovery}
          />
          <Pressable
            style={[styles.button, (busy || !recoveryText.trim()) && styles.disabled]}
            onPress={submitRecovery}
            disabled={busy || !recoveryText.trim()}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Unlock with recovery key</Text>}
          </Pressable>
        </>
      )}

      {error ? <Text style={[styles.error, { marginTop: 12 }]}>{friendlyErrorMessage(error)}</Text> : null}

      <Pressable onPress={() => setMethod('reset')}>
        <Text style={styles.link}>No signed-in device and lost your recovery key?</Text>
      </Pressable>
    </>
  )
}
