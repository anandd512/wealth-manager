import { useEffect, type CSSProperties } from 'react'
import { PartyPopper, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { formatCurrency } from '../lib/format'

interface Props {
  accountName: string
  previousValue: number
  newValue: number
  currency: string
  onDone: () => void
}

const AUTO_DISMISS_MS = 3200

const PRAISE = ['Nice work!', 'Great habit!', 'Staying on top of it!', 'Look at you go!', 'Keep it up!']

export default function CheckInCelebration({
  accountName,
  previousValue,
  newValue,
  currency,
  onDone
}: Props): JSX.Element {
  useEffect(() => {
    const t = setTimeout(onDone, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const diff = newValue - previousValue
  const changed = diff !== 0
  const praise = PRAISE[Math.floor(Math.random() * PRAISE.length)]

  return (
    <div className="celebration-toast" onClick={onDone} role="status">
      <div className="celebration-burst">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="celebration-spark" style={{ '--i': i } as CSSProperties} />
        ))}
        <div className="celebration-icon">
          <PartyPopper size={20} />
        </div>
      </div>
      <div>
        <div className="celebration-title">{praise}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {accountName} checked in
          {changed && (
            <span className={diff > 0 ? 'celebration-up' : 'celebration-down'} style={{ marginLeft: 6 }}>
              {diff > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {diff > 0 ? '+' : ''}
              {formatCurrency(diff, currency)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
