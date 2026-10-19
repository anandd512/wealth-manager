import { api } from '../lib/api'
import { useState } from 'react'
import type { InsurancePolicy, InsurancePolicyInput, PolicyExtraction } from '../../../shared/types'
import { POLICY_TYPES, VEHICLE_POLICY_TYPES } from '../../../shared/insuranceTypes'

interface Props {
  policy: InsurancePolicy | null
  prefill?: { extraction: PolicyExtraction; storedPath: string; originalName: string } | null
  onClose: () => void
  onSaved: () => void
}

function toDateInput(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

const KNOWN_TYPE_VALUES = new Set(POLICY_TYPES.map((t) => t.value))

export default function PolicyModal({ policy, prefill, onClose, onSaved }: Props): JSX.Element {
  const seed = prefill?.extraction
  // Extraction (seed) wins over the saved record when both are present — that only
  // happens on re-sync, where the point is to bring in freshly extracted values.
  const initialRawType = seed?.policy_type ?? policy?.policy_type ?? ''
  const initialKnown = KNOWN_TYPE_VALUES.has(initialRawType as never)

  const [policyNumber, setPolicyNumber] = useState(seed?.policy_number ?? policy?.policy_number ?? '')
  const [policyType, setPolicyType] = useState(initialKnown ? initialRawType : initialRawType ? 'other' : '')
  const [customType, setCustomType] = useState(initialKnown ? '' : initialRawType)
  const [insurer, setInsurer] = useState(seed?.insurer ?? policy?.insurer ?? '')
  const [insuredName, setInsuredName] = useState(seed?.insured_name ?? policy?.insured_name ?? '')
  const [vehicleNumber, setVehicleNumber] = useState(seed?.vehicle_number ?? policy?.vehicle_number ?? '')
  const [sumAssured, setSumAssured] = useState(
    String(seed?.sum_assured ?? policy?.sum_assured ?? '')
  )
  const [premiumAmount, setPremiumAmount] = useState(
    String(seed?.premium_amount ?? policy?.premium_amount ?? '')
  )
  const [premiumFrequency, setPremiumFrequency] = useState(
    seed?.premium_frequency ?? policy?.premium_frequency ?? 'yearly'
  )
  const [startDate, setStartDate] = useState(toDateInput(seed?.start_date ?? policy?.start_date))
  const [expiryDate, setExpiryDate] = useState(toDateInput(seed?.expiry_date ?? policy?.expiry_date))
  const [renewalDate, setRenewalDate] = useState(toDateInput(seed?.renewal_date ?? policy?.renewal_date))
  const [nomineeName, setNomineeName] = useState(policy?.nominee_name ?? '')
  const [riders, setRiders] = useState(policy?.riders ?? '')
  const [notes, setNotes] = useState(policy?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isVehicle = VEHICLE_POLICY_TYPES.includes(policyType as never)

  const submit = async (): Promise<void> => {
    setError(null)
    if (!expiryDate) {
      setError('Expiry date is required so reminders can work.')
      return
    }
    const resolvedType = policyType === 'other' ? customType.trim() || null : policyType || null
    const input: InsurancePolicyInput = {
      policy_number: policyNumber.trim() || null,
      policy_type: resolvedType,
      insurer: insurer.trim() || null,
      insured_name: insuredName.trim() || null,
      vehicle_number: isVehicle && vehicleNumber.trim() ? vehicleNumber.trim().toUpperCase() : null,
      sum_assured: sumAssured ? Number(sumAssured) : null,
      premium_amount: premiumAmount ? Number(premiumAmount) : null,
      premium_frequency: premiumFrequency || null,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      expiry_date: new Date(expiryDate).toISOString(),
      renewal_date: renewalDate ? new Date(renewalDate).toISOString() : null,
      document_path: prefill?.storedPath ?? policy?.document_path ?? null,
      document_original_name: prefill?.originalName ?? policy?.document_original_name ?? null,
      nominee_name: nomineeName.trim() || null,
      riders: riders.trim() || null,
      notes: notes.trim() || null
    }
    setBusy(true)
    try {
      if (policy) await api().insurance.update(policy.id, input)
      else await api().insurance.create(input)
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
        <h2>{policy ? 'Edit policy' : 'Add policy'}</h2>
        {policy && seed && (
          <div className="help-text" style={{ marginBottom: 12 }}>
            Re-extracted from the saved document — review the fields below before saving.
          </div>
        )}
        {seed?.confidence_notes && (
          <div className="help-text" style={{ marginBottom: 12 }}>
            AI notes on this extraction: {seed.confidence_notes}
          </div>
        )}

        <div className="form-row">
          <div className="field">
            <label>Policy type</label>
            <select value={policyType} onChange={(e) => setPolicyType(e.target.value)}>
              <option value="" disabled>
                Select a type…
              </option>
              {POLICY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Policy number</label>
            <input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
          </div>
        </div>

        {policyType === 'other' && (
          <div className="field">
            <label>Specify type</label>
            <input value={customType} onChange={(e) => setCustomType(e.target.value)} />
          </div>
        )}

        <div className="form-row">
          <div className="field">
            <label>Insurer</label>
            <input value={insurer} onChange={(e) => setInsurer(e.target.value)} />
          </div>
          <div className="field">
            <label>Insured person</label>
            <input value={insuredName} onChange={(e) => setInsuredName(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Nominee / beneficiary (optional)</label>
            <input value={nomineeName} onChange={e => setNomineeName(e.target.value)} placeholder="e.g. Priya Sharma" />
          </div>
          <div className="field">
            <label>Riders / add-ons (optional)</label>
            <input value={riders} onChange={e => setRiders(e.target.value)} placeholder="e.g. Critical illness, Accidental death benefit" />
          </div>
        </div>

        {isVehicle && (
          <div className="field">
            <label>Vehicle number</label>
            <input
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              placeholder="e.g. MH12AB1234"
            />
          </div>
        )}

        <div className="form-row">
          <div className="field">
            <label>Cover amount (₹)</label>
            <input value={sumAssured} onChange={(e) => setSumAssured(e.target.value)} />
          </div>
          <div className="field">
            <label>Premium amount (₹)</label>
            <input value={premiumAmount} onChange={(e) => setPremiumAmount(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Premium frequency</label>
            <select value={premiumFrequency} onChange={(e) => setPremiumFrequency(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half-yearly">Half-yearly</option>
              <option value="yearly">Yearly</option>
              <option value="single">Single premium</option>
            </select>
          </div>
          <div className="field">
            <label>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Expiry date</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            <div className="help-text">When coverage actually lapses.</div>
          </div>
          <div className="field">
            <label>Renewal date (optional)</label>
            <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
            <div className="help-text">
              If different from expiry — reminders use this date when set.
            </div>
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
