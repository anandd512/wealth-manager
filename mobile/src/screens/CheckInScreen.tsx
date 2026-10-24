import React, { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingScrollView } from '../components/KeyboardAvoidingScrollView'
import { BackHeader } from '../components/BackHeader'
import { SwipeBack } from '../components/SwipeBack'
import type { Account } from '../db/accountsRepo'
import {
  checkIn,
  getValueHistory,
  updateValueHistoryEntry,
  deleteValueHistoryEntry,
  ValueHistoryEntry
} from '../db/valueHistoryRepo'
import { CHECKIN_INVESTED_VALUE_SUBTYPES, CHECKIN_QUANTITY_SUBTYPES } from '../lib/categories'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  account: Account
  onDone: () => void
  onCancel: () => void
}

/** Mirrors desktop's CheckInModal: a dedicated write flow (date + value + the
 * subtype-conditional quantity/invested field), separate from the plain account
 * edit form, plus a past-entries list that doubles as edit (tap) and delete
 * (long-press) — matching desktop's "To add, edit, or delete a past entry, use the
 * Check-in option" convention. */
export function CheckInScreen({ account, onDone, onCancel }: Props) {
  const [date, setDate] = useState(todayStr())
  const [value, setValue] = useState(String(account.current_value))
  const [investedValue, setInvestedValue] = useState(account.principal_amount != null ? String(account.principal_amount) : '')
  const [quantity, setQuantity] = useState(account.quantity != null ? String(account.quantity) : '')
  const [entries, setEntries] = useState<ValueHistoryEntry[]>(() => getValueHistory(account.sync_id))
  const [editingSyncId, setEditingSyncId] = useState<string | null>(null)

  const showInvested = CHECKIN_INVESTED_VALUE_SUBTYPES.includes(account.subtype)
  const showQuantity = CHECKIN_QUANTITY_SUBTYPES.includes(account.subtype)

  const valueNumber = Number(value)
  const canSubmit = value.trim().length > 0 && !Number.isNaN(valueNumber) && /^\d{4}-\d{2}-\d{2}$/.test(date)

  const refreshEntries = () => setEntries(getValueHistory(account.sync_id))

  const resetForm = () => {
    setEditingSyncId(null)
    setDate(todayStr())
    setValue(String(account.current_value))
    setInvestedValue('')
    setQuantity('')
  }

  const submit = () => {
    if (!canSubmit) return
    const investedNum = investedValue.trim() ? Number(investedValue) : null
    const qtyNum = quantity.trim() ? Number(quantity) : null
    if (editingSyncId) {
      updateValueHistoryEntry(editingSyncId, valueNumber, investedNum, qtyNum)
    } else {
      checkIn(account.sync_id, date, valueNumber, investedNum, qtyNum)
    }
    refreshEntries()
    onDone()
  }

  const startEdit = (entry: ValueHistoryEntry) => {
    setEditingSyncId(entry.sync_id)
    setDate(entry.recorded_at.slice(0, 10))
    setValue(String(entry.value))
    setInvestedValue(entry.invested_value != null ? String(entry.invested_value) : '')
    setQuantity(entry.quantity != null ? String(entry.quantity) : '')
  }

  const confirmDelete = (entry: ValueHistoryEntry) => {
    Alert.alert('Delete entry', `Remove the ${entry.recorded_at.slice(0, 10)} entry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteValueHistoryEntry(entry.sync_id)
          refreshEntries()
          if (editingSyncId === entry.sync_id) resetForm()
        }
      }
    ])
  }

  return (
    <SwipeBack onSwipeBack={onCancel}>
      <View style={styles.screen}>
        <BackHeader title="Check in" onBack={onCancel} />
        <KeyboardAvoidingScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>{account.name}</Text>

      <Text style={styles.label}>Date</Text>
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.rowItem]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <Pressable style={styles.todayButton} onPress={() => setDate(todayStr())}>
          <Text style={styles.todayButtonText}>Today</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>New value</Text>
      <TextInput style={styles.input} value={value} onChangeText={setValue} keyboardType="numeric" />

      {showInvested && (
        <>
          <Text style={styles.label}>Invested amount (optional)</Text>
          <Text style={styles.help}>Total amount put in as of this date — used to track gain/loss.</Text>
          <TextInput style={styles.input} value={investedValue} onChangeText={setInvestedValue} keyboardType="numeric" />
        </>
      )}

      {showQuantity && (
        <>
          <Text style={styles.label}>
            {account.subtype === 'physical_gold' ? 'Weight in grams (optional)' : 'Units / shares held (optional)'}
          </Text>
          <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
        </>
      )}

      <Pressable style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={submit} disabled={!canSubmit}>
        <Text style={styles.buttonText}>{editingSyncId ? 'Save entry' : 'Check in'}</Text>
      </Pressable>
      {editingSyncId && (
        <Pressable onPress={resetForm}>
          <Text style={styles.cancelEdit}>Cancel edit</Text>
        </Pressable>
      )}

      {entries.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Past entries</Text>
          <Text style={styles.sectionHelp}>Tap to edit, long-press to delete.</Text>
          {entries.map((entry) => (
            <Pressable
              key={entry.sync_id}
              style={[styles.entryRow, editingSyncId === entry.sync_id && styles.entryRowActive]}
              onPress={() => startEdit(entry)}
              onLongPress={() => confirmDelete(entry)}
            >
              <View>
                <Text style={styles.entryDate}>{entry.recorded_at.slice(0, 10)}</Text>
                <Text style={styles.entrySource}>{entry.source === 'check_in' ? 'Check-in' : 'Manual'}</Text>
              </View>
              <Text style={styles.entryValue}>{entry.value.toLocaleString('en-IN')}</Text>
            </Pressable>
          ))}
        </>
      )}
        </KeyboardAvoidingScrollView>
      </View>
    </SwipeBack>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingBottom: 48 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 12 },
  label: { fontSize: 13, color: '#555', marginTop: 16, marginBottom: 6 },
  help: { fontSize: 11.5, color: '#999', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rowItem: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  todayButton: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  todayButtonText: { fontSize: 13, color: '#333', fontWeight: '600' },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelEdit: { textAlign: 'center', color: '#c0392b', marginTop: 14, fontSize: 13 },
  sectionLabel: { fontSize: 15, fontWeight: '700', marginTop: 32, marginBottom: 2 },
  sectionHelp: { fontSize: 11.5, color: '#999', marginBottom: 10 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee'
  },
  entryRowActive: { backgroundColor: '#f5f5f5' },
  entryDate: { fontSize: 14, fontWeight: '600', color: '#111' },
  entrySource: { fontSize: 11.5, color: '#999', marginTop: 1 },
  entryValue: { fontSize: 14, fontWeight: '600', color: '#111' }
})
