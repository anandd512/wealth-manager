import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import type { AccountCategory } from '../../../shared/types'
import { CATEGORY_LABELS } from '../lib/categories'
import TrendChart from './TrendChart'

interface Props {
  category: AccountCategory
  onClose: () => void
}

export default function CategoryTrendModal({ category, onClose }: Props): JSX.Element {
  const [data, setData] = useState<{ date: string; total: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api().accounts.categoryHistory(category).then((rows: { date: string; total: number }[]) => {
      setData(rows)
      setLoading(false)
    })
  }, [category])

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const chartData = data.map((d) => ({ date: d.date, value: d.total }))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        <h2>{CATEGORY_LABELS[category]} — historical trend</h2>
        <p className="help-text" style={{ marginBottom: 14 }}>
          Combined total across all {CATEGORY_LABELS[category].toLowerCase()} accounts, forward-filled
          between check-ins.
        </p>

        {loading ? <div className="muted">Loading…</div> : <TrendChart data={chartData} height={260} label="Total" />}

        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
