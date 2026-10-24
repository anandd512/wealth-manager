import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import { Upload, Plus, X } from 'lucide-react'
import type {
  Account,
  AccountCategory,
  AccountInput,
  AccountSubtype,
  LoanScheduleExtraction
} from '../../../shared/types'
import { formatCurrency } from '../lib/format'
import {
  CATEGORY_IS_LIABILITY,
  CATEGORY_LABELS,
  SUBTYPES_BY_CATEGORY,
  SUBTYPES_WITH_ACCOUNT_NUMBER,
  MANUAL_QUANTITY_SUBTYPES
} from '../lib/categories'
import { ICON_VIEW, ICON_DOWNLOAD } from '../lib/actionIcons'

interface Props {
  account: Account | null
  // Seeds category/subtype/name on a brand-new account (e.g. suggesting a paired
  // asset right after saving a car/home loan). Ignored when editing an existing one.
  initial?: { category: AccountCategory; subtype: AccountSubtype; name: string } | null
  // When true, immediately re-reads the loan's attached repayment schedule on open
  // and pre-fills the fields for review — the one entry point for syncing a loan
  // (triggered from the Accounts grid's "Sync from repayment schedule" action).
  autoSync?: boolean
  onClose: () => void
  onSaved: (saved: Account) => void
}

const CARD_NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Other']

export default function AccountModal({ account, initial, autoSync, onClose, onSaved }: Props): JSX.Element {
  const [category, setCategory] = useState<AccountCategory>(account?.category ?? initial?.category ?? 'bank')
  const [subtype, setSubtype] = useState<AccountSubtype>(account?.subtype ?? initial?.subtype ?? 'savings')
  const [name, setName] = useState(account?.name ?? initial?.name ?? '')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [currentValue, setCurrentValue] = useState(String(account?.current_value ?? ''))
  const [quantity, setQuantity] = useState(account?.quantity != null ? String(account.quantity) : '')
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? '')
  const [ifscCode, setIfscCode] = useState(account?.ifsc_code ?? '')
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [showDebitCard, setShowDebitCard] = useState(Boolean(account?.debit_card_number))
  const [debitCardNumber, setDebitCardNumber] = useState(account?.debit_card_number ?? '')
  const [debitCardNetwork, setDebitCardNetwork] = useState(account?.debit_card_network ?? 'Visa')
  const [debitCardExpiryMonth, setDebitCardExpiryMonth] = useState(
    account?.debit_card_expiry_month != null ? String(account.debit_card_expiry_month) : ''
  )
  const [debitCardExpiryYear, setDebitCardExpiryYear] = useState(
    account?.debit_card_expiry_year != null ? String(account.debit_card_expiry_year) : ''
  )
  const [debitCardCvv, setDebitCardCvv] = useState(account?.debit_card_cvv ?? '')
  const [debitCardName, setDebitCardName] = useState(account?.debit_card_name_on_card ?? '')

  const [principalAmount, setPrincipalAmount] = useState(
    account?.principal_amount != null ? String(account.principal_amount) : ''
  )
  const [interestRate, setInterestRate] = useState(
    account?.interest_rate != null ? String(account.interest_rate) : ''
  )
  const [tenureMonths, setTenureMonths] = useState(
    account?.tenure_months != null ? String(account.tenure_months) : ''
  )
  const [emiAmount, setEmiAmount] = useState(
    account?.emi_amount != null ? String(account.emi_amount) : ''
  )
  const [loanStartDate, setLoanStartDate] = useState(() => {
    if (!account?.loan_start_date) return ''
    const d = new Date(account.loan_start_date)
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  })
  const [documentPath, setDocumentPath] = useState(account?.document_path ?? null)
  const [documentOriginalName, setDocumentOriginalName] = useState(account?.document_original_name ?? null)
  const [purchasePrice, setPurchasePrice] = useState(
    account?.purchase_price != null ? String(account.purchase_price) : ''
  )
  const [purchaseDate, setPurchaseDate] = useState(() => {
    if (!account?.purchase_date) return ''
    const d = new Date(account.purchase_date)
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  })
  const [ownershipPct, setOwnershipPct] = useState(account?.ownership_pct != null ? String(account.ownership_pct) : '100')
  const [scheduleExtracting, setScheduleExtracting] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleSummary, setScheduleSummary] = useState<string | null>(null)

  const showManualQuantity = MANUAL_QUANTITY_SUBTYPES.includes(subtype)
  const showQuantity = showManualQuantity
  const showAccountNumber = category === 'bank' || SUBTYPES_WITH_ACCOUNT_NUMBER.includes(subtype)
  const showBankExtras = category === 'bank'
  const isLoan = category === 'loan'
  const isEditing = Boolean(account)
  const isVehicle = subtype === 'vehicle'
  const showPurchaseFields = isVehicle || subtype === 'home' || subtype === 'land' || category === 'real_estate'
  const showOwnershipField = category === 'real_estate'
  // Loans keep an editable value here — it's the one entry point for the sync-from-schedule
  // review flow. For every other account, current value / invested amount / quantity are only
  // ever changed via Check-in once the account exists, so history stays consistent.
  const hideValueFieldsOnEdit = isEditing && !isLoan

  const applyScheduleExtraction = (
    extraction: LoanScheduleExtraction,
    storedPath: string,
    originalName: string | null
  ): void => {
    if (extraction.principal_amount != null) setPrincipalAmount(String(extraction.principal_amount))
    if (extraction.interest_rate != null) setInterestRate(String(extraction.interest_rate))
    if (extraction.tenure_months != null) setTenureMonths(String(extraction.tenure_months))
    if (extraction.emi_amount != null) setEmiAmount(String(extraction.emi_amount))
    if (extraction.loan_start_date) {
      const d = new Date(extraction.loan_start_date)
      if (!isNaN(d.getTime())) setLoanStartDate(d.toISOString().slice(0, 10))
    }
    if (extraction.outstanding_balance != null) setCurrentValue(String(extraction.outstanding_balance))
    setDocumentPath(storedPath)
    setDocumentOriginalName(originalName)

    const parts: string[] = []
    if (extraction.installments_paid != null && extraction.installments_remaining != null) {
      parts.push(
        `${extraction.installments_paid} of ${
          extraction.installments_paid + extraction.installments_remaining
        } installments paid`
      )
    }
    if (extraction.outstanding_balance != null) {
      parts.push(`outstanding balance ${formatCurrency(extraction.outstanding_balance)}`)
    }
    const summary = parts.length > 0 ? `From repayment schedule: ${parts.join(', ')}, as of today.` : null
    setScheduleSummary(summary)
    if (summary) {
      setNotes((prev) => (prev ? `${prev}\n\n${summary}` : summary))
    }
  }

  const uploadSchedule = async (): Promise<void> => {
    setScheduleError(null)
    const path = await api().accounts.pickDocument()
    if (!path) return
    setScheduleExtracting(true)
    try {
      const result = await api().accounts.extractLoanSchedule(path)
      applyScheduleExtraction(result.extraction, result.storedPath, result.originalName)
    } catch (e) {
      setScheduleError((e as Error).message)
    } finally {
      setScheduleExtracting(false)
    }
  }

  const resyncSchedule = async (): Promise<void> => {
    if (!account) return
    setScheduleError(null)
    setScheduleExtracting(true)
    try {
      const result = await api().accounts.reExtractLoanSchedule(account.id)
      applyScheduleExtraction(result.extraction, result.storedPath, result.originalName)
    } catch (e) {
      setScheduleError((e as Error).message)
    } finally {
      setScheduleExtracting(false)
    }
  }

  useEffect(() => {
    if (autoSync && account && account.document_path) {
      resyncSchedule()
    }
    // Only ever auto-run once, right when the modal opens for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const submit = async (): Promise<void> => {
    setError(null)
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const value = Number(currentValue)
    if (isNaN(value)) {
      setError('Current value must be a number')
      return
    }
    const input: AccountInput = {
      name: name.trim(),
      category,
      subtype,
      institution: institution.trim() || null,
      currency: 'INR',
      is_liability: CATEGORY_IS_LIABILITY[category] ? 1 : 0,
      current_value: value,
      quantity: showQuantity && quantity ? Number(quantity) : null,
      account_number: showAccountNumber && accountNumber.trim() ? accountNumber.trim() : null,
      ifsc_code: showBankExtras && ifscCode.trim() ? ifscCode.trim().toUpperCase() : null,
      debit_card_number:
        showBankExtras && showDebitCard && debitCardNumber.trim() ? debitCardNumber.trim() : null,
      debit_card_network: showBankExtras && showDebitCard ? debitCardNetwork : null,
      debit_card_expiry_month:
        showBankExtras && showDebitCard && debitCardExpiryMonth ? Number(debitCardExpiryMonth) : null,
      debit_card_expiry_year:
        showBankExtras && showDebitCard && debitCardExpiryYear ? Number(debitCardExpiryYear) : null,
      debit_card_cvv: showBankExtras && showDebitCard && debitCardCvv.trim() ? debitCardCvv.trim() : null,
      debit_card_name_on_card:
        showBankExtras && showDebitCard && debitCardName.trim() ? debitCardName.trim() : null,
      principal_amount:
        (isLoan || subtype === 'mutual_fund') && principalAmount ? Number(principalAmount) : null,
      interest_rate: isLoan && interestRate ? Number(interestRate) : null,
      tenure_months: isLoan && tenureMonths ? Number(tenureMonths) : null,
      emi_amount: isLoan && emiAmount ? Number(emiAmount) : null,
      loan_start_date: isLoan && loanStartDate ? new Date(loanStartDate).toISOString() : null,
      document_path: isLoan ? documentPath : null,
      document_original_name: isLoan ? documentOriginalName : null,
      purchase_price: showPurchaseFields && purchasePrice ? Number(purchasePrice) : null,
      purchase_date: showPurchaseFields && purchaseDate ? new Date(purchaseDate).toISOString() : null,
      ownership_pct: showOwnershipField && ownershipPct ? Number(ownershipPct) : null,
      notes: notes.trim() || null
    }
    setBusy(true)
    try {
      const saved = account
        ? await api().accounts.update(account.id, input)
        : await api().accounts.create(input)
      onSaved(saved)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function irdaiDepreciatedValue(purchasePriceVal: number, purchaseDateStr: string): number {
    const months = Math.floor((Date.now() - new Date(purchaseDateStr).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    if (months < 6) return purchasePriceVal * 0.95
    if (months < 12) return purchasePriceVal * 0.85
    if (months < 24) return purchasePriceVal * 0.80
    if (months < 36) return purchasePriceVal * 0.70
    if (months < 48) return purchasePriceVal * 0.60
    if (months < 60) return purchasePriceVal * 0.50
    const extraYears = Math.floor((months - 60) / 12)
    return Math.max(purchasePriceVal * (0.50 - extraYears * 0.10), purchasePriceVal * 0.20)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{account ? 'Edit account' : 'Add account'}</h2>

        <div className="form-row">
          <div className="field">
            <label>Category</label>
            <select
              value={category}
              onChange={(e) => {
                const c = e.target.value as AccountCategory
                setCategory(c)
                setSubtype(SUBTYPES_BY_CATEGORY[c][0].value)
              }}
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select value={subtype} onChange={(e) => setSubtype(e.target.value as AccountSubtype)}>
              {SUBTYPES_BY_CATEGORY[category].map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Savings" />
        </div>

        <div className="form-row">
          <div className="field">
            <label>Institution</label>
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. HDFC Bank" />
          </div>
          <div className="field">
            <label>{isLoan ? 'Outstanding balance (₹)' : category === 'real_estate' ? 'Current market value of the unit (₹)' : 'Current value (₹)'}</label>
            {hideValueFieldsOnEdit ? (
              <div className="help-text">
                {formatCurrency(Number(currentValue) || 0)} — use the Check-in option from the ⋮
                menu to update this.
              </div>
            ) : (
              <>
                <input value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
                {subtype === 'mutual_fund' && (
                  <div className="help-text">
                    Enter the combined current value of all your mutual funds and SIPs together —
                    no need to list each fund separately.
                  </div>
                )}
                {subtype === 'physical_gold' && (
                  <div className="help-text">Current market value of the gold you hold.</div>
                )}
                {subtype === 'rsu' && (
                  <div className="help-text">
                    Current value in ₹ from your broker portal (e.g. Morgan Stanley StockConnect).
                  </div>
                )}
                {isLoan && (
                  <div className="help-text">
                    What you still owe today — this is what counts against your net worth, not the
                    original loan amount below. Upload a repayment schedule further down to fill
                    this in automatically.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {subtype === 'mutual_fund' && !hideValueFieldsOnEdit && (
          <div className="field" style={{ maxWidth: '50%' }}>
            <label>Net invested amount (₹, optional)</label>
            <input value={principalAmount} onChange={(e) => setPrincipalAmount(e.target.value)} />
            <div className="help-text">
              Total amount you've put in across all SIPs/lump-sum purchases — used to show your
              overall gain or loss against the current value above.
            </div>
          </div>
        )}

        {isLoan && (
          <>
            <div className="subsection-label">Repayment schedule</div>
            <div className="field">
              <button
                type="button"
                className="btn secondary small"
                onClick={uploadSchedule}
                disabled={scheduleExtracting}
              >
                <Upload size={13} />
                {scheduleExtracting
                  ? 'Reading schedule…'
                  : documentPath
                    ? 'Replace repayment schedule'
                    : 'Upload repayment schedule (auto-fill)'}
              </button>
              {documentPath && (
                <>
                  <button
                    type="button"
                    className="btn secondary small"
                    style={{ marginLeft: 6 }}
                    onClick={() => api().accounts.openDocument(documentPath)}
                  >
                    <ICON_VIEW size={13} /> View
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    style={{ marginLeft: 6 }}
                    onClick={() => api().accounts.downloadDocument(documentPath, documentOriginalName)}
                  >
                    <ICON_DOWNLOAD size={13} /> Download
                  </button>
                </>
              )}
              <div className="help-text">
                Upload the lender's amortization/repayment schedule PDF and AI fills in the fields
                below, including today's outstanding balance, by reading the installment table itself.
                Your chosen AI provider reads the document, and the details are saved privately on
                your device.
              </div>
              {scheduleSummary && <div className="success-text">{scheduleSummary}</div>}
              {scheduleError && <div className="error-text">{scheduleError}</div>}
            </div>

            <div className="subsection-label">Loan details</div>
            <div className="form-row">
              <div className="field">
                <label>Original loan amount (₹)</label>
                <input
                  value={principalAmount}
                  onChange={(e) => setPrincipalAmount(e.target.value)}
                  placeholder="What you originally borrowed"
                />
              </div>
              <div className="field">
                <label>Interest rate (% p.a.)</label>
                <input value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Tenure (months)</label>
                <input
                  value={tenureMonths}
                  onChange={(e) => setTenureMonths(e.target.value)}
                  placeholder="e.g. 240 for 20 years"
                />
              </div>
              <div className="field">
                <label>EMI (₹/month)</label>
                <input value={emiAmount} onChange={(e) => setEmiAmount(e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ maxWidth: '50%' }}>
              <label>Loan start date</label>
              <input type="date" value={loanStartDate} onChange={(e) => setLoanStartDate(e.target.value)} />
            </div>
          </>
        )}

        {showAccountNumber && (
          <div className="form-row">
            <div className="field">
              <label>{showBankExtras ? 'Account number' : 'Account / folio / PRAN number'}</label>
              <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </div>
            {showBankExtras && (
              <div className="field">
                <label>IFSC code</label>
                <input
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value)}
                  placeholder="e.g. HDFC0001234"
                />
              </div>
            )}
          </div>
        )}

        {subtype === 'physical_gold' && !isEditing && (
          <div className="field">
            <label>Weight in grams (optional)</label>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        )}
        {subtype === 'rsu' && !isEditing && (
          <div className="field">
            <label>Quantity</label>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Vested share count from your broker portal"
            />
          </div>
        )}

        {showBankExtras && (
          <div className="field">
            {!showDebitCard ? (
              <button type="button" className="btn secondary small" onClick={() => setShowDebitCard(true)}>
                <Plus size={13} /> Add debit card details (optional)
              </button>
            ) : (
              <>
                <div className="subsection-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                  Debit card details (optional)
                </div>
                <div className="form-row">
                  <div className="field">
                    <label>Card number</label>
                    <input
                      value={debitCardNumber}
                      onChange={(e) => setDebitCardNumber(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Name on card</label>
                    <input value={debitCardName} onChange={(e) => setDebitCardName(e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label>Network</label>
                    <select
                      value={debitCardNetwork}
                      onChange={(e) => setDebitCardNetwork(e.target.value)}
                    >
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
                      <input
                        value={debitCardExpiryMonth}
                        onChange={(e) => setDebitCardExpiryMonth(e.target.value)}
                        placeholder="MM"
                      />
                      <input
                        value={debitCardExpiryYear}
                        onChange={(e) => setDebitCardExpiryYear(e.target.value)}
                        placeholder="YYYY"
                      />
                    </div>
                  </div>
                </div>
                <div className="field" style={{ maxWidth: '50%' }}>
                  <label>CVV</label>
                  <input value={debitCardCvv} onChange={(e) => setDebitCardCvv(e.target.value)} />
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setShowDebitCard(false)}
                >
                  <X size={13} /> Remove debit card details
                </button>
              </>
            )}
          </div>
        )}

        {showPurchaseFields && (
          <div className="form-row">
            <div className="field">
              <label>Purchase price (₹)</label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="Original purchase price"
              />
            </div>
            <div className="field">
              <label>Purchase date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {showOwnershipField && (
          <div className="form-row">
            <div className="field">
              <label>Your ownership (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={ownershipPct}
                onChange={(e) => setOwnershipPct(e.target.value)}
                placeholder="100"
              />
              <div className="help-text">
                For jointly owned property, enter your share — e.g. 50 for half. Artha uses this to count only your portion toward net worth.
              </div>
            </div>
            <div className="field">
              {Number(ownershipPct) < 100 && currentValue && (
                <div style={{ background: 'rgba(91,141,239,0.07)', border: '1px solid rgba(91,141,239,0.25)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>Your share counted in net worth</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {formatCurrency(Math.round(Number(currentValue) * Number(ownershipPct) / 100))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                    Applied automatically — enter the full property value above.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isVehicle && purchasePrice && purchaseDate && (
          <div style={{ background: 'rgba(91,141,239,0.07)', border: '1px solid rgba(91,141,239,0.25)', borderRadius: 'var(--radius)', padding: '10px 14px', marginTop: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
              IRDAI depreciated value (estimated)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.5 }}>
              Based on IRDAI standard depreciation slabs applied to your purchase price of {formatCurrency(Number(purchasePrice))}, the Insured Declared Value (IDV) of this vehicle today is approximately:
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              {formatCurrency(irdaiDepreciatedValue(Number(purchasePrice), purchaseDate))}
            </div>
            {!hideValueFieldsOnEdit && (
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => setCurrentValue(String(Math.round(irdaiDepreciatedValue(Number(purchasePrice), purchaseDate))))}
              >
                Use as current value
              </button>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
              You can override the current value with your own estimate — this is just a reference based on IRDAI guidelines.
            </div>
          </div>
        )}

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
