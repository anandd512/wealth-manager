import { api } from '../lib/api'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, AlertTriangle, RotateCcw } from 'lucide-react'
import type {
  CashFlowCategory,
  CashFlowDirection,
  CashFlowExtractedTransaction,
  CashFlowStatementExtraction,
  CashFlowTrackedAccount,
  CashFlowTransaction
} from '../../../shared/types'
import { CASH_FLOW_SUBCATEGORIES } from '../../../shared/types'
import { formatCurrency, formatDate, formatMonthYear, isValidIsoDate, parseIndianAmount } from '../lib/format'
import { friendlyError } from '../lib/friendlyError'
import { categoriesFor } from '../lib/cashFlowCategories'
import { useFocusTrap } from '../lib/useFocusTrap'

interface Props {
  extraction: CashFlowStatementExtraction
  trackedAccounts: CashFlowTrackedAccount[]
  documentPath: string | null
  documentOriginalName: string | null
  fileHash: string
  onClose: () => void
  onSaved: () => void
}

interface EditableRow {
  txn_date: string
  direction: CashFlowDirection
  description: string
  raw_text: string | null
  amountText: string
  currency: string
  confidence: 'high' | 'medium' | 'low'
  category: CashFlowCategory
  subcategory: string
  removed: boolean
  possibleDuplicate: boolean
  isOutlier: boolean
  possibleCardBillDouble: boolean
}

type FilterMode = 'all' | 'uncategorized' | 'low_confidence' | 'large_amount'

interface RecentDescription {
  description: string
  category: CashFlowCategory | null
  subcategory: string | null
}

// Exact last-4-digit match beats a fuzzy name match — two accounts at the same bank
// ("HDFC Savings", "HDFC Salary") both contain "hdfc", so a plain substring match
// alone can silently pick the wrong one. Returns '' (force an explicit choice)
// rather than guessing when nothing is unambiguous.
function guessAccount(label: string | null, accounts: CashFlowTrackedAccount[]): string {
  if (!label) return ''
  const norm = label.trim().toLowerCase()
  const last4Match = norm.match(/\d{4}/)
  if (last4Match) {
    const byLast4 = accounts.filter((a) => a.account_number?.slice(-4) === last4Match[0])
    if (byLast4.length === 1) return byLast4[0].sync_id
  }
  const nameMatches = accounts.filter((a) => {
    const name = a.name.toLowerCase()
    return name === norm || norm.includes(name) || name.includes(norm)
  })
  return nameMatches.length === 1 ? nameMatches[0].sync_id : ''
}

function toRow(t: CashFlowExtractedTransaction): EditableRow {
  return {
    txn_date: t.txn_date,
    direction: t.direction,
    description: t.description,
    raw_text: t.raw_text,
    amountText: String(t.amount),
    currency: t.currency || 'INR',
    confidence: t.confidence,
    category: t.category,
    subcategory: t.subcategory ?? '',
    removed: false,
    possibleDuplicate: false,
    isOutlier: false,
    possibleCardBillDouble: false
  }
}

function descriptionsMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

function rowError(row: EditableRow): string | null {
  if (row.removed) return null
  if (!row.description.trim()) return 'Enter a description'
  if (!isValidIsoDate(row.txn_date)) return 'Enter a valid date'
  const amount = parseIndianAmount(row.amountText)
  if (amount === null) return 'Enter a valid amount'
  if (amount <= 0) return 'Amount must be greater than zero'
  return null
}

const CARD_KEYWORDS = ['credit card', 'card payment', 'cc payment', 'visa', 'mastercard', 'rupay', 'amex']

export default function CashFlowExtractionReviewModal({
  extraction,
  trackedAccounts,
  documentPath,
  documentOriginalName,
  fileHash,
  onClose,
  onSaved
}: Props): JSX.Element {
  const [accountSyncId, setAccountSyncId] = useState(() => guessAccount(extraction.account_label, trackedAccounts))
  const [transactions, setTransactions] = useState<EditableRow[]>(() =>
    // Newest-first, same convention as the ledger itself (#34) — not the statement's
    // own chronological order.
    [...extraction.transactions].sort((a, b) => b.txn_date.localeCompare(a.txn_date)).map(toRow)
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cardWarningAcknowledged, setCardWarningAcknowledged] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [trackedCardNames, setTrackedCardNames] = useState<string[]>([])
  const [recentDescriptions, setRecentDescriptions] = useState<RecentDescription[]>([])

  const containerRef = useFocusTrap(true)

  useEffect(() => {
    api()
      .creditCards.list()
      .then((cards: { nickname: string; issuer: string | null }[]) => {
        setTrackedCardNames(cards.flatMap((c) => [c.nickname, c.issuer].filter((s): s is string => Boolean(s))))
      })
      .catch(() => {})
    api().cashFlow.recentDescriptions().then(setRecentDescriptions).catch(() => {})
  }, [])

  // Prefills category/subcategory for rows whose description exactly matches one the
  // user has classified by hand before — their own past choice for that narration is
  // more trustworthy than the model's generic guess (#102). Keyed on recentDescriptions,
  // which is fetched once and never changes again, so this never clobbers a correction
  // made afterward in the table below.
  useEffect(() => {
    if (recentDescriptions.length === 0) return
    setTransactions((prev) =>
      prev.map((row) => {
        const match = recentDescriptions.find((r) => r.description.toLowerCase() === row.description.trim().toLowerCase())
        if (!match?.category) return row
        return { ...row, category: match.category, subcategory: match.subcategory ?? row.subcategory }
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentDescriptions])

  // One-time, batch-local flags computed when the extraction first loads: an outlier
  // amount relative to this statement's own transactions, and a card-bill-shaped
  // description when the user also tracks a credit card (possible double count if
  // that card's own spending is tracked separately too) — see the project plan's
  // Phase E. Neither comes from the model; both are heuristics over what it returned.
  useEffect(() => {
    setTransactions((prev) => {
      const byDirection = (d: CashFlowDirection): number[] =>
        prev.filter((t) => t.direction === d).map((t) => parseIndianAmount(t.amountText) ?? 0).sort((a, b) => a - b)
      const median = (xs: number[]): number => (xs.length === 0 ? 0 : xs[Math.floor(xs.length / 2)])
      const incomeMedian = byDirection('income').length >= 5 ? median(byDirection('income')) : null
      const expenseMedian = byDirection('expense').length >= 5 ? median(byDirection('expense')) : null
      const lowerNames = trackedCardNames.map((n) => n.toLowerCase())

      return prev.map((row) => {
        const amount = parseIndianAmount(row.amountText) ?? 0
        const relevantMedian = row.direction === 'income' ? incomeMedian : expenseMedian
        const isOutlier = relevantMedian !== null && relevantMedian > 0 && amount > relevantMedian * 5
        const descLower = row.description.toLowerCase()
        const possibleCardBillDouble =
          row.direction === 'expense' &&
          (CARD_KEYWORDS.some((k) => descLower.includes(k)) || lowerNames.some((n) => descLower.includes(n)))
        return { ...row, isOutlier, possibleCardBillDouble }
      })
    })
    // Deliberately once per extraction load (+ once cards arrive) — not on every
    // row edit, which would make amounts the user just fixed re-flag themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedCardNames])

  // Flags rows that look like they might already be in the ledger (same account,
  // date within a day, same amount, similar description) — shown as a warning, never
  // auto-removed, since the user is the one who actually knows if it's a duplicate.
  useEffect(() => {
    if (!accountSyncId) return
    let cancelled = false
    api()
      .cashFlow.list()
      .then((existing: CashFlowTransaction[]) => {
        if (cancelled) return
        const sameAccount = existing.filter((e) => e.account_sync_id === accountSyncId)
        setTransactions((prev) =>
          prev.map((row) => {
            const amount = parseIndianAmount(row.amountText)
            const possibleDuplicate =
              amount !== null &&
              sameAccount.some((e) => {
                const dayDiff = Math.abs(new Date(e.txn_date).getTime() - new Date(row.txn_date).getTime()) / 86400000
                return dayDiff <= 1 && Math.abs(e.amount - amount) < 0.01 && descriptionsMatch(e.description, row.description)
              })
            return { ...row, possibleDuplicate }
          })
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // Only re-check when the account changes — re-running on every keystroke would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountSyncId])

  // Stable across renders (functional setState form, no closed-over `transactions`)
  // so the memoized row below can skip re-rendering every other row on each keystroke.
  const updateTxn = useCallback((idx: number, patch: Partial<EditableRow>): void => {
    setTransactions((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  }, [])

  const removeTxn = useCallback((idx: number): void => {
    setTransactions((prev) => prev.map((t, i) => (i === idx ? { ...t, removed: true } : t)))
  }, [])

  const restoreTxn = useCallback((idx: number): void => {
    setTransactions((prev) => prev.map((t, i) => (i === idx ? { ...t, removed: false } : t)))
  }, [])

  const addTxn = (): void => {
    setTransactions((prev) => [
      ...prev,
      {
        txn_date: prev[prev.length - 1]?.txn_date ?? extraction.statement_period_end ?? '',
        direction: 'expense',
        description: '',
        raw_text: null,
        amountText: '',
        currency: 'INR',
        confidence: 'high',
        category: 'discretionary',
        subcategory: '',
        removed: false,
        possibleDuplicate: false,
        isOutlier: false,
        possibleCardBillDouble: false
      }
    ])
  }

  const active = transactions.filter((t) => !t.removed)
  const removedCount = transactions.length - active.length

  const total = (direction: CashFlowDirection): number =>
    active
      .filter((t) => t.direction === direction)
      .reduce((sum, t) => sum + (parseIndianAmount(t.amountText) ?? 0), 0)

  const rowErrors = transactions.map(rowError)
  const hasRowErrors = rowErrors.some((e) => e !== null)
  const duplicateCount = active.filter((t) => t.possibleDuplicate).length
  const outlierCount = active.filter((t) => t.isOutlier).length
  const cardDoubleCount = active.filter((t) => t.possibleCardBillDouble).length
  const uncategorizedCount = active.filter((t) => !t.category).length

  const visibleIndices = useMemo(() => {
    return transactions
      .map((_, i) => i)
      .filter((i) => {
        const t = transactions[i]
        if (t.removed) return filter === 'all' // removed rows only show in "all" (struck through)
        if (filter === 'uncategorized') return !t.category
        if (filter === 'low_confidence') return t.confidence !== 'high'
        if (filter === 'large_amount') return t.isOutlier
        return true
      })
  }, [transactions, filter])

  const needsCardWarning = extraction.statement_type !== 'bank' && !cardWarningAcknowledged

  const netOfTransactions = total('income') - total('expense')
  const hasBalances = extraction.opening_balance != null && extraction.closing_balance != null
  const expectedNet = hasBalances ? extraction.closing_balance! - extraction.opening_balance! : null
  const reconciliationDiff = hasBalances ? Math.round((netOfTransactions - expectedNet!) * 100) / 100 : null
  const reconciles = reconciliationDiff !== null && Math.abs(reconciliationDiff) < 1

  const selectedAccount = trackedAccounts.find((a) => a.sync_id === accountSyncId)
  const destinationLabel = selectedAccount
    ? `${active.length} to ${selectedAccount.name}${
        extraction.statement_period_start ? ` (${formatMonthYear(extraction.statement_period_start.slice(0, 7), 'short')})` : ''
      }`
    : `${active.length} transaction${active.length === 1 ? '' : 's'}`

  const submit = async (): Promise<void> => {
    setError(null)
    const account = trackedAccounts.find((a) => a.sync_id === accountSyncId)
    if (!account) {
      setError('Select which tracked account this statement belongs to.')
      return
    }
    if (active.length === 0) {
      setError('Nothing to save — add at least one transaction or cancel.')
      return
    }
    if (hasRowErrors) {
      setError('Fix the highlighted rows before saving.')
      return
    }
    setBusy(true)
    try {
      await api().cashFlow.applyExtraction({
        accountSyncId,
        transactions: active.map((t) => ({
          txn_date: t.txn_date,
          direction: t.direction,
          description: t.description.trim(),
          raw_text: t.raw_text,
          amount: parseIndianAmount(t.amountText)!,
          currency: t.currency,
          confidence: t.confidence,
          category: t.category,
          subcategory: t.subcategory.trim() || null
        })),
        fileHash,
        documentPath,
        documentOriginalName,
        statementPeriodStart: extraction.statement_period_start,
        statementPeriodEnd: extraction.statement_period_end,
        openingBalance: extraction.opening_balance,
        closingBalance: extraction.closing_balance,
        excludedTransactions: extraction.excluded_transactions
      })
      onSaved()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const cancel = (): void => {
    if (documentPath) api().cashFlow.discardDocument(documentPath)
    onClose()
  }

  return (
    // No backdrop-dismiss here on purpose — this review can represent several
    // minutes of AI extraction + manual corrections; an accidental outside click
    // must not be able to throw all of that away. Cancel and Esc still work.
    <div className="modal-backdrop">
      <div className="modal" ref={containerRef} style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        <h2>Review statement</h2>
        <div className="help-text" style={{ marginBottom: 8 }}>
          AI read this as "{extraction.account_label ?? 'an unlabeled account'}" — match it to one of your tracked
          accounts, review each transaction below, then save.
        </div>

        {/* Compact summary strip (#94) instead of a long sentence */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }}>
          <span><strong>{active.length}</strong> transactions</span>
          <span style={{ color: 'var(--green)' }}><strong>{formatCurrency(total('income'))}</strong> income</span>
          <span style={{ color: 'var(--red)' }}><strong>{formatCurrency(total('expense'))}</strong> expense</span>
          {uncategorizedCount > 0 && <span style={{ color: 'var(--amber)' }}>{uncategorizedCount} uncategorized</span>}
          {duplicateCount > 0 && <span style={{ color: 'var(--amber)' }}>{duplicateCount} possible duplicates</span>}
          {outlierCount > 0 && <span style={{ color: 'var(--amber)' }}>{outlierCount} unusually large</span>}
          {removedCount > 0 && <span className="muted">{removedCount} removed</span>}
        </div>

        {extraction.confidence_notes && (
          <div className="help-text" style={{ marginBottom: 12 }}>
            AI flagged this: {extraction.confidence_notes}
          </div>
        )}

        {extraction.statement_type !== 'bank' && (
          <div className="error-text" style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              {extraction.statement_type === 'credit_card'
                ? "This looks like a credit card statement, not a bank account statement. Card statements aren't " +
                  "supported yet — importing it as-is would double-count spending already captured on your bank " +
                  'statement when you pay the card bill.'
                : "AI couldn't tell whether this is a bank or credit card statement — double-check before saving."}
              {!cardWarningAcknowledged && (
                <div style={{ marginTop: 6 }}>
                  <button type="button" className="btn secondary small" onClick={() => setCardWarningAcknowledged(true)}>
                    Continue anyway
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {cardDoubleCount > 0 && (
          <div className="help-text" style={{ marginBottom: 12, color: 'var(--amber)' }}>
            ⚠ {cardDoubleCount} row{cardDoubleCount === 1 ? '' : 's'} look like credit card bill payments — if you
            also import that card's own statement separately, its spending may get counted twice.
          </div>
        )}

        <div className="field">
          <label>Bank account</label>
          <select value={accountSyncId} onChange={(e) => setAccountSyncId(e.target.value)}>
            <option value="" disabled>
              {trackedAccounts.length > 1 ? 'Multiple accounts matched — select one…' : 'Select an account…'}
            </option>
            {trackedAccounts.map((a) => (
              <option key={a.sync_id} value={a.sync_id}>
                {a.name}
                {a.institution ? ` (${a.institution})` : ''}
                {a.account_number ? ` •••• ${a.account_number.slice(-4)}` : ''}
              </option>
            ))}
          </select>
          {trackedAccounts.length === 0 && (
            <div className="help-text" style={{ color: 'var(--red)' }}>
              No bank accounts yet — add one under Accounts, then come back to this upload.
            </div>
          )}
        </div>

        {hasBalances && (
          <div className="help-text" style={{ marginBottom: 12 }}>
            Statement: opening {formatCurrency(extraction.opening_balance!)} → closing{' '}
            {formatCurrency(extraction.closing_balance!)} (net {formatCurrency(expectedNet!)}). Your transactions net{' '}
            {formatCurrency(netOfTransactions)}.{' '}
            {reconciles ? (
              <span style={{ color: 'var(--green)' }}>✓ Matches</span>
            ) : (
              <span style={{ color: 'var(--amber)' }}>⚠ {formatCurrency(Math.abs(reconciliationDiff!))} unaccounted for</span>
            )}
          </div>
        )}

        {extraction.excluded_transactions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button type="button" className="btn secondary small" onClick={() => setShowExcluded((v) => !v)}>
              {showExcluded ? 'Hide' : 'Show'} {extraction.excluded_transactions.length} excluded line
              {extraction.excluded_transactions.length === 1 ? '' : 's'} (transfers, not counted)
            </button>
            {showExcluded && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraction.excluded_transactions.map((ex, i) => (
                      <tr key={i}>
                        <td className="muted">{formatDate(ex.txn_date)}</td>
                        <td>{ex.description}</td>
                        <td>{formatCurrency(ex.amount)}</td>
                        <td className="muted">{ex.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {([
            ['all', 'All'],
            ['uncategorized', `Uncategorized (${uncategorizedCount})`],
            ['low_confidence', `Needs a look (${active.filter((t) => t.confidence !== 'high').length})`],
            ['large_amount', `Unusually large (${outlierCount})`]
          ] as [FilterMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`btn small ${filter === mode ? '' : 'secondary'}`}
              onClick={() => setFilter(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ maxHeight: 380, overflow: 'auto', margin: '12px 0' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th>Confidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleIndices.map((i) => (
                <ReviewRow
                  key={i}
                  index={i}
                  row={transactions[i]}
                  error={rowErrors[i]}
                  onUpdate={updateTxn}
                  onRemove={removeTxn}
                  onRestore={restoreTxn}
                />
              ))}
            </tbody>
          </table>
          <datalist id="cashflow-review-subcategories">
            {CASH_FLOW_SUBCATEGORIES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <button type="button" className="btn secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={addTxn}>
          <Plus size={12} /> Add transaction
        </button>

        {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn secondary" onClick={cancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={busy || needsCardWarning}>
            {busy ? 'Saving…' : `Save ${destinationLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}

interface RowProps {
  index: number
  row: EditableRow
  error: string | null
  onUpdate: (index: number, patch: Partial<EditableRow>) => void
  onRemove: (index: number) => void
  onRestore: (index: number) => void
}

const CONFIDENCE_COLOR: Record<EditableRow['confidence'], string> = {
  high: 'var(--text-faint)',
  medium: 'var(--amber)',
  low: 'var(--red)'
}

// Memoized so editing one row doesn't re-render every other row in a 100+ row
// statement — safe because `transactions[i]`'s object reference only changes for
// the row actually touched (see updateTxn's functional setState), and onUpdate/
// onRemove/onRestore are stable (useCallback, no closed-over state).
const ReviewRow = memo(function ReviewRow({ index, row, error, onUpdate, onRemove, onRestore }: RowProps): JSX.Element {
  const [descFocused, setDescFocused] = useState(false)

  if (row.removed) {
    return (
      <tr style={{ opacity: 0.5 }}>
        <td className="muted" style={{ textDecoration: 'line-through' }}>{formatDate(row.txn_date)}</td>
        <td style={{ textDecoration: 'line-through' }}>{row.description}</td>
        <td colSpan={5} className="muted">Removed</td>
        <td>
          <button type="button" className="icon-btn" onClick={() => onRestore(index)} title="Restore">
            <RotateCcw size={14} />
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr
      style={
        row.possibleDuplicate
          ? { background: 'var(--amber-soft)' }
          : row.isOutlier || row.possibleCardBillDouble
            ? { background: 'rgba(240, 97, 107, 0.06)' }
            : undefined
      }
    >
      <td>
        <input
          type="date"
          aria-label={`Row ${index + 1} date`}
          style={{ width: 130, borderColor: !isValidIsoDate(row.txn_date) ? 'var(--red)' : undefined }}
          value={row.txn_date}
          onChange={(e) => onUpdate(index, { txn_date: e.target.value })}
        />
      </td>
      <td>
        <input
          aria-label={`Row ${index + 1} description`}
          style={{ width: descFocused ? 320 : 190, transition: 'width 120ms ease' }}
          value={row.description}
          onChange={(e) => onUpdate(index, { description: e.target.value })}
          onFocus={() => setDescFocused(true)}
          onBlur={() => setDescFocused(false)}
          placeholder="Description"
          title={row.raw_text && row.raw_text !== row.description ? `Original: ${row.raw_text}` : undefined}
        />
        {row.possibleDuplicate && <span title="Possible duplicate of an existing transaction"> ⚠</span>}
        {row.isOutlier && <span title="Unusually large amount for this statement"> ⚠</span>}
        {row.possibleCardBillDouble && <span title="Looks like a card bill payment — possible double count"> 💳</span>}
      </td>
      <td>
        <select
          aria-label={`Row ${index + 1} direction`}
          value={row.direction}
          onChange={(e) => {
            const direction = e.target.value as CashFlowDirection
            const categories = categoriesFor(direction, 'short')
            const category = categories.some((c) => c.value === row.category) ? row.category : categories[2].value
            onUpdate(index, { direction, category })
          }}
        >
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </td>
      <td>
        <input
          aria-label={`Row ${index + 1} amount`}
          style={{ width: 90, borderColor: parseIndianAmount(row.amountText) === null ? 'var(--red)' : undefined }}
          value={row.amountText}
          onChange={(e) => onUpdate(index, { amountText: e.target.value })}
          placeholder="Amount"
        />
        {row.currency !== 'INR' && <div style={{ fontSize: 10 }} className="muted">{row.currency}</div>}
      </td>
      <td>
        <select
          aria-label={`Row ${index + 1} category`}
          value={row.category}
          onChange={(e) => onUpdate(index, { category: e.target.value as CashFlowCategory })}
        >
          {categoriesFor(row.direction, 'short').map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          aria-label={`Row ${index + 1} subcategory`}
          style={{ width: 120 }}
          value={row.subcategory}
          onChange={(e) => onUpdate(index, { subcategory: e.target.value })}
          placeholder="Optional"
          list="cashflow-review-subcategories"
        />
      </td>
      <td style={{ color: CONFIDENCE_COLOR[row.confidence], fontSize: 11, textTransform: 'capitalize' }}>
        {row.confidence}
      </td>
      <td>
        <button type="button" className="icon-btn" onClick={() => onRemove(index)} title="Remove">
          <Trash2 size={14} />
        </button>
        {error && <div style={{ fontSize: 11, color: 'var(--red)', whiteSpace: 'nowrap' }}>{error}</div>}
      </td>
    </tr>
  )
})
