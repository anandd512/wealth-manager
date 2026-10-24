import React, { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingScrollView } from '../components/KeyboardAvoidingScrollView'
import { BackHeader } from '../components/BackHeader'
import { SwipeBack } from '../components/SwipeBack'
import type { Account, AccountFormInput } from '../db/accountsRepo'
import { AccountCategory, AccountSubtype, CATEGORY_LABELS, SUBTYPES_BY_CATEGORY } from '../lib/categories'

const CATEGORIES = Object.keys(CATEGORY_LABELS) as AccountCategory[]

interface Props {
  initial: Account | null
  onSubmit: (input: AccountFormInput) => void
  onCancel: () => void
}

export function AccountFormScreen({ initial, onSubmit, onCancel }: Props) {
  const [category, setCategory] = useState<AccountCategory>(initial?.category ?? 'bank')
  const [subtype, setSubtype] = useState<AccountSubtype>(initial?.subtype ?? SUBTYPES_BY_CATEGORY['bank'][0].value)
  const [name, setName] = useState(initial?.name ?? '')
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR')
  const [currentValue, setCurrentValue] = useState(initial ? String(initial.current_value) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  // Guards against a double-tap firing two creates before the screen navigates away
  // (each would mint its own sync_id — two real, synced duplicate rows, not a
  // dedupable glitch). A ref rather than state: must block the second tap
  // immediately, before React has a chance to re-render a disabled button.
  const submittedRef = useRef(false)

  const selectCategory = (next: AccountCategory) => {
    setCategory(next)
    setSubtype(SUBTYPES_BY_CATEGORY[next][0].value)
  }

  const valueNumber = Number(currentValue)
  const canSubmit = name.trim().length > 0 && currentValue.trim().length > 0 && !Number.isNaN(valueNumber)

  const submit = () => {
    if (!canSubmit || submittedRef.current) return
    submittedRef.current = true
    onSubmit({
      name: name.trim(),
      category,
      subtype,
      institution: institution.trim() || null,
      currency: currency.trim() || 'INR',
      current_value: valueNumber,
      notes: notes.trim() || null
    })
  }

  return (
    <SwipeBack onSwipeBack={onCancel}>
      <View style={styles.screen}>
        <BackHeader title={initial ? 'Edit account' : 'Add account'} onBack={onCancel} />
        <KeyboardAvoidingScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <Pressable key={c} style={[styles.chip, c === category && styles.chipActive]} onPress={() => selectCategory(c)}>
            <Text style={[styles.chipText, c === category && styles.chipTextActive]}>{CATEGORY_LABELS[c]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Type</Text>
      <View style={styles.chipRow}>
        {SUBTYPES_BY_CATEGORY[category].map((s) => (
          <Pressable key={s.value} style={[styles.chip, s.value === subtype && styles.chipActive]} onPress={() => setSubtype(s.value)}>
            <Text style={[styles.chipText, s.value === subtype && styles.chipTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. HDFC Savings" />

      <Text style={styles.label}>Institution</Text>
      <TextInput style={styles.input} value={institution} onChangeText={setInstitution} placeholder="e.g. HDFC Bank" />

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>Current value</Text>
          <TextInput
            style={styles.input}
            value={currentValue}
            onChangeText={setCurrentValue}
            placeholder="0"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.rowItemSmall}>
          <Text style={styles.label}>Currency</Text>
          <TextInput style={styles.input} value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} />
        </View>
      </View>

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional"
        multiline
      />

      <Pressable style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={submit} disabled={!canSubmit}>
        <Text style={styles.buttonText}>{initial ? 'Save changes' : 'Create account'}</Text>
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
  chipText: { fontSize: 13, color: '#333' },
  chipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 2 },
  rowItemSmall: { flex: 1 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 28 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
})
