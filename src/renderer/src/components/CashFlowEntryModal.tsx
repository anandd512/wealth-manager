import { api } from '../lib/api'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CashFlowCategory,
  CashFlowDirection,
  CashFlowTransaction,
  CashFlowTransactionInput,
  CashFlowTrackedAccount
} from '../../../shared/types'
import { CASH_FLOW_SUBCATEGORIES } from '../../../shared/types'
import { formatCurrencyPrecise, parseIndianAmount, todayLocalDateString } from '../lib/format'
import { friendlyError } from '../lib/friendlyError'
import { categoriesFor } from '../lib/cashFlowCategories'
import { useFocusTrap } from '../lib/useFocusTrap'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  direction: CashFlowDirection
  entry: CashFlowTransaction | null
  trackedAccounts: CashFlowTrackedAccount[]
  defaultDate: string
  onClose: () => void
  onSaved: () => void
}

interface RecentDescription {
  description: string
  category: CashFlowCategory | null
  subcategory: string | null
  account_sync_id: string | null
}

const CASH_OPTION = '__cash__'
const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']

function existingPossibleDuplicate(
  existing: CashFlowTransaction[],
  txnDate: string,
  amount: number,
  description: string
): boolean {
  const norm = description.trim().toLowerCase()
  return existing.some((e) => {
    const dayDiff = Math.abs(new Date(e.txn_date).getTime() - new Date(txnDate).getTime()) / 86400000
    const descMatch = norm && (e.description.toLowerCase().includes(norm) || norm.includes(e.description.toLowerCase()))
    return dayDiff <= 1 && Math.abs(e.amount - amount) < 0.01 && descMatch
  })
}

export default function CashFlowEntryModal({
  direction: initialDirection,
  entry,
  trackedAccounts,
  defaultDate,
  onClose,
  onSaved
}: Props): JSX.Element {
  const [direction, setDirection] = useState(initialDirection)
  const [txnDate, setTxnDate] = useState(entry?.txn_date ?? defaultDate)
  const [description, setDescription] = useState(entry?.description ?? '')
  const [accountSyncId, setAccountSyncId] = useState(entry?.account_sync_id ?? '')
  const [amountText, setAmountText] = useState(entry ? String(entry.amount) : '')
  const [currency, setCurrency] = useState(entry?.currency ?? 'INR')
  const [category, setCategory] = useState<CashFlowCategory | ''>(entry?.category ?? '')
  const [subcategory, setSubcategory] = useState(entry?.subcategory ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [repeatsMonthly, setRepeatsMonthly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateWarning, setDateWarning] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState<RecentDescription[]>([])
  const [existingTxns, setExistingTxns] = useState<CashFlowTransaction[]>([])
  const [pendingClose, setPendingClose] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api().cashFlow.recentDescriptions().then(setRecent).catch(() => {})
    api().cashFlow.list().then(setExistingTxns).catch(() => {})
  }, [])

  useEffect(() => {
    dateRef.current?.focus()
  }, [])

  const isDirty =
    description.trim() !== (entry?.description ?? '') ||
    amountText !== (entry ? String(entry.amount) : '') ||
    txnDate !== (entry?.txn_date ?? defaultDate) ||
    notes.trim() !== (entry?.notes ?? '')

  const requestClose = (): void => {
    if (isDirty) setPendingClose(true)
    else onClose()
  }

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty])

  const containerRef = useFocusTrap(true)

  const parsedAmount = parseIndianAmount(amountText)

  const applyRecentMatch = (value: string): void => {
    setDescription(value)
    if (entry) return // don't clobber an existing entry's own category when just editing the description
    const match = recent.find((r) => r.description.toLowerCase() === value.trim().toLowerCase())
    if (match) {
      if (match.category) setCategory(match.category)
      if (match.subcategory) setSubcategory(match.subcategory)
      if (match.account_sync_id) setAccountSyncId(match.account_sync_id)
    }
  }

  const changeDirection = (d: CashFlowDirection): void => {
    setDirection(d)
    const valid = categoriesFor(d, 'long').some((c) => c.value === category)
    if (!valid) setCategory('')
  }

  useEffect(() => {
    if (!txnDate) {
      setDateWarning(null)
      return
    }
    const today = todayLocalDateString()
    if (txnDate > today) {
      setDateWarning('This date is in the future.')
    } else if (new Date(today).getTime() - new Date(txnDate).getTime() > 2 * 365 * 86400000) {
      setDateWarning('This date is over 2 years ago — double-check it.')
    } else {
      setDateWarning(null)
    }
  }, [txnDate])

  const categoryOptions = categoriesFor(direction, 'long')

  const validateAndMaybeWarn = (): string | null => {
    if (!txnDate) return 'Pick a date.'
    if (!description.trim()) return 'Enter a description.'
    if (parsedAmount === null) return 'Enter a valid amount, e.g. 1,250 or 1250.50.'
    if (parsedAmount <= 0) return 'Amount must be greater than zero.'
    return null
  }

  const buildInput = (): CashFlowTransactionInput => ({
    txn_date: txnDate,
    direction,
    description: description.trim(),
    account_sync_id: accountSyncId && accountSyncId !== CASH_OPTION ? accountSyncId : null,
    amount: parsedAmount!,
    currency: currency !== 'INR' ? currency : null,
    entry_method: 'manual',
    category: category || null,
    subcategory: subcategory.trim() || null,
    notes: notes.trim() || null
  })

  const doSave = async (keepOpen: boolean): Promise<void> => {
    setError(null)
    const validationMessage = validateAndMaybeWarn()
    if (validationMessage) {
      setError(validationMessage)
      return
    }
    if (
      !entry &&
      !duplicateWarning &&
      existingPossibleDuplicate(existingTxns, txnDate, parsedAmount!, description)
    ) {
      setDuplicateWarning(true)
      return
    }

    const input = buildInput()
    setBusy(true)
    try {
      if (entry) {
        await api().cashFlow.update(entry.id, input)
      } else {
        await api().cashFlow.create(input)
        if (repeatsMonthly) {
          const day = Number(txnDate.split('-')[2])
          await api().cashFlow.recurringCreate({
            direction,
            description: description.trim(),
            account_sync_id: input.account_sync_id,
            amount: parsedAmount!,
            category: category || null,
            subcategory: subcategory.trim() || null,
            day_of_month: day
          })
        }
      }
      if (keepOpen && !entry) {
        // "Save & add another" — keeps date/account, clears the rest for the next entry.
        setDescription('')
        setAmountText('')
        setCategory('')
        setSubcategory('')
        setNotes('')
        setDuplicateWarning(false)
        api().cashFlow.list().then(setExistingTxns).catch(() => {})
      } else {
        onSaved()
      }
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const descriptionListId = useMemo(() => `cashflow-descriptions-${direction}`, [direction])

  return (
    <>
      <div className="modal-backdrop" onClick={requestClose}>
        <div
          className="modal"
          ref={containerRef}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            // Only from a plain input/select — never re-trigger from a button that
            // already activates on Enter natively (would double-submit), nor from
            // the notes textarea (Enter there should insert a newline).
            if (e.key === 'Enter' && (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
              e.preventDefault()
              doSave(false)
            }
          }}
        >
          <h2>{entry ? 'Edit transaction' : 'Add transaction'}</h2>

          <div className="field">
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn small ${direction === 'income' ? '' : 'secondary'}`}
                onClick={() => changeDirection('income')}
              >
                Income
              </button>
              <button
                type="button"
                className={`btn small ${direction === 'expense' ? '' : 'secondary'}`}
                onClick={() => changeDirection('expense')}
              >
                Expense
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>Date</label>
              <input type="date" ref={dateRef} value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
              {dateWarning && <div className="help-text" style={{ color: 'var(--amber)' }}>{dateWarning}</div>}
            </div>
            <div className="field">
              <label>Amount</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  placeholder="e.g. 1,250"
                  style={amountText && parsedAmount === null ? { borderColor: 'var(--red)' } : undefined}
                  aria-label="Amount"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: 80 }}
                  aria-label="Currency"
                  title="Only change this if the amount wasn't in rupees — it's converted to INR at today's rate when saved"
                >
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {amountText && parsedAmount === null && (
                <div className="help-text" style={{ color: 'var(--red)' }}>
                  Couldn't read that as an amount.
                </div>
              )}
              {parsedAmount !== null && parsedAmount > 0 && (
                <div className="help-text">
                  {formatCurrencyPrecise(parsedAmount, currency)}
                  {currency !== 'INR' ? ' — converted to ₹ at today\'s rate when saved' : ''}
                </div>
              )}
            </div>
          </div>

          <div className="field">
            <label>Description</label>
            <input
              value={description}
              onChange={(e) => applyRecentMatch(e.target.value)}
              placeholder={direction === 'income' ? 'e.g. Salary, Interest, Bonus' : 'e.g. Groceries, Electricity bill'}
              list={descriptionListId}
              aria-label="Description"
            />
            <datalist id={descriptionListId}>
              {recent.map((r) => (
                <option key={r.description} value={r.description} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label>Paid via (optional)</label>
            <select value={accountSyncId} onChange={(e) => setAccountSyncId(e.target.value)} aria-label="Paid via">
              <option value="">No account</option>
              <option value={CASH_OPTION}>Cash</option>
              {trackedAccounts.map((a) => (
                <option key={a.sync_id} value={a.sync_id}>
                  {a.name}
                  {a.institution ? ` (${a.institution})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="field">
              <label>Category (optional)</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CashFlowCategory | '')}
                aria-label="Category"
              >
                <option value="">Uncategorized</option>
                {categoryOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Subcategory (optional)</label>
              <input
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g. Groceries"
                list="cashflow-subcategories"
                aria-label="Subcategory"
              />
              <datalist id="cashflow-subcategories">
                {CASH_FLOW_SUBCATEGORIES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          {!entry && (
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="checkbox" checked={repeatsMonthly} onChange={(e) => setRepeatsMonthly(e.target.checked)} />
                Repeats monthly (adds a reminder to log it again next month — never adds it automatically)
              </label>
            </div>
          )}

          <div className="field">
            <label>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} aria-label="Notes" />
          </div>

          {duplicateWarning && (
            <div className="help-text" style={{ color: 'var(--amber)' }}>
              This looks similar to an existing transaction (same date, amount, and description) — save anyway?
            </div>
          )}
          {error && <div className="error-text">{error}</div>}

          <div className="modal-actions">
            <button className="btn secondary" onClick={requestClose} disabled={busy}>
              Cancel
            </button>
            {!entry && (
              <button className="btn secondary" onClick={() => doSave(true)} disabled={busy}>
                {busy ? 'Saving…' : 'Save & add another'}
              </button>
            )}
            <button className="btn" onClick={() => doSave(false)} disabled={busy}>
              {busy ? 'Saving…' : duplicateWarning ? 'Save anyway' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingClose}
        title="Discard changes?"
        message="You have unsaved changes to this transaction. Discard them?"
        confirmLabel="Discard"
        onConfirm={() => {
          setPendingClose(false)
          onClose()
        }}
        onCancel={() => setPendingClose(false)}
      />
    </>
  )
}
