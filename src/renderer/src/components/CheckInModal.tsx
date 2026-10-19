import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Account, ValueHistoryRow } from '../../../shared/types'
import { CHECKIN_INVESTED_VALUE_SUBTYPES, CHECKIN_QUANTITY_SUBTYPES } from '../lib/categories'
import { formatCurrency, formatDate, todayLocalDateString } from '../lib/format'
import { ICON_EDIT, ICON_DELETE } from '../lib/actionIcons'

interface Props {
  account: Account
  onClose: () => void
  onSaved: (previousValue: number, saved: Account) => void
  onChanged: () => void
}

export default function CheckInModal({ account, onClose, onSaved, onChanged }: Props): JSX.Element {
  const [date, setDate] = useState(todayLocalDateString())
  const [value, setValue] = useState(String(account.current_value))
  const [investedValue, setInvestedValue] = useState(
    account.principal_amount != null ? String(account.principal_amount) : ''
  )
  const [quantity, setQuantity] = useState(account.quantity != null ? String(account.quantity) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [entries, setEntries] = useState<ValueHistoryRow[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editValue, setEditValue] = useState('')
  const [editInvestedValue, setEditInvestedValue] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [entriesError, setEntriesError] = useState<string | null>(null)
  const [entriesBusy, setEntriesBusy] = useState(false)
  const [entriesOpen, setEntriesOpen] = useState(false)
  const [deletingHistoryId, setDeletingHistoryId] = useState<number | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showInvestedValue = CHECKIN_INVESTED_VALUE_SUBTYPES.includes(account.subtype)
  const showQuantity = CHECKIN_QUANTITY_SUBTYPES.includes(account.subtype)
  const showExtraColumn = showInvestedValue || showQuantity

  const loadEntries = async (): Promise<void> => {
    setEntries(await api().accounts.history(account.id))
  }

  useEffect(() => {
    loadEntries()
  }, [])

  const submit = async (): Promise<void> => {
    setError(null)
    const num = Number(value)
    if (isNaN(num)) {
      setError('Value must be a number')
      return
    }
    let investedNum: number | null = null
    if (showInvestedValue && investedValue.trim()) {
      investedNum = Number(investedValue)
      if (isNaN(investedNum)) {
        setError('Invested amount must be a number')
        return
      }
    }
    let quantityNum: number | null = null
    if (showQuantity && quantity.trim()) {
      quantityNum = Number(quantity)
      if (isNaN(quantityNum)) {
        setError('Quantity must be a number')
        return
      }
    }
    setBusy(true)
    try {
      const saved = await api().accounts.checkIn(account.id, date, num, investedNum, quantityNum)
      onSaved(account.current_value, saved)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (row: ValueHistoryRow): void => {
    setEditingId(row.id)
    setEditDate(row.recorded_at.slice(0, 10))
    setEditValue(String(row.value))
    setEditInvestedValue(row.invested_value != null ? String(row.invested_value) : '')
    setEditQuantity(row.quantity != null ? String(row.quantity) : '')
    setEntriesError(null)
  }

  const saveEdit = async (): Promise<void> => {
    if (editingId === null) return
    const num = Number(editValue)
    if (isNaN(num)) {
      setEntriesError('Value must be a number')
      return
    }
    let investedNum: number | null = null
    if (showInvestedValue && editInvestedValue.trim()) {
      investedNum = Number(editInvestedValue)
      if (isNaN(investedNum)) {
        setEntriesError('Invested amount must be a number')
        return
      }
    }
    let quantityNum: number | null = null
    if (showQuantity && editQuantity.trim()) {
      quantityNum = Number(editQuantity)
      if (isNaN(quantityNum)) {
        setEntriesError('Quantity must be a number')
        return
      }
    }
    setEntriesBusy(true)
    try {
      await api().accounts.updateValueHistory(editingId, editDate, num, investedNum, quantityNum)
      setEditingId(null)
      await loadEntries()
      onChanged()
    } catch (e) {
      setEntriesError((e as Error).message)
    } finally {
      setEntriesBusy(false)
    }
  }

  const removeEntry = (id: number): void => {
    setEntries((prev) => prev.filter((r) => r.id !== id))
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    setDeletingHistoryId(id)
    deleteTimerRef.current = setTimeout(async () => {
      setDeletingHistoryId(null)
      await api().accounts.deleteValueHistory(id)
      await loadEntries()
      onChanged()
    }, 5000)
  }

  const undoDeleteEntry = (): void => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    setDeletingHistoryId(null)
    loadEntries()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        <h2>Update value</h2>
        <p className="help-text" style={{ marginBottom: 14 }}>
          Log {account.name}'s value as of a specific date. Logging the same date again updates
          that entry, not adds a new one. The account's current value always comes from the most
          recent check-in.
        </p>

        <div className="form-row">
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>New value (₹)</label>
            <input value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>

        {(showInvestedValue || showQuantity) && (
          <div className="form-row">
            {showInvestedValue && (
              <div className="field">
                <label>Invested amount (₹, optional)</label>
                <input value={investedValue} onChange={(e) => setInvestedValue(e.target.value)} />
                <div className="help-text">Total amount put in as of this date — used to track gain/loss.</div>
              </div>
            )}
            {showQuantity && (
              <div className="field">
                <label>Quantity (optional)</label>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <div className="help-text">
                  {account.subtype === 'physical_gold' ? 'Weight in grams' : 'Units / shares held'} as of this date.
                </div>
              </div>
            )}
          </div>
        )}

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions" style={{ marginBottom: 20 }}>
          <button className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>

        {entries.length > 0 && (
          <div className="field">
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setEntriesOpen((v) => !v)}
            >
              {entriesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Past entries ({entries.length})
            </button>
            {deletingHistoryId !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '6px 10px', background: 'var(--bg-inset)', borderRadius: 6, fontSize: 13 }}>
                <span className="muted">Entry deleted.</span>
                <button className="btn secondary small" onClick={undoDeleteEntry}>Undo</button>
              </div>
            )}
            {entriesOpen && (
            <div
              style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}
            >
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Value</th>
                    {showExtraColumn && <th>{showInvestedValue ? 'Invested' : 'Quantity'}</th>}
                    <th>Source</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {entries
                    .slice()
                    .reverse()
                    .map((row) =>
                      editingId === row.id ? (
                        <tr key={row.id}>
                          <td>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                            />
                          </td>
                          <td>
                            <input value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                          </td>
                          {showExtraColumn && (
                            <td>
                              <input
                                value={showInvestedValue ? editInvestedValue : editQuantity}
                                onChange={(e) =>
                                  showInvestedValue
                                    ? setEditInvestedValue(e.target.value)
                                    : setEditQuantity(e.target.value)
                                }
                              />
                            </td>
                          )}
                          <td className="muted">{row.source}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              className="btn small"
                              style={{ marginRight: 6 }}
                              onClick={saveEdit}
                              disabled={entriesBusy}
                            >
                              Save
                            </button>
                            <button
                              className="btn secondary small"
                              onClick={() => setEditingId(null)}
                              disabled={entriesBusy}
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.id}>
                          <td>{formatDate(row.recorded_at)}</td>
                          <td>{formatCurrency(row.value, account.currency)}</td>
                          {showExtraColumn && (
                            <td className="muted">
                              {showInvestedValue
                                ? row.invested_value != null
                                  ? formatCurrency(row.invested_value, account.currency)
                                  : '—'
                                : row.quantity != null
                                  ? row.quantity
                                  : '—'}
                            </td>
                          )}
                          <td className="muted">{row.source}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              className="btn secondary small"
                              style={{ marginRight: 6 }}
                              onClick={() => startEdit(row)}
                            >
                              <ICON_EDIT size={13} /> Edit
                            </button>
                            <button className="btn danger small" onClick={() => removeEntry(row.id)}>
                              <ICON_DELETE size={13} /> Delete
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>
            )}
            {entriesError && <div className="error-text">{entriesError}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
