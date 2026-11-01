import { useState } from 'react'
import { api } from '../lib/api'
import { X } from 'lucide-react'
import type { CashFlowRecurringTemplate } from '../../../shared/types'
import { formatCurrency } from '../lib/format'

interface Props {
  due: CashFlowRecurringTemplate[]
  month: string
  onHandled: () => void
}

// Never creates a transaction on its own — see db.ts's cash_flow_recurring comment.
// Each template is either explicitly added (a real create call, same as the manual
// entry modal would do) or dismissed for this month; either way it's marked handled
// so it stops nagging until next month.
export default function CashFlowRecurringNudge({ due, month, onHandled }: Props): JSX.Element | null {
  const [busyId, setBusyId] = useState<number | null>(null)
  if (due.length === 0) return null

  const addOne = async (t: CashFlowRecurringTemplate): Promise<void> => {
    setBusyId(t.id)
    try {
      const day = String(t.day_of_month).padStart(2, '0')
      await api().cashFlow.create({
        txn_date: `${month}-${day}`,
        direction: t.direction,
        description: t.description,
        account_sync_id: t.account_sync_id,
        amount: t.amount,
        currency: null,
        entry_method: 'manual',
        category: t.category,
        subcategory: t.subcategory,
        notes: null
      })
      await api().cashFlow.recurringMarkHandled(t.id, month)
      onHandled()
    } finally {
      setBusyId(null)
    }
  }

  const dismiss = async (t: CashFlowRecurringTemplate): Promise<void> => {
    await api().cashFlow.recurringMarkHandled(t.id, month)
    onHandled()
  }

  // Just the list — the "Needs attention" strip (CashFlowAttention) supplies the
  // heading and the surrounding card.
  return (
    <div className="cf-recurring-list">
      {due.map((t) => (
        <div key={t.id} className="cf-recurring-item">
          <span className={`chip ${t.direction === 'income' ? 'income' : 'expense'}`}>
            {t.direction === 'income' ? 'In' : 'Out'}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>{t.description}</span>
          <span className="num">{formatCurrency(t.amount)}</span>
          <button type="button" className="btn secondary small" onClick={() => addOne(t)} disabled={busyId === t.id}>
            {busyId === t.id ? 'Adding…' : 'Add'}
          </button>
          <button type="button" className="icon-btn" onClick={() => dismiss(t)} title="Skip this month">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
