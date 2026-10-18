import { useEffect, useState } from 'react'
import type { Account, ValueHistoryRow } from '../../../shared/types'
import { formatCurrency, formatDate } from '../lib/format'
import TrendChart from './TrendChart'
import { CHECKIN_INVESTED_VALUE_SUBTYPES, CHECKIN_QUANTITY_SUBTYPES } from '../lib/categories'

interface Props {
  account: Account
  onClose: () => void
}

export default function AccountTrendModal({ account, onClose }: Props): JSX.Element {
  const [entries, setEntries] = useState<ValueHistoryRow[]>([])

  const showInvestedValue = CHECKIN_INVESTED_VALUE_SUBTYPES.includes(account.subtype)
  const showQuantity = CHECKIN_QUANTITY_SUBTYPES.includes(account.subtype)
  const showExtraColumn = showInvestedValue || showQuantity

  useEffect(() => {
    window.api.accounts.history(account.id).then(setEntries)
  }, [account.id])

  const chartData = entries.map((e) => ({ date: e.recorded_at, value: e.value }))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        <h2>{account.name} — historical trend</h2>
        <p className="help-text" style={{ marginBottom: 14 }}>
          To add, edit, or delete a past entry, use the Check-in option instead.
        </p>

        <TrendChart data={chartData} height={200} label="Value" />

        <div className="field" style={{ marginTop: 16 }}>
          <label>Entries</label>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Value</th>
                  {showExtraColumn && <th>{showInvestedValue ? 'Invested' : 'Quantity'}</th>}
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {entries
                  .slice()
                  .reverse()
                  .map((row) => (
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
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
