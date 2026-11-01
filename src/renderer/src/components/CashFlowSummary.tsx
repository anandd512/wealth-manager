import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react'
import { formatCurrency, parseIndianAmount } from '../lib/format'
import Popover from './Popover'

export interface PeriodTotals {
  income: number
  expense: number
  // Transfers/reimbursements in each direction — tracked, but not counted above.
  excludedIn: number
  excludedOut: number
}

interface Props {
  current: PeriodTotals | null // null while the first load is in flight
  previous: PeriodTotals | null // null when there's nothing like-for-like to compare to
  comparisonLabel: string | null
  // The goal is stored per month and scaled by the months the period spans.
  monthlyGoal: number | null
  periodMonths: number
  onGoalChange: (monthlyTarget: number | null) => Promise<void>
}

function GoalEditor({ current, onSave }: { current: number | null; onSave: (v: number | null) => Promise<void> }): JSX.Element {
  const [text, setText] = useState(current != null ? String(current) : '')
  const parsed = parseIndianAmount(text)
  const valid = parsed !== null && parsed > 0
  return (
    <Popover triggerClassName="cf-link-btn" trigger={current != null ? 'Edit goal' : 'Set a savings goal'} ariaLabel="Monthly savings goal">
      {(close) => (
        <form
          className="cf-popover-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) void onSave(parsed).then(close)
          }}
        >
          <div className="cf-popover-title">How much do you want to keep each month?</div>
          <div className="cf-amount-field">
            <span aria-hidden>₹</span>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 20,000" aria-label="Monthly savings goal" />
            <span className="muted">/month</span>
          </div>
          {text && !valid && <div className="help-text" style={{ color: 'var(--red)' }}>Enter an amount above zero.</div>}
          <div className="cf-popover-actions">
            {current != null && (
              <button type="button" className="btn secondary small cf-danger" onClick={() => void onSave(null).then(close)}>
                Remove
              </button>
            )}
            <button type="submit" className="btn small" disabled={!valid}>
              Save
            </button>
          </div>
        </form>
      )}
    </Popover>
  )
}

function savingsRate(t: PeriodTotals): number | null {
  return t.income > 0 ? ((t.income - t.expense) / t.income) * 100 : null
}

// One delta line, used by every card in the same format: arrow + amount + "vs …".
// `goodWhenUp` decides the color (spending going up is bad); the arrow carries the
// direction too, so meaning never rests on color alone.
function Delta({
  change,
  text,
  goodWhenUp,
  comparisonLabel
}: {
  change: number
  text: string
  goodWhenUp: boolean
  comparisonLabel: string
}): JSX.Element {
  if (Math.abs(change) < 0.005) {
    return <div className="cf-kpi-delta">No change vs {comparisonLabel}</div>
  }
  const up = change > 0
  const good = up === goodWhenUp
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <div className="cf-kpi-delta">
      <span className={good ? 'cf-kpi-delta-good' : 'cf-kpi-delta-bad'}>
        <Arrow size={13} aria-hidden />
        {text}
      </span>{' '}
      vs {comparisonLabel}
    </div>
  )
}

function pctChange(now: number, before: number): number | null {
  return before > 0 ? ((now - before) / before) * 100 : null
}

function Label({ text, hint }: { text: string; hint: string }): JSX.Element {
  return (
    <div className="label" title={hint}>
      {text}
      <Info aria-label={hint} className="cf-kpi-info" />
    </div>
  )
}

export default function CashFlowSummary({
  current,
  previous,
  comparisonLabel,
  monthlyGoal,
  periodMonths,
  onGoalChange
}: Props): JSX.Element {
  const periodGoal = monthlyGoal != null ? monthlyGoal * periodMonths : null
  if (!current) {
    return (
      <div className="cf-kpis section" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card stat-card">
            <div className="skeleton" style={{ width: '45%', height: 12 }} />
            <div className="skeleton" style={{ width: '70%', height: 28 }} />
            <div className="skeleton" style={{ width: '60%', height: 12 }} />
          </div>
        ))}
      </div>
    )
  }

  const net = current.income - current.expense
  const rate = savingsRate(current)
  const prevNet = previous ? previous.income - previous.expense : null
  const prevRate = previous ? savingsRate(previous) : null
  const inChange = previous ? pctChange(current.income, previous.income) : null
  const outChange = previous ? pctChange(current.expense, previous.expense) : null
  const goalPct = periodGoal && periodGoal > 0 ? Math.max(0, (net / periodGoal) * 100) : null

  return (
    <div className="cf-kpis section">
      <div className="card stat-card">
        <Label text="Money in" hint="Income — salary, interest, other earnings. Excludes transfers between your own accounts and reimbursements." />
        <div className="value">{formatCurrency(current.income)}</div>
        {inChange !== null && comparisonLabel && (
          <Delta change={inChange} text={`${Math.abs(inChange).toFixed(0)}%`} goodWhenUp comparisonLabel={comparisonLabel} />
        )}
        {current.excludedIn > 0 && (
          <div className="cf-kpi-note">+{formatCurrency(current.excludedIn)} transfers & refunds not counted</div>
        )}
      </div>

      <div className="card stat-card">
        <Label text="Money out" hint="Expenses — everything you spent. Excludes transfers to your own accounts." />
        <div className="value">{formatCurrency(current.expense)}</div>
        {outChange !== null && comparisonLabel && (
          <Delta change={outChange} text={`${Math.abs(outChange).toFixed(0)}%`} goodWhenUp={false} comparisonLabel={comparisonLabel} />
        )}
        {current.excludedOut > 0 && (
          <div className="cf-kpi-note">+{formatCurrency(current.excludedOut)} transfers not counted</div>
        )}
      </div>

      <div className="card stat-card">
        <Label text="Left over" hint="Net savings — money in minus money out. Negative means you spent more than you earned." />
        <div className={`value ${net < 0 ? 'negative' : ''}`}>
          {net < 0 ? '−' : ''}
          {formatCurrency(Math.abs(net))}
        </div>
        {prevNet !== null && comparisonLabel && (
          <Delta
            change={net - prevNet}
            text={formatCurrency(Math.abs(net - prevNet))}
            goodWhenUp
            comparisonLabel={comparisonLabel}
          />
        )}
        {goalPct === null && <GoalEditor current={null} onSave={onGoalChange} />}
        {goalPct !== null && periodGoal !== null && (
          <div className="cf-kpi-goal">
            <div className="cf-kpi-goal-text">
              <span title={periodMonths !== 1 ? `${formatCurrency(monthlyGoal ?? 0)}/month × ${periodMonths.toFixed(1)} months` : undefined}>
                Goal {formatCurrency(periodGoal)} · <GoalEditor current={monthlyGoal} onSave={onGoalChange} />
              </span>
              <span>{Math.round(goalPct)}%</span>
            </div>
            <div className="cf-meter" role="meter" aria-valuenow={Math.round(goalPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Savings goal progress">
              <div
                className="cf-meter-fill"
                style={{ width: `${Math.min(100, goalPct)}%`, background: goalPct >= 100 ? 'var(--green)' : 'var(--accent)' }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="card stat-card">
        <Label text="Savings rate" hint="Share of money in that you kept: left over ÷ money in. 20–30% is a common target." />
        <div className={`value ${rate !== null && rate < 0 ? 'negative' : ''}`}>{rate !== null ? `${rate.toFixed(0)}%` : '—'}</div>
        {rate !== null && prevRate !== null && comparisonLabel && (
          <Delta
            change={rate - prevRate}
            text={`${Math.abs(rate - prevRate).toFixed(0)} pts`}
            goodWhenUp
            comparisonLabel={comparisonLabel}
          />
        )}
        {rate === null && <div className="cf-kpi-note">No money in this period</div>}
      </div>
    </div>
  )
}
