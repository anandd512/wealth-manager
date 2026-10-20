import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import type { CreditCard, CreditCardInput } from '../../../shared/types'

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
  const [cardNumber, setCardNumber] = useState(card?.card_number ?? '')
  const [nameOnCard, setNameOnCard] = useState(card?.name_on_card ?? '')
  const [expiryMonth, setExpiryMonth] = useState(
    card?.expiry_month != null ? String(card.expiry_month) : ''
  )
  const [expiryYear, setExpiryYear] = useState(
    card?.expiry_year != null ? String(card.expiry_year) : ''
  )
  const [creditLimit, setCreditLimit] = useState(
    card?.credit_limit != null ? String(card.credit_limit) : ''
  )
  const [statementDay, setStatementDay] = useState(
    card?.statement_day != null ? String(card.statement_day) : ''
  )
  const [outstandingBalance, setOutstandingBalance] = useState(card?.outstanding_balance != null ? String(card.outstanding_balance) : '')
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
    if (statementDay && (Number(statementDay) < 1 || Number(statementDay) > 31)) {
      setError('Statement date must be between 1 and 31.')
      return
    }
    const input: CreditCardInput = {
      nickname: nickname.trim(),
      issuer: issuer.trim() || null,
      network,
      card_number: cardNumber.trim() || null,
      name_on_card: nameOnCard.trim() || null,
      expiry_month: expiryMonth ? Number(expiryMonth) : null,
      expiry_year: expiryYear ? Number(expiryYear) : null,
      cvv: null,
      credit_limit: creditLimit ? Number(creditLimit) : null,
      outstanding_balance: outstandingBalance ? Number(outstandingBalance) : null,
      statement_day: statementDay ? Number(statementDay) : null,
      notes: notes.trim() || null
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
            <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
          </div>
          <div className="field">
            <label>Name on card</label>
            <input value={nameOnCard} onChange={(e) => setNameOnCard(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Network</label>
            <select value={network} onChange={(e) => setNetwork(e.target.value)}>
              {CARD_NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Expiry (MM / YYYY)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} placeholder="MM" />
              <input value={expiryYear} onChange={(e) => setExpiryYear(e.target.value)} placeholder="YYYY" />
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Credit limit (₹, optional)</label>
            <input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Outstanding balance (₹, optional)</label>
            <input value={outstandingBalance} onChange={e => setOutstandingBalance(e.target.value)} placeholder="Current amount owed" />
            <div className="help-text">The amount you currently owe on this card. Used to calculate credit utilisation.</div>
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
