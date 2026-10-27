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

  return (
    <div className="card section" style={{ padding: '10px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        {due.length} recurring transaction{due.length === 1 ? '' : 's'} due this month
      </div>
      {due.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 13 }}>
          <span style={{ flex: 1 }}>
            {t.description} — {formatCurrency(t.amount)}
          </span>
          <button type="button" className="btn secondary small" onClick={() => addOne(t)} disabled={busyId === t.id}>
            Add
          </button>
          <button type="button" className="icon-btn" onClick={() => dismiss(t)} title="Not this month">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
