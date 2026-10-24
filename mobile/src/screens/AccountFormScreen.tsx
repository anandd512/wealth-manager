import React, { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import * as Sharing from 'expo-sharing'
import { KeyboardAvoidingScrollView } from '../components/KeyboardAvoidingScrollView'
import { BackHeader } from '../components/BackHeader'
import { SwipeBack } from '../components/SwipeBack'
import { useAuth } from '../auth/AuthContext'
import type { Account, AccountFormInput } from '../db/accountsRepo'
import { AccountCategory, AccountSubtype, CATEGORY_LABELS, SUBTYPES_BY_CATEGORY } from '../lib/categories'
import { pickDocument } from '../files/pickDocument'
import { storeDocument, openDocumentForViewing } from '../files/fileStore'
import { extractLoanSchedule } from '../lib/loanScheduleExtraction'
import { friendlyErrorMessage } from '../lib/friendlyError'

const CATEGORIES = Object.keys(CATEGORY_LABELS) as AccountCategory[]

interface Props {
  initial: Account | null
  onSubmit: (input: AccountFormInput) => void
  onCancel: () => void
}

export function AccountFormScreen({ initial, onSubmit, onCancel }: Props) {
  const { dataKey, token } = useAuth()
  const [category, setCategory] = useState<AccountCategory>(initial?.category ?? 'bank')
  const [subtype, setSubtype] = useState<AccountSubtype>(initial?.subtype ?? SUBTYPES_BY_CATEGORY['bank'][0].value)
  const [name, setName] = useState(initial?.name ?? '')
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR')
  const [currentValue, setCurrentValue] = useState(initial ? String(initial.current_value) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [principalAmount, setPrincipalAmount] = useState(
    initial?.principal_amount != null ? String(initial.principal_amount) : ''
  )
  const [interestRate, setInterestRate] = useState(
    initial?.interest_rate != null ? String(initial.interest_rate) : ''
  )
  const [tenureMonths, setTenureMonths] = useState(
    initial?.tenure_months != null ? String(initial.tenure_months) : ''
  )
  const [emiAmount, setEmiAmount] = useState(initial?.emi_amount != null ? String(initial.emi_amount) : '')
  const [loanStartDate, setLoanStartDate] = useState((initial?.loan_start_date as string | null) ?? '')
  const [documentPath, setDocumentPath] = useState((initial?.document_path as string | null) ?? null)
  const [documentName, setDocumentName] = useState((initial?.document_original_name as string | null) ?? null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [viewing, setViewing] = useState(false)
  // Guards against a double-tap firing two creates before the screen navigates away
  // (each would mint its own sync_id — two real, synced duplicate rows, not a
  // dedupable glitch). A ref rather than state: must block the second tap
  // immediately, before React has a chance to re-render a disabled button.
  const submittedRef = useRef(false)

  const selectCategory = (next: AccountCategory) => {
    setCategory(next)
    setSubtype(SUBTYPES_BY_CATEGORY[next][0].value)
  }

  const isLoan = category === 'loan'
  const valueNumber = Number(currentValue)
  const canSubmit = name.trim().length > 0 && currentValue.trim().length > 0 && !Number.isNaN(valueNumber)

  const applyExtraction = (extraction: {
    principal_amount: number | null
    interest_rate: number | null
    tenure_months: number | null
    emi_amount: number | null
    loan_start_date: string | null
    outstanding_balance: number | null
    installments_paid: number | null
    installments_remaining: number | null
  }): void => {
    if (extraction.principal_amount != null) setPrincipalAmount(String(extraction.principal_amount))
    if (extraction.interest_rate != null) setInterestRate(String(extraction.interest_rate))
    if (extraction.tenure_months != null) setTenureMonths(String(extraction.tenure_months))
    if (extraction.emi_amount != null) setEmiAmount(String(extraction.emi_amount))
    if (extraction.loan_start_date) setLoanStartDate(extraction.loan_start_date)
    if (extraction.outstanding_balance != null) setCurrentValue(String(extraction.outstanding_balance))
  }

  const runExtraction = async () => {
    if (!dataKey || !token) return
    setExtractError(null)
    const picked = await pickDocument()
    if (!picked) return
    setExtracting(true)
    try {
      const ext = picked.name.slice(picked.name.lastIndexOf('.')) || '.pdf'
      const extraction = await extractLoanSchedule(picked.uri, ext)
      applyExtraction(extraction)
      const stored = await storeDocument(picked, dataKey, token)
      setDocumentPath(stored.storedPath)
      setDocumentName(stored.originalName)
    } catch (err) {
      setExtractError(friendlyErrorMessage(err))
    } finally {
      setExtracting(false)
    }
  }

  const resyncSchedule = async () => {
    if (!dataKey || !token || !documentPath) return
    setExtractError(null)
    setExtracting(true)
    try {
      const localUri = await openDocumentForViewing(documentPath, dataKey, token)
      const ext = documentPath.replace(/\.enc$/, '').match(/\.[^./]+$/)?.[0] ?? '.pdf'
      const extraction = await extractLoanSchedule(localUri, ext)
      applyExtraction(extraction)
    } catch (err) {
      setExtractError(friendlyErrorMessage(err))
    } finally {
      setExtracting(false)
    }
  }

  const viewDocument = async () => {
    if (!documentPath || !dataKey || !token) return
    setViewing(true)
    try {
      const localUri = await openDocumentForViewing(documentPath, dataKey, token)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri)
      } else {
        Alert.alert('Document ready', localUri)
      }
    } catch (err) {
      Alert.alert('Could not open document', friendlyErrorMessage(err))
    } finally {
      setViewing(false)
    }
  }

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
      notes: notes.trim() || null,
      ...(isLoan
        ? {
            principal_amount: principalAmount.trim() ? Number(principalAmount) : null,
            interest_rate: interestRate.trim() ? Number(interestRate) : null,
            tenure_months: tenureMonths.trim() ? Number(tenureMonths) : null,
            emi_amount: emiAmount.trim() ? Number(emiAmount) : null,
            loan_start_date: loanStartDate.trim() || null,
            document_path: documentPath,
            document_original_name: documentName
          }
        : {})
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

      {isLoan && (
        <>
          <Pressable style={styles.aiButton} onPress={() => void runExtraction()} disabled={extracting}>
            {extracting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.aiButtonText}>📄 Read repayment schedule (AI)</Text>
            )}
          </Pressable>
          <Text style={styles.aiDisclosure}>
            Your chosen AI provider reads the document, and the details are saved privately on
            your device.
          </Text>
          {extractError && <Text style={styles.error}>{extractError}</Text>}
          {documentPath && (
            <View style={styles.documentRow}>
              <Text style={styles.documentText} numberOfLines={1}>
                📎 {documentName ?? 'Document attached'}
              </Text>
              <Pressable onPress={() => void viewDocument()} disabled={viewing}>
                <Text style={styles.viewLink}>{viewing ? 'Opening…' : 'View'}</Text>
              </Pressable>
              <Pressable onPress={() => void resyncSchedule()} disabled={extracting}>
                <Text style={styles.viewLink}>{extracting ? 'Updating…' : 'Re-sync'}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Principal amount</Text>
              <TextInput style={styles.input} value={principalAmount} onChangeText={setPrincipalAmount} keyboardType="numeric" />
            </View>
            <View style={styles.rowItemSmall}>
              <Text style={styles.label}>Interest rate %</Text>
              <TextInput style={styles.input} value={interestRate} onChangeText={setInterestRate} keyboardType="numeric" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Tenure (months)</Text>
              <TextInput style={styles.input} value={tenureMonths} onChangeText={setTenureMonths} keyboardType="numeric" />
            </View>
            <View style={styles.rowItemSmall}>
              <Text style={styles.label}>EMI amount</Text>
              <TextInput style={styles.input} value={emiAmount} onChangeText={setEmiAmount} keyboardType="numeric" />
            </View>
          </View>
          <Text style={styles.label}>Loan start date</Text>
          <TextInput
            style={styles.input}
            value={loanStartDate}
            onChangeText={setLoanStartDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />
        </>
      )}

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
  aiButton: { backgroundColor: '#3a3a3a', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  aiButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  aiDisclosure: { fontSize: 11, color: '#999', marginTop: 6, lineHeight: 15 },
  error: { fontSize: 12, color: '#c0392b', marginTop: 8 },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    padding: 10,
    marginTop: 10
  },
  documentText: { fontSize: 13, color: '#333', flex: 1 },
  viewLink: { fontSize: 13, color: '#111', fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 2 },
  rowItemSmall: { flex: 1 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 28 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
})
