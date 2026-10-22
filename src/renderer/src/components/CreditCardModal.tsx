import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import type { CreditCard, CreditCardInput, CreditCardStatus } from '../../../shared/types'
import { cardDigits, detectNetwork, formatCardNumber } from '../lib/cardNumber'

interface Props {
  card: CreditCard | null
  onClose: () => void
  onSaved: () => void
}

const CARD_NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Other']

export default function CreditCardModal({ card, onClose, onSaved }: Props): JSX.Element {
  const [nickname, setNickname] = useState(card?.nickname ?? '')
  const [issuer, setIssuer] = useState(card?.issuer ?? '')
  const [network, setNetwork] = useState(card?.network ?? 'Visa')
  const [cardNumber, setCardNumber] = useState(cardDigits(card?.card_number))
  // Once the user picks a network by hand, stop overriding it from the number.
  const [networkTouched, setNetworkTouched] = useState(false)
  const detectedNetwork = detectNetwork(cardNumber)

  const changeCardNumber = (value: string): void => {
    const digits = cardDigits(value)
    setCardNumber(digits)
    const detected = detectNetwork(digits)
    if (detected && !networkTouched) setNetwork(detected)
  }
  const [status, setStatus] = useState<CreditCardStatus>(card?.status ?? 'active')
  const [nameOnCard, setNameOnCard] = useState(card?.name_on_card ?? '')
  const [expiryMonth, setExpiryMonth] = useState(
    card?.expiry_month != null ? String(card.expiry_month) : ''
  )
  const [expiryYear, setExpiryYear] = useState(
    card?.expiry_year != null ? String(card.expiry_year % 100).padStart(2, '0') : ''
  )
  const [creditLimit, setCreditLimit] = useState(
    card?.credit_limit != null ? String(card.credit_limit) : ''
  )
  const [statementDay, setStatementDay] = useState(
    card?.statement_day != null ? String(card.statement_day) : ''
  )
  const [notes, setNotes] = useState(card?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const submit = async (): Promise<void> => {
    setError(null)
    if (!nickname.trim()) {
      setError('Give this card a label, e.g. "HDFC Regalia"')
      return
    }
    if (expiryMonth && (Number(expiryMonth) < 1 || Number(expiryMonth) > 12)) {
      setError('Expiry month must be between 01 and 12.')
      return
    }
    if (expiryYear && expiryYear.length !== 2) {
      setError('Enter the expiry year as two digits, e.g. 28.')
      return
    }
    if (statementDay && (Number(statementDay) < 1 || Number(statementDay) > 31)) {
      setError('Statement date must be between 1 and 31.')
      return
    }
    const input: CreditCardInput = {
      nickname: nickname.trim(),
      issuer: issuer.trim() || null,
      network,
      card_number: cardDigits(formatCardNumber(cardNumber, network)) || null,
      name_on_card: nameOnCard.trim() || null,
      expiry_month: expiryMonth ? Number(expiryMonth) : null,
      // Entered as YY; stored as the full year.
      expiry_year: expiryYear ? 2000 + Number(expiryYear) : null,
      cvv: null,
      credit_limit: creditLimit ? Number(creditLimit) : null,
      statement_day: statementDay ? Number(statementDay) : null,
      notes: notes.trim() || null,
      status
    }
    setBusy(true)
    try {
      if (card) await api().creditCards.update(card.id, input)
      else await api().creditCards.create(input)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{card ? 'Edit card' : 'Add credit card'}</h2>
        <div className="form-row">
          <div className="field">
            <label>Label</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. HDFC Regalia"
            />
          </div>
          <div className="field">
            <label>Issuer</label>
            <input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="e.g. HDFC Bank" />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Card number</label>
            <input
              value={formatCardNumber(cardNumber, network)}
              onChange={(e) => changeCardNumber(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder={network === 'Amex' ? '3782 822463 10005' : '1234 5678 9012 3456'}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
            {detectedNetwork && (
              <div className="help-text">
                {detectedNetwork === network
                  ? `${detectedNetwork} card detected`
                  : `This looks like a ${detectedNetwork} card, but ${network} is selected`}
              </div>
            )}
          </div>
          <div className="field">
            <label>Name on card</label>
            <input value={nameOnCard} onChange={(e) => setNameOnCard(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Network</label>
            <select
              value={network}
              onChange={(e) => {
                setNetwork(e.target.value)
                setNetworkTouched(true)
              }}
            >
              {CARD_NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Expiry (MM / YY)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={expiryMonth}
                onChange={(e) => setExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                placeholder="MM"
              />
              <input
                value={expiryYear}
                onChange={(e) => setExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                placeholder="YY"
              />
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Credit limit (₹, optional)</label>
            <input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as CreditCardStatus)}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <div className="help-text">Disabled cards don't get payment reminders.</div>
          </div>
        </div>

        <div className="field" style={{ maxWidth: '50%' }}>
          <label>Statement date (optional)</label>
          <input
            value={statementDay}
            onChange={(e) => setStatementDay(e.target.value)}
            placeholder="e.g. 29"
          />
          <div className="help-text">
            Day of the month your statement is generated. Reminders fire 15 days after this
            (the typical payment due date) — you don't need to track the due date separately.
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
