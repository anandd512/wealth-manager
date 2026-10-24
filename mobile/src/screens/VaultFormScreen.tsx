import React, { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingScrollView } from '../components/KeyboardAvoidingScrollView'
import { BackHeader } from '../components/BackHeader'
import { SwipeBack } from '../components/SwipeBack'
import type { VaultEntry, VaultEntryFormInput } from '../db/vaultRepo'
import { VAULT_CATEGORIES, VaultCategory, VaultEntryType } from '../lib/categories'

const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}'
}

function generatePassword(length: number, classes: (keyof typeof CHARSETS)[]): string {
  const pool = classes.map((c) => CHARSETS[c]).join('')
  if (!pool) return ''
  let result = ''
  for (let i = 0; i < length; i++) {
    result += pool[Math.floor(Math.random() * pool.length)]
  }
  return result
}

interface Props {
  initial: VaultEntry | null
  onSubmit: (input: VaultEntryFormInput) => void
  onCancel: () => void
}

export function VaultFormScreen({ initial, onSubmit, onCancel }: Props) {
  const [entryType, setEntryType] = useState<VaultEntryType>(initial?.entry_type ?? 'login')
  const [serviceName, setServiceName] = useState(initial?.service_name ?? '')
  const [category, setCategory] = useState<VaultCategory | null>(initial?.category ?? null)
  const [url, setUrl] = useState(initial?.url ?? '')
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState(initial?.password ?? '')
  const [showPassword, setShowPassword] = useState(false)
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const [showGenerator, setShowGenerator] = useState(false)
  const [genLength, setGenLength] = useState(16)
  const [genClasses, setGenClasses] = useState<(keyof typeof CHARSETS)[]>(['lower', 'upper', 'numbers'])

  const toggleClass = (c: keyof typeof CHARSETS) => {
    setGenClasses((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const canSubmit = serviceName.trim().length > 0
  // Guards against a double-tap firing two creates before the screen navigates
  // away — see AccountFormScreen's identical guard for why this needs to be a ref,
  // not state.
  const submittedRef = useRef(false)

  const submit = () => {
    if (!canSubmit || submittedRef.current) return
    submittedRef.current = true
    onSubmit({
      entry_type: entryType,
      service_name: serviceName.trim(),
      category,
      url: entryType === 'login' ? url.trim() || null : null,
      username: entryType === 'login' ? username.trim() || null : null,
      password: entryType === 'login' ? password || null : null,
      notes: notes.trim() || null
    })
  }

  return (
    <SwipeBack onSwipeBack={onCancel}>
      <View style={styles.screen}>
        <BackHeader title={initial ? 'Edit entry' : 'Add entry'} onBack={onCancel} />
        <KeyboardAvoidingScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Type</Text>
      <View style={styles.chipRow}>
        {(['login', 'note'] as VaultEntryType[]).map((t) => (
          <Pressable key={t} style={[styles.chip, entryType === t && styles.chipActive]} onPress={() => setEntryType(t)}>
            <Text style={[styles.chipText, entryType === t && styles.chipTextActive]}>{t === 'login' ? 'Login' : 'Note'}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Service name</Text>
      <TextInput style={styles.input} value={serviceName} onChangeText={setServiceName} placeholder="e.g. HDFC NetBanking" />

      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, category === null && styles.chipActive]} onPress={() => setCategory(null)}>
          <Text style={[styles.chipText, category === null && styles.chipTextActive]}>None</Text>
        </Pressable>
        {VAULT_CATEGORIES.map((c) => (
          <Pressable key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
            <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      {entryType === 'login' && (
        <>
          <Text style={styles.label}>URL</Text>
          <TextInput style={styles.input} value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="https://..." />

          <Text style={styles.label}>Username</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" />

          <Text style={styles.label}>Password</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.rowItem]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable style={styles.smallButton} onPress={() => setShowPassword((s) => !s)}>
              <Text style={styles.smallButtonText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setShowGenerator((s) => !s)}>
            <Text style={styles.generatorToggle}>{showGenerator ? 'Hide generator' : 'Generate a password'}</Text>
          </Pressable>

          {showGenerator && (
            <View style={styles.generator}>
              <Text style={styles.label}>Length: {genLength}</Text>
              <View style={styles.row}>
                <Pressable style={styles.stepperButton} onPress={() => setGenLength((l) => Math.max(8, l - 1))}>
                  <Text style={styles.stepperButtonText}>−</Text>
                </Pressable>
                <Pressable style={styles.stepperButton} onPress={() => setGenLength((l) => Math.min(32, l + 1))}>
                  <Text style={styles.stepperButtonText}>+</Text>
                </Pressable>
              </View>
              <View style={styles.chipRow}>
                {(
                  [
                    ['lower', 'a-z'],
                    ['upper', 'A-Z'],
                    ['numbers', '0-9'],
                    ['symbols', '!@#']
                  ] as [keyof typeof CHARSETS, string][]
                ).map(([key, label]) => (
                  <Pressable
                    key={key}
                    style={[styles.chip, genClasses.includes(key) && styles.chipActive]}
                    onPress={() => toggleClass(key)}
                  >
                    <Text style={[styles.chipText, genClasses.includes(key) && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={styles.button}
                onPress={() => {
                  const generated = generatePassword(genLength, genClasses)
                  if (generated) {
                    setPassword(generated)
                    setShowPassword(true)
                  }
                }}
                disabled={genClasses.length === 0}
              >
                <Text style={styles.buttonText}>Use generated password</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      <Text style={styles.label}>Notes</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} multiline />

      <Pressable style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={submit} disabled={!canSubmit}>
        <Text style={styles.buttonText}>{initial ? 'Save changes' : 'Create entry'}</Text>
      </Pressable>
        </KeyboardAvoidingScrollView>
      </View>
    </SwipeBack>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingBottom: 48 },
  label: { fontSize: 13, color: '#555', marginTop: 16, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 12.5, color: '#333' },
  chipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rowItem: { flex: 1 },
  smallButton: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  smallButtonText: { fontSize: 13, color: '#333', fontWeight: '600' },
  generatorToggle: { fontSize: 13, color: '#555', marginTop: 10 },
  generator: { backgroundColor: '#f7f7f7', borderRadius: 10, padding: 14, marginTop: 10 },
  stepperButton: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, width: 44, alignItems: 'center', paddingVertical: 8 },
  stepperButtonText: { fontSize: 18, fontWeight: '700' },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 14 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' }
})
