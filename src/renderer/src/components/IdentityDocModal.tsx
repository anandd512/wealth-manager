import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import type {
  IdentityDocExtraction,
  IdentityDocType,
  IdentityDocument,
  IdentityDocumentInput
} from '../../../shared/types'
import { DOC_TYPES, DOC_TYPE_EXPIRY_LABELS } from '../../../shared/identityDocTypes'

interface Props {
  doc: IdentityDocument | null
  prefill?: { extraction: IdentityDocExtraction; storedPath: string; originalName: string } | null
  initialDocType?: IdentityDocType
  onClose: () => void
  onSaved: () => void
}

function toDateInput(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export default function IdentityDocModal({ doc, prefill, initialDocType, onClose, onSaved }: Props): JSX.Element {
  const seed = prefill?.extraction
  // Extraction (seed) wins over the saved record when both are present — that only
  // happens on re-sync, where the point is to bring in freshly extracted values.
  // initialDocType is used when opening the modal from a quick-add type pill.
  const [docType, setDocType] = useState<IdentityDocType>(seed?.doc_type ?? doc?.doc_type ?? initialDocType ?? 'aadhaar')
  const [label, setLabel] = useState(seed?.label ?? doc?.label ?? '')
  const [idNumber, setIdNumber] = useState(seed?.id_number ?? doc?.id_number ?? '')
  const [fullName, setFullName] = useState(seed?.full_name ?? doc?.full_name ?? '')
  const [dateOfBirth, setDateOfBirth] = useState(toDateInput(seed?.date_of_birth ?? doc?.date_of_birth))
  const [issuedDate, setIssuedDate] = useState(toDateInput(seed?.issued_date ?? doc?.issued_date))
  const [expiryDate, setExpiryDate] = useState(toDateInput(seed?.expiry_date ?? doc?.expiry_date))
  const [additionalInfo, setAdditionalInfo] = useState(
    seed?.additional_info ?? doc?.additional_info ?? ''
  )
  const [vehicleClass, setVehicleClass] = useState(seed?.vehicle_class ?? doc?.vehicle_class ?? '')
  const [vehicleModel, setVehicleModel] = useState(seed?.vehicle_model ?? doc?.vehicle_model ?? '')
  const [insuranceValidUpto, setInsuranceValidUpto] = useState(
    toDateInput(seed?.insurance_valid_upto ?? doc?.insurance_valid_upto)
  )
  const [constituency, setConstituency] = useState(seed?.constituency ?? doc?.constituency ?? '')
  const [voterSerialNumber, setVoterSerialNumber] = useState(
    seed?.voter_serial_number ?? doc?.voter_serial_number ?? ''
  )
  const [notes, setNotes] = useState(doc?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const showVehicleClass = docType === 'driving_license' || docType === 'rc'
  const showRcFields = docType === 'rc'
  const showVoterFields = docType === 'voter_id'

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const submit = async (): Promise<void> => {
    setError(null)
    const input: IdentityDocumentInput = {
      doc_type: docType,
      label: label.trim() || null,
      id_number: idNumber.trim() || null,
      full_name: fullName.trim() || null,
      date_of_birth: dateOfBirth ? new Date(dateOfBirth).toISOString() : null,
      issued_date: issuedDate ? new Date(issuedDate).toISOString() : null,
      expiry_date: DOC_TYPE_EXPIRY_LABELS[docType] && expiryDate ? new Date(expiryDate).toISOString() : null,
      additional_info: additionalInfo.trim() || null,
      vehicle_class: showVehicleClass && vehicleClass.trim() ? vehicleClass.trim() : null,
      vehicle_model: showRcFields && vehicleModel.trim() ? vehicleModel.trim() : null,
      insurance_valid_upto:
        showRcFields && insuranceValidUpto ? new Date(insuranceValidUpto).toISOString() : null,
      constituency: showVoterFields && constituency.trim() ? constituency.trim() : null,
      voter_serial_number: showVoterFields && voterSerialNumber.trim() ? voterSerialNumber.trim() : null,
      document_path: prefill?.storedPath ?? doc?.document_path ?? null,
      document_original_name: prefill?.originalName ?? doc?.document_original_name ?? null,
      notes: notes.trim() || null
    }
    setBusy(true)
    try {
      if (doc) await api().identityDocs.update(doc.id, input)
      else await api().identityDocs.create(input)
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
        <h2>{doc ? 'Edit ID document' : 'Add ID document'}</h2>
        {prefill && !doc && (
          <div className="help-text" style={{ marginBottom: 12 }}>
            Attached: {prefill.originalName}
          </div>
        )}
        {prefill && doc && (
          <div className="help-text" style={{ marginBottom: 12 }}>
            Re-extracted from the saved document — review the fields below before saving.
          </div>
        )}
        {seed?.confidence_notes && (
          <div className="help-text" style={{ marginBottom: 12 }}>
            The model's notes on this document: {seed.confidence_notes}
          </div>
        )}

        <div className="form-row">
          <div className="field">
            <label>Document type</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value as IdentityDocType)}>
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Label (optional)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My passport" />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>ID number</label>
            <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          </div>
          <div className="field">
            <label>Name on document</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Date of birth</label>
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
          <div className="field">
            <label>Issued date</label>
            <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
          </div>
        </div>

        {DOC_TYPE_EXPIRY_LABELS[docType] && (
          <div className="field">
            <label>{DOC_TYPE_EXPIRY_LABELS[docType]}</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            {docType === 'rc' && (
              <div className="help-text">
                The RC itself doesn't expire — this is the vehicle's Fitness Certificate renewal date.
              </div>
            )}
          </div>
        )}

        {showVehicleClass && (
          <div className="form-row">
            <div className="field">
              <label>Vehicle class</label>
              <input
                value={vehicleClass}
                onChange={(e) => setVehicleClass(e.target.value)}
                placeholder="e.g. LMV, MCWG"
              />
            </div>
            {showRcFields && (
              <div className="field">
                <label>Vehicle model</label>
                <input
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder="e.g. Maruti Suzuki Swift"
                />
              </div>
            )}
          </div>
        )}

        {showRcFields && (
          <div className="field" style={{ maxWidth: '50%' }}>
            <label>Insurance valid upto</label>
            <input
              type="date"
              value={insuranceValidUpto}
              onChange={(e) => setInsuranceValidUpto(e.target.value)}
            />
          </div>
        )}

        {showVoterFields && (
          <div className="form-row">
            <div className="field">
              <label>Assembly constituency</label>
              <input value={constituency} onChange={(e) => setConstituency(e.target.value)} />
            </div>
            <div className="field">
              <label>Serial number</label>
              <input value={voterSerialNumber} onChange={(e) => setVoterSerialNumber(e.target.value)} />
            </div>
          </div>
        )}

        <div className="field">
          <label>Additional details</label>
          <textarea
            value={additionalInfo}
            onChange={(e) => setAdditionalInfo(e.target.value)}
            rows={3}
            placeholder="e.g. address, father's name, vehicle class, place of birth — whatever doesn't fit the fields above"
          />
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
