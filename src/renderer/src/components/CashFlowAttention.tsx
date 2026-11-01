import { useState } from 'react'
import { ChevronDown, ChevronUp, FileWarning, Repeat, Tags } from 'lucide-react'
import type { CashFlowRecurringTemplate } from '../../../shared/types'
import CashFlowRecurringNudge from './CashFlowRecurringNudge'

interface Props {
  uncategorizedCount: number
  reviewingUncategorized: boolean
  onToggleUncategorized: () => void
  recurringDue: CashFlowRecurringTemplate[]
  month: string
  onRecurringHandled: () => void
  // Account names with no statement imported for the month on screen.
  missingStatements: string[]
  onImport: () => void
}

// One strip for everything that wants the user's attention, instead of a stack of
// separate banners and cards that push the page down. Renders nothing when there's
// nothing to do.
export default function CashFlowAttention({
  uncategorizedCount,
  reviewingUncategorized,
  onToggleUncategorized,
  recurringDue,
  month,
  onRecurringHandled,
  missingStatements,
  onImport
}: Props): JSX.Element | null {
  const [showRecurring, setShowRecurring] = useState(false)

  if (uncategorizedCount === 0 && recurringDue.length === 0 && missingStatements.length === 0 && !reviewingUncategorized) {
    return null
  }

  return (
    <div className="card cf-attention section" role="region" aria-label="Needs attention">
      {(uncategorizedCount > 0 || reviewingUncategorized) && (
        <div className="cf-attention-row">
          <Tags className="cf-attention-icon" />
          <div className="cf-attention-text">
            {uncategorizedCount > 0 ? (
              <>
                <strong>
                  {uncategorizedCount} transaction{uncategorizedCount === 1 ? '' : 's'}
                </strong>{' '}
                need{uncategorizedCount === 1 ? 's' : ''} a category
                <span className="cf-attention-sub">so they land in the right bucket in your totals and charts</span>
              </>
            ) : (
              <strong>All transactions are categorized</strong>
            )}
          </div>
          <button type="button" className="btn secondary small" onClick={onToggleUncategorized}>
            {reviewingUncategorized ? 'Show all' : 'Review'}
          </button>
        </div>
      )}

      {recurringDue.length > 0 && (
        <div className="cf-attention-row-group">
          <div className="cf-attention-row">
            <Repeat className="cf-attention-icon" />
            <div className="cf-attention-text">
              <strong>
                {recurringDue.length} recurring transaction{recurringDue.length === 1 ? '' : 's'}
              </strong>{' '}
              due this month
              <span className="cf-attention-sub">you asked to be reminded — nothing is added until you say so</span>
            </div>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setShowRecurring((v) => !v)}
              aria-expanded={showRecurring}
            >
              {showRecurring ? 'Hide' : 'Show'}
              {showRecurring ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
          {showRecurring && <CashFlowRecurringNudge due={recurringDue} month={month} onHandled={onRecurringHandled} />}
        </div>
      )}

      {missingStatements.length > 0 && (
        <div className="cf-attention-row">
          <FileWarning className="cf-attention-icon" />
          <div className="cf-attention-text">
            <strong>No statement this month</strong> for {missingStatements.join(', ')}
            <span className="cf-attention-sub">totals may be incomplete until it&apos;s imported</span>
          </div>
          <button type="button" className="btn secondary small" onClick={onImport}>
            Import
          </button>
        </div>
      )}
    </div>
  )
}
