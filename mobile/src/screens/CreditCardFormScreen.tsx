import React, { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingScrollView } from '../components/KeyboardAvoidingScrollView'
import { BackHeader } from '../components/BackHeader'
import { SwipeBack } from '../components/SwipeBack'
import type { CreditCard, CreditCardFormInput, CreditCardStatus } from '../db/creditCardsRepo'
import { cardDigits, detectNetwork, formatCardNumber } from '../lib/cardNumber'

const NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Other']

interface Props {
  initial: CreditCard | null
  onSubmit: (input: CreditCardFormInput) => void
  onCancel: () => void
}

export function CreditCardFormScreen({ initial, onSubmit, onCancel }: Props) {
  const [nickname, setNickname] = useState(initial?.nickname ?? '')
  const [issuer, setIssuer] = useState(initial?.issuer ?? '')
  const [cardNumber, setCardNumber] = useState(initial?.card_number ?? '')
  const [network, setNetwork] = useState<string | null>(initial?.network ?? null)
  const [networkTouched, setNetworkTouched] = useState(Boolean(initial?.network))
  const [nameOnCard, setNameOnCard] = useState(initial?.name_on_card ?? '')
  const [expiryMonth, setExpiryMonth] = useState(initial?.expiry_month != null ? String(initial.expiry_month).padStart(2, '0') : '')
  const [expiryYear, setExpiryYear] = useState(initial?.expiry_year != null ? String(initial.expiry_year).padStart(2, '0') : '')
  const [creditLimit, setCreditLimit] = useState(initial?.credit_limit != null ? String(initial.credit_limit) : '')
  const [statementDay, setStatementDay] = useState(initial?.statement_day != null ? String(initial.statement_day) : '')
  const [status, setStatus] = useState<CreditCardStatus>(initial?.status ?? 'active')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const handleCardNumberChange = (text: string) => {
    setCardNumber(cardDigits(text))
    if (!networkTouched) {
      const detected = detectNetwork(text)
      if (detected) setNetwork(detected)
    }
  }

  const selectNetwork = (n: string) => {
    setNetwork(n)
    setNetworkTouched(true)
  }

  const monthNum = expiryMonth ? Number(expiryMonth) : null
  const yearNum = expiryYear ? Number(expiryYear) : null
  const expiryValid = !expiryMonth || !expiryYear || (monthNum! >= 1 && monthNum! <= 12 && expiryYear.length === 2)
  const statementDayNum = statementDay ? Number(statementDay) : null
  const statementDayValid = !statementDay || (statementDayNum! >= 1 && statementDayNum! <= 31)

  const canSubmit = nickname.trim().length > 0 && expiryValid && statementDayValid
  // Guards against a double-tap firing two creates — see AccountFormScreen's
  // identical guard for why this needs to be a ref, not state.
  const submittedRef = useRef(false)

  const submit = () => {
    if (!canSubmit || submittedRef.current) return
    submittedRef.current = true
    onSubmit({
      nickname: nickname.trim(),
      issuer: issuer.trim() || null,
      card_number: cardNumber || null,
      network,
      name_on_card: nameOnCard.trim() || null,
      expiry_month: monthNum,
      expiry_year: yearNum,
      credit_limit: creditLimit.trim() ? Number(creditLimit) : null,
      statement_day: statementDayNum,
      status,
      notes: notes.trim() || null
    })
  }

  return (
    <SwipeBack onSwipeBack={onCancel}>
      <View style={styles.screen}>
        <BackHeader title={initial ? 'Edit card' : 'Add card'} onBack={onCancel} />
        <KeyboardAvoidingScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nickname</Text>
      <TextInput style={styles.input} value={nickname} onChangeText={setNickname} placeholder="e.g. HDFC Regalia" />

      <Text style={styles.label}>Issuer</Text>
      <TextInput style={styles.input} value={issuer} onChangeText={setIssuer} placeholder="e.g. HDFC Bank" />

      <Text style={styles.label}>Card number</Text>
      <TextInput
        style={styles.input}
        value={formatCardNumber(cardNumber, network)}
        onChangeText={handleCardNumberChange}
        keyboardType="numeric"
        placeholder="•••• •••• •••• ••••"
      />

      <Text style={styles.label}>Network</Text>
      <View style={styles.chipRow}>
        {NETWORKS.map((n) => (
          <Pressable key={n} style={[styles.chip, network === n && styles.chipActive]} onPress={() => selectNetwork(n)}>
            <Text style={[styles.chipText, network === n && styles.chipTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Name on card</Text>
      <TextInput style={styles.input} value={nameOnCard} onChangeText={setNameOnCard} autoCapitalize="words" />

      <Text style={styles.label}>Expiry (MM / YY)</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.rowItemSmall]}
          value={expiryMonth}
          onChangeText={(t) => setExpiryMonth(t.replace(/\D/g, '').slice(0, 2))}
          keyboardType="numeric"
          placeholder="MM"
          maxLength={2}
        />
        <TextInput
          style={[styles.input, styles.rowItemSmall]}
          value={expiryYear}
          onChangeText={(t) => setExpiryYear(t.replace(/\D/g, '').slice(0, 2))}
          keyboardType="numeric"
          placeholder="YY"
          maxLength={2}
        />
      </View>
      {!expiryValid && <Text style={styles.error}>Month must be 1-12, year must be 2 digits.</Text>}

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>Credit limit</Text>
          <TextInput style={styles.input} value={creditLimit} onChangeText={setCreditLimit} keyboardType="numeric" placeholder="0" />
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>Statement date</Text>
          <TextInput
            style={styles.input}
            value={statementDay}
            onChangeText={(t) => setStatementDay(t.replace(/\D/g, '').slice(0, 2))}
            keyboardType="numeric"
            placeholder="1-31"
          />
        </View>
      </View>
      {!statementDayValid && <Text style={styles.error}>Statement date must be 1-31.</Text>}
      <Text style={styles.help}>Bill is due 15 days after the statement date.</Text>

      <Text style={styles.label}>Status</Text>
      <View style={styles.chipRow}>
        {(['active', 'disabled'] as CreditCardStatus[]).map((s) => (
          <Pressable key={s} style={[styles.chip, status === s && styles.chipActive]} onPress={() => setStatus(s)}>
            <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s === 'active' ? 'Active' : 'Disabled'}</Text>
          </Pressable>
        ))}
      </View>
      {status === 'disabled' && <Text style={styles.help}>Disabled cards don't get payment reminders.</Text>}

      <Text style={styles.label}>Notes</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} multiline />

      <Pressable style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={submit} disabled={!canSubmit}>
        <Text style={styles.buttonText}>{initial ? 'Save changes' : 'Create card'}</Text>
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
  help: { fontSize: 11.5, color: '#999', marginTop: 4 },
  error: { fontSize: 11.5, color: '#c0392b', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 12.5, color: '#333' },
  chipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1 },
  rowItemSmall: { flex: 1 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
})
