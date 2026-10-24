import React, { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingScrollView } from '../components/KeyboardAvoidingScrollView'
import { BackHeader } from '../components/BackHeader'
import { SwipeBack } from '../components/SwipeBack'
import * as Sharing from 'expo-sharing'
import { useAuth } from '../auth/AuthContext'
import type { InsurancePolicy, InsurancePolicyFormInput } from '../db/insuranceRepo'
import { POLICY_TYPES, VEHICLE_POLICY_TYPES, PREMIUM_FREQUENCIES, InsurancePolicyType } from '../lib/insuranceCategories'
import { pickDocument } from '../files/pickDocument'
import { storeDocument, openDocumentForViewing } from '../files/fileStore'
import { extractPolicyDetails } from '../lib/insuranceExtraction'
import { friendlyErrorMessage } from '../lib/friendlyError'

interface Props {
  initial: InsurancePolicy | null
  onSubmit: (input: InsurancePolicyFormInput) => void
  onCancel: () => void
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function InsuranceFormScreen({ initial, onSubmit, onCancel }: Props) {
  const { dataKey, token } = useAuth()
  const [policyType, setPolicyType] = useState<InsurancePolicyType | null>(initial?.policy_type ?? null)
  const [policyNumber, setPolicyNumber] = useState(initial?.policy_number ?? '')
  const [insurer, setInsurer] = useState(initial?.insurer ?? '')
  const [insuredName, setInsuredName] = useState(initial?.insured_name ?? '')
  const [additionalInsured, setAdditionalInsured] = useState(initial?.additional_insured ?? '')
  const [nomineeName, setNomineeName] = useState(initial?.nominee_name ?? '')
  const [vehicleNumber, setVehicleNumber] = useState(initial?.vehicle_number ?? '')
  const [sumAssured, setSumAssured] = useState(initial?.sum_assured != null ? String(initial.sum_assured) : '')
  const [premiumAmount, setPremiumAmount] = useState(initial?.premium_amount != null ? String(initial.premium_amount) : '')
  const [premiumFrequency, setPremiumFrequency] = useState(initial?.premium_frequency ?? 'yearly')
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [expiryDate, setExpiryDate] = useState(initial?.expiry_date ?? '')
  const [renewalDate, setRenewalDate] = useState(initial?.renewal_date ?? '')
  const [riders, setRiders] = useState(initial?.riders ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [documentPath, setDocumentPath] = useState(initial?.document_path ?? null)
  const [documentName, setDocumentName] = useState(initial?.document_original_name ?? null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [viewing, setViewing] = useState(false)

  const isVehicle = policyType != null && VEHICLE_POLICY_TYPES.includes(policyType)
  const expiryValid = expiryDate.length === 0 || DATE_RE.test(expiryDate)
  const canSubmit = policyType != null && expiryDate.trim().length > 0 && DATE_RE.test(expiryDate)
  // Guards against a double-tap firing two creates — see AccountFormScreen's
  // identical guard for why this needs to be a ref, not state.
  const submittedRef = useRef(false)

  const runExtraction = async () => {
    if (!dataKey || !token) return
    const picked = await pickDocument()
    if (!picked) return
    setExtracting(true)
    setExtractError(null)
    try {
      const ext = picked.name.slice(picked.name.lastIndexOf('.')) || '.pdf'
      const extraction = await extractPolicyDetails(picked.uri, ext)
      if (extraction.policy_type) setPolicyType(extraction.policy_type)
      if (extraction.policy_number) setPolicyNumber(extraction.policy_number)
      if (extraction.insurer) setInsurer(extraction.insurer)
      if (extraction.insured_name) setInsuredName(extraction.insured_name)
      if (extraction.additional_insured) setAdditionalInsured(extraction.additional_insured)
      if (extraction.vehicle_number) setVehicleNumber(extraction.vehicle_number)
      if (extraction.sum_assured != null) setSumAssured(String(extraction.sum_assured))
      if (extraction.premium_amount != null) setPremiumAmount(String(extraction.premium_amount))
      if (extraction.premium_frequency) setPremiumFrequency(extraction.premium_frequency)
      if (extraction.start_date) setStartDate(extraction.start_date)
      if (extraction.expiry_date) setExpiryDate(extraction.expiry_date)
      if (extraction.renewal_date) setRenewalDate(extraction.renewal_date)

      const stored = await storeDocument(picked, dataKey, token)
      setDocumentPath(stored.storedPath)
      setDocumentName(stored.originalName)
    } catch (err) {
      setExtractError((err as Error).message)
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
      policy_type: policyType,
      policy_number: policyNumber.trim() || null,
      insurer: insurer.trim() || null,
      insured_name: insuredName.trim() || null,
      additional_insured: additionalInsured.trim() || null,
      nominee_name: nomineeName.trim() || null,
      vehicle_number: isVehicle ? vehicleNumber.trim().toUpperCase() || null : null,
      sum_assured: sumAssured.trim() ? Number(sumAssured) : null,
      premium_amount: premiumAmount.trim() ? Number(premiumAmount) : null,
      premium_frequency: premiumFrequency,
      start_date: startDate.trim() || null,
      expiry_date: expiryDate.trim(),
      renewal_date: renewalDate.trim() || null,
      riders: riders.trim() || null,
      document_path: documentPath,
      document_original_name: documentName,
      notes: notes.trim() || null
    })
  }

  return (
    <SwipeBack onSwipeBack={onCancel}>
      <View style={styles.screen}>
        <BackHeader title={initial ? 'Edit policy' : 'Add policy'} onBack={onCancel} />
        <KeyboardAvoidingScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.aiButton} onPress={() => void runExtraction()} disabled={extracting}>
        {extracting ? <ActivityIndicator color="#fff" /> : <Text style={styles.aiButtonText}>📄 Add via photo/PDF (AI)</Text>}
      </Pressable>
      {extractError && <Text style={styles.error}>{extractError}</Text>}
      {documentPath && (
        <View style={styles.documentRow}>
          <Text style={styles.documentText} numberOfLines={1}>
            📎 {documentName ?? 'Document attached'}
          </Text>
          <Pressable onPress={() => void viewDocument()} disabled={viewing}>
            <Text style={styles.viewLink}>{viewing ? 'Opening…' : 'View'}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.label}>Policy type</Text>
      <View style={styles.chipRow}>
        {POLICY_TYPES.map((t) => (
          <Pressable key={t.value} style={[styles.chip, policyType === t.value && styles.chipActive]} onPress={() => setPolicyType(t.value)}>
            <Text style={[styles.chipText, policyType === t.value && styles.chipTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Policy number</Text>
      <TextInput style={styles.input} value={policyNumber} onChangeText={setPolicyNumber} />

      <Text style={styles.label}>Insurer</Text>
      <TextInput style={styles.input} value={insurer} onChangeText={setInsurer} />

      <Text style={styles.label}>Insured person</Text>
      <TextInput style={styles.input} value={insuredName} onChangeText={setInsuredName} />

      <Text style={styles.label}>Additional insured members</Text>
      <TextInput style={styles.input} value={additionalInsured} onChangeText={setAdditionalInsured} placeholder="Spouse, children, etc." />

      <Text style={styles.label}>Nominee</Text>
      <TextInput style={styles.input} value={nomineeName} onChangeText={setNomineeName} />

      {isVehicle && (
        <>
          <Text style={styles.label}>Vehicle number</Text>
          <TextInput style={styles.input} value={vehicleNumber} onChangeText={setVehicleNumber} autoCapitalize="characters" />
        </>
      )}

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>Cover / sum assured</Text>
          <TextInput style={styles.input} value={sumAssured} onChangeText={setSumAssured} keyboardType="numeric" />
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>Premium amount</Text>
          <TextInput style={styles.input} value={premiumAmount} onChangeText={setPremiumAmount} keyboardType="numeric" />
        </View>
      </View>

      <Text style={styles.label}>Premium frequency</Text>
      <View style={styles.chipRow}>
        {PREMIUM_FREQUENCIES.map((f) => (
          <Pressable key={f.value} style={[styles.chip, premiumFrequency === f.value && styles.chipActive]} onPress={() => setPremiumFrequency(f.value)}>
            <Text style={[styles.chipText, premiumFrequency === f.value && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Start date</Text>
      <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />

      <Text style={styles.label}>Expiry date</Text>
      <TextInput style={styles.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
      {!expiryValid && <Text style={styles.error}>Use YYYY-MM-DD format.</Text>}
      <Text style={styles.help}>Required so renewal reminders work.</Text>

      <Text style={styles.label}>Renewal date (optional)</Text>
      <TextInput style={styles.input} value={renewalDate} onChangeText={setRenewalDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
      <Text style={styles.help}>Reminders use this when set, otherwise the expiry date.</Text>

      <Text style={styles.label}>Riders / add-ons</Text>
      <TextInput style={styles.input} value={riders} onChangeText={setRiders} />

      <Text style={styles.label}>Notes</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} multiline />

      <Pressable style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={submit} disabled={!canSubmit}>
        <Text style={styles.buttonText}>{initial ? 'Save changes' : 'Create policy'}</Text>
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
  aiButton: { backgroundColor: '#3a3a3a', borderRadius: 8, padding: 14, alignItems: 'center' },
  aiButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    padding: 10,
    marginTop: 10
  },
  documentText: { fontSize: 13, color: '#333', flex: 1, marginRight: 8 },
  viewLink: { fontSize: 13, color: '#111', fontWeight: '700' },
  label: { fontSize: 13, color: '#555', marginTop: 16, marginBottom: 6 },
  help: { fontSize: 11.5, color: '#999', marginTop: 4 },
  error: { fontSize: 12, color: '#c0392b', marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 12.5, color: '#333' },
  chipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
})
