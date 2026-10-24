import React, { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingScrollView } from '../components/KeyboardAvoidingScrollView'
import { BackHeader } from '../components/BackHeader'
import { SwipeBack } from '../components/SwipeBack'
import * as Sharing from 'expo-sharing'
import { useAuth } from '../auth/AuthContext'
import type { IdentityDocument, IdentityDocumentFormInput } from '../db/identityDocsRepo'
import { DOC_TYPES, DOC_TYPE_EXPIRY_LABELS, IdentityDocType } from '../lib/identityDocCategories'
import { pickDocument } from '../files/pickDocument'
import { storeDocument, openDocumentForViewing } from '../files/fileStore'
import { extractIdentityDocDetails } from '../lib/identityDocExtraction'
import { friendlyErrorMessage } from '../lib/friendlyError'

interface Props {
  initial: IdentityDocument | null
  onSubmit: (input: IdentityDocumentFormInput) => void
  onCancel: () => void
}

export function IdentityDocFormScreen({ initial, onSubmit, onCancel }: Props) {
  const { dataKey, token } = useAuth()
  const [docType, setDocType] = useState<IdentityDocType>(initial?.doc_type ?? 'aadhaar')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [idNumber, setIdNumber] = useState(initial?.id_number ?? '')
  const [fullName, setFullName] = useState(initial?.full_name ?? '')
  const [dateOfBirth, setDateOfBirth] = useState(initial?.date_of_birth ?? '')
  const [issuedDate, setIssuedDate] = useState(initial?.issued_date ?? '')
  const [expiryDate, setExpiryDate] = useState(initial?.expiry_date ?? '')
  const [vehicleClass, setVehicleClass] = useState(initial?.vehicle_class ?? '')
  const [vehicleModel, setVehicleModel] = useState(initial?.vehicle_model ?? '')
  const [insuranceValidUpto, setInsuranceValidUpto] = useState(initial?.insurance_valid_upto ?? '')
  const [constituency, setConstituency] = useState(initial?.constituency ?? '')
  const [voterSerialNumber, setVoterSerialNumber] = useState(initial?.voter_serial_number ?? '')
  const [additionalInfo, setAdditionalInfo] = useState(initial?.additional_info ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [documentPath, setDocumentPath] = useState(initial?.document_path ?? null)
  const [documentName, setDocumentName] = useState(initial?.document_original_name ?? null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [viewing, setViewing] = useState(false)

  const showVehicleClass = docType === 'driving_license' || docType === 'rc'
  const showRcFields = docType === 'rc'
  const showVoterFields = docType === 'voter_id'
  const expiryLabel = DOC_TYPE_EXPIRY_LABELS[docType]

  const runExtraction = async () => {
    if (!dataKey || !token) return
    const picked = await pickDocument()
    if (!picked) return
    setExtracting(true)
    setExtractError(null)
    try {
      const ext = picked.name.slice(picked.name.lastIndexOf('.')) || '.pdf'
      const extraction = await extractIdentityDocDetails(picked.uri, ext)
      if (extraction.doc_type) setDocType(extraction.doc_type)
      if (extraction.label) setLabel(extraction.label)
      if (extraction.id_number) setIdNumber(extraction.id_number)
      if (extraction.full_name) setFullName(extraction.full_name)
      if (extraction.date_of_birth) setDateOfBirth(extraction.date_of_birth)
      if (extraction.issued_date) setIssuedDate(extraction.issued_date)
      if (extraction.expiry_date) setExpiryDate(extraction.expiry_date)
      if (extraction.vehicle_class) setVehicleClass(extraction.vehicle_class)
      if (extraction.vehicle_model) setVehicleModel(extraction.vehicle_model)
      if (extraction.insurance_valid_upto) setInsuranceValidUpto(extraction.insurance_valid_upto)
      if (extraction.constituency) setConstituency(extraction.constituency)
      if (extraction.voter_serial_number) setVoterSerialNumber(extraction.voter_serial_number)
      if (extraction.additional_info) setAdditionalInfo(extraction.additional_info)

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

  // Guards against a double-tap firing two creates — see AccountFormScreen's
  // identical guard for why this needs to be a ref, not state.
  const submittedRef = useRef(false)

  const submit = () => {
    if (submittedRef.current) return
    submittedRef.current = true
    onSubmit({
      doc_type: docType,
      label: label.trim() || null,
      id_number: idNumber.trim() || null,
      full_name: fullName.trim() || null,
      date_of_birth: dateOfBirth.trim() || null,
      issued_date: issuedDate.trim() || null,
      expiry_date: expiryDate.trim() || null,
      additional_info: additionalInfo.trim() || null,
      vehicle_class: showVehicleClass ? vehicleClass.trim() || null : null,
      vehicle_model: showRcFields ? vehicleModel.trim() || null : null,
      insurance_valid_upto: showRcFields ? insuranceValidUpto.trim() || null : null,
      constituency: showVoterFields ? constituency.trim() || null : null,
      voter_serial_number: showVoterFields ? voterSerialNumber.trim() || null : null,
      document_path: documentPath,
      document_original_name: documentName,
      notes: notes.trim() || null
    })
  }

  return (
    <SwipeBack onSwipeBack={onCancel}>
      <View style={styles.screen}>
        <BackHeader title={initial ? 'Edit document' : 'Add document'} onBack={onCancel} />
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

      <Text style={styles.label}>Document type</Text>
      <View style={styles.chipRow}>
        {DOC_TYPES.map((t) => (
          <Pressable key={t.value} style={[styles.chip, docType === t.value && styles.chipActive]} onPress={() => setDocType(t.value)}>
            <Text style={[styles.chipText, docType === t.value && styles.chipTextActive]}>
              {t.icon} {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Label</Text>
      <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="e.g. My passport" />

      <Text style={styles.label}>ID number</Text>
      <TextInput style={styles.input} value={idNumber} onChangeText={setIdNumber} />

      <Text style={styles.label}>Full name</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />

      <Text style={styles.label}>Date of birth</Text>
      <TextInput style={styles.input} value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" autoCapitalize="none" />

      <Text style={styles.label}>Issued date</Text>
      <TextInput style={styles.input} value={issuedDate} onChangeText={setIssuedDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />

      {expiryLabel && (
        <>
          <Text style={styles.label}>{expiryLabel}</Text>
          <TextInput style={styles.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        </>
      )}

      {showVehicleClass && (
        <>
          <Text style={styles.label}>Vehicle class</Text>
          <TextInput style={styles.input} value={vehicleClass} onChangeText={setVehicleClass} placeholder="e.g. LMV, MCWG" />
        </>
      )}

      {showRcFields && (
        <>
          <Text style={styles.label}>Vehicle model</Text>
          <TextInput style={styles.input} value={vehicleModel} onChangeText={setVehicleModel} placeholder="e.g. Maruti Suzuki Swift" />
          <Text style={styles.label}>Insurance valid upto</Text>
          <TextInput style={styles.input} value={insuranceValidUpto} onChangeText={setInsuranceValidUpto} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        </>
      )}

      {showVoterFields && (
        <>
          <Text style={styles.label}>Constituency</Text>
          <TextInput style={styles.input} value={constituency} onChangeText={setConstituency} />
          <Text style={styles.label}>Voter serial number</Text>
          <TextInput style={styles.input} value={voterSerialNumber} onChangeText={setVoterSerialNumber} />
        </>
      )}

      <Text style={styles.label}>Additional info</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={additionalInfo} onChangeText={setAdditionalInfo} multiline />

      <Text style={styles.label}>Notes</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} multiline />

      <Pressable style={styles.button} onPress={submit}>
        <Text style={styles.buttonText}>{initial ? 'Save changes' : 'Create document'}</Text>
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
  error: { fontSize: 12, color: '#c0392b', marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 12.5, color: '#333' },
  chipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
})
