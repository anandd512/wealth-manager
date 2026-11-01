import { api } from '../lib/api'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Info,
  CreditCard,
  CheckCircle2,
  Copy,
  X,
  ChevronDown,
  ChevronRight,
  Pencil
} from 'lucide-react'
import type {
  CashFlowCategory,
  CashFlowDirection,
  CashFlowExtractedTransaction,
  CashFlowStatementExtraction,
  CashFlowTrackedAccount,
  CashFlowTransaction
} from '../../../shared/types'
import { formatCurrency, formatDate, formatDateShort, formatMonthYear, isValidIsoDate, parseIndianAmount } from '../lib/format'
import { friendlyError } from '../lib/friendlyError'
import { categoriesFor, countsTowardPnl, defaultCategoryFor } from '../lib/cashFlowCategories'
import { useFocusTrap } from '../lib/useFocusTrap'
import CashFlowCategoryPicker from './CashFlowCategoryPicker'

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
  // null = Uncategorized; the backend's normalizeCategory accepts that, even
  // though the model itself always proposes one.
  category: CashFlowCategory | null
  subcategory: string
  removed: boolean
  possibleDuplicate: boolean
  isOutlier: boolean
  possibleCardBillDouble: boolean
}

type FilterMode = 'all' | 'uncategorized' | 'low_confidence' | 'flagged' | 'transfer'

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

const isFlagged = (t: EditableRow): boolean => t.possibleDuplicate || t.isOutlier || t.possibleCardBillDouble

const CARD_KEYWORDS = ['credit card', 'card payment', 'cc payment', 'visa', 'mastercard', 'rupay', 'amex']

interface Check {
  key: string
  tone: 'error' | 'warn' | 'info'
  icon: typeof Info
  body: JSX.Element
  action?: JSX.Element
}

// A full-height side sheet rather than a centered modal: a statement can be 100+
// rows, and the old layout spent its first screen on stacked warnings before the
// required account picker. Now: account + reconciliation up top, warnings folded
// into one "things to check" list, and rows that read as a list until clicked.
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
    setFilter('all')
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
      .filter((t) => t.direction === direction && countsTowardPnl(t.category))
      .reduce((sum, t) => sum + (parseIndianAmount(t.amountText) ?? 0), 0)

  const rowErrors = transactions.map(rowError)
  const errorCount = rowErrors.filter((e) => e !== null).length
  const duplicateCount = active.filter((t) => t.possibleDuplicate).length
  const outlierCount = active.filter((t) => t.isOutlier).length
  const cardDoubleCount = active.filter((t) => t.possibleCardBillDouble).length
  const flaggedCount = active.filter(isFlagged).length
  const uncategorizedCount = active.filter((t) => !t.category).length
  const lowConfidenceCount = active.filter((t) => t.confidence !== 'high').length
  const transferCount = active.filter((t) => t.category === 'transfer').length

  const visibleIndices = useMemo(() => {
    return transactions
      .map((_, i) => i)
      .filter((i) => {
        const t = transactions[i]
        if (t.removed) return filter === 'all' // removed rows only show in "all" (struck through)
        if (filter === 'uncategorized') return !t.category
        if (filter === 'low_confidence') return t.confidence !== 'high'
        if (filter === 'flagged') return isFlagged(t)
        if (filter === 'transfer') return t.category === 'transfer'
        return true
      })
  }, [transactions, filter])

  const needsCardWarning = extraction.statement_type !== 'bank' && !cardWarningAcknowledged

  // extraction.balanceCheck (computed server-side in cashFlowParser.ts) nets EVERY
  // line — kept and excluded — against the statement's own printed balance. A check
  // against kept transactions alone would false-positive on every statement with a
  // legitimate excluded transfer, since those move the real balance too.
  const reconciles = extraction.balanceCheck?.reconciled ?? false

  const selectedAccount = trackedAccounts.find((a) => a.sync_id === accountSyncId)
  const destinationLabel = selectedAccount
    ? `${active.length} to ${selectedAccount.name}${
        extraction.statement_period_start ? ` (${formatMonthYear(extraction.statement_period_start.slice(0, 7), 'short')})` : ''
      }`
    : `${active.length} transaction${active.length === 1 ? '' : 's'}`

  // Everything worth a second look, as one list. Blocking items come first.
  const checks: Check[] = []
  if (extraction.statement_type !== 'bank') {
    checks.push({
      key: 'type',
      tone: 'error',
      icon: AlertTriangle,
      body: (
        <>
          {extraction.statement_type === 'credit_card'
            ? "This looks like a credit card statement. Card statements aren't supported yet — importing it would " +
              'double-count spending already on your bank statement when you pay the card bill.'
            : "AI couldn't tell whether this is a bank or credit card statement — double-check before saving."}
        </>
      ),
      action: !cardWarningAcknowledged ? (
        <button type="button" className="btn secondary small" onClick={() => setCardWarningAcknowledged(true)}>
          Continue anyway
        </button>
      ) : undefined
    })
  }
  if (extraction.balanceCheck && !reconciles) {
    checks.push({
      key: 'balance',
      tone: 'error',
      icon: AlertTriangle,
      body: (
        <>
          Opening {formatCurrency(extraction.opening_balance!)} plus every line below should land on the statement&apos;s closing
          balance of {formatCurrency(extraction.closing_balance!)}, but comes to {formatCurrency(extraction.balanceCheck.expectedClosing)}.
          Some lines may be missing, duplicated or misread — check against the original.
        </>
      )
    })
  }
  if (duplicateCount > 0) {
    checks.push({
      key: 'dup',
      tone: 'warn',
      icon: Copy,
      body: (
        <>
          {duplicateCount} row{duplicateCount === 1 ? ' looks' : 's look'} like {duplicateCount === 1 ? 'a transaction' : 'transactions'} already
          in this account.
        </>
      ),
      action: (
        <button type="button" className="cf-link-btn" onClick={() => setFilter('flagged')}>
          Show
        </button>
      )
    })
  }
  if (cardDoubleCount > 0) {
    checks.push({
      key: 'card',
      tone: 'warn',
      icon: CreditCard,
      body: (
        <>
          {cardDoubleCount} row{cardDoubleCount === 1 ? ' looks' : 's look'} like a credit card bill payment — if you also import that
          card&apos;s statement, its spending may be counted twice.
        </>
      ),
      action: (
        <button type="button" className="cf-link-btn" onClick={() => setFilter('flagged')}>
          Show
        </button>
      )
    })
  }
  if (outlierCount > 0) {
    checks.push({
      key: 'outlier',
      tone: 'warn',
      icon: AlertTriangle,
      body: (
        <>
          {outlierCount} unusually large amount{outlierCount === 1 ? '' : 's'} compared with the rest of this statement.
        </>
      ),
      action: (
        <button type="button" className="cf-link-btn" onClick={() => setFilter('flagged')}>
          Show
        </button>
      )
    })
  }
  if (extraction.confidence_notes) {
    checks.push({ key: 'notes', tone: 'info', icon: Info, body: <>AI noted: {extraction.confidence_notes}</> })
  }
  checks.push({
    key: 'transfers',
    tone: 'info',
    icon: Info,
    body: (
      <>
        A transfer to one of your own accounts or a refund is tagged <strong>Transfer</strong> only once it matches an entry already
        in your ledger, so it stays visible but isn&apos;t counted as money in or out.
      </>
    )
  })
  const attentionCount = checks.filter((c) => c.tone !== 'info').length
  // Open by default when something needs a decision; otherwise folded away.
  const [checksOpen, setChecksOpen] = useState(() => extraction.statement_type !== 'bank' || Boolean(extraction.balanceCheck && !reconciles))

  const submit = async (): Promise<void> => {
    setError(null)
    const account = trackedAccounts.find((a) => a.sync_id === accountSyncId)
    if (!account) {
      setError('Choose which of your accounts this statement belongs to (at the top).')
      return
    }
    if (active.length === 0) {
      setError('Nothing to save — add at least one transaction or cancel.')
      return
    }
    if (errorCount > 0) {
      setFilter('all') // the broken rows might be hidden by the current filter
      setError(`Fix the ${errorCount} highlighted row${errorCount === 1 ? '' : 's'} before saving.`)
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
          // Uncategorized is stored as null (see EditableRow.category).
          category: t.category as CashFlowCategory,
          subcategory: t.subcategory.trim() || null
        })),
        fileHash,
        documentPath,
        documentOriginalName,
        statementPeriodStart: extraction.statement_period_start,
        statementPeriodEnd: extraction.statement_period_end,
        openingBalance: extraction.opening_balance,
        closingBalance: extraction.closing_balance
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

  const period =
    extraction.statement_period_start && extraction.statement_period_end
      ? `${formatDateShort(extraction.statement_period_start)} – ${formatDateShort(extraction.statement_period_end)}`
      : null

  return (
    // No backdrop-dismiss on purpose — this review can represent several minutes of
    // AI extraction + manual corrections; an accidental outside click must not be
    // able to throw all of that away. Cancel still works.
    <div className="sheet-backdrop">
      <div className="sheet" ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="cf-review-title">
        <header className="sheet-header">
          <div style={{ minWidth: 0 }}>
            <h2 id="cf-review-title">Review statement</h2>
            <div className="cf-review-file">
              {[documentOriginalName, period].filter(Boolean).join(' · ') || 'Uploaded statement'}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={cancel} title="Cancel import" aria-label="Cancel import">
            <X size={16} />
          </button>
        </header>

        <div className="sheet-body">
          <div className="cf-review-top">
            <div className="field" style={{ margin: 0, flex: '1 1 260px' }}>
              <label htmlFor="cf-review-account">Which account is this?</label>
              <select
                id="cf-review-account"
                value={accountSyncId}
                onChange={(e) => setAccountSyncId(e.target.value)}
                className={!accountSyncId ? 'cf-needs-value' : undefined}
              >
                <option value="" disabled>
                  Choose an account…
                </option>
                {trackedAccounts.map((a) => (
                  <option key={a.sync_id} value={a.sync_id}>
                    {a.name}
                    {a.institution ? ` (${a.institution})` : ''}
                    {a.account_number ? ` •••• ${a.account_number.slice(-4)}` : ''}
                  </option>
                ))}
              </select>
              <div className="help-text">
                {trackedAccounts.length === 0
                  ? 'No bank accounts yet — add one under Accounts, then upload again.'
                  : `The statement calls it “${extraction.account_label ?? 'unlabelled'}”.`}
              </div>
            </div>
            {extraction.balanceCheck && (
              <div className={`cf-reconcile ${reconciles ? 'ok' : 'bad'}`}>
                {reconciles ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <div>
                  <strong>{reconciles ? 'Balances match' : `${formatCurrency(Math.abs(extraction.balanceCheck.gap))} doesn't add up`}</strong>
                  <div>{reconciles ? 'Every line adds up to the closing balance' : 'against the statement’s closing balance'}</div>
                </div>
              </div>
            )}
          </div>

          <div className="cf-review-stats">
            <span>
              <strong>{active.length}</strong> transactions
            </span>
            <span className="amount-in">
              In <strong>{formatCurrency(total('income'))}</strong>
            </span>
            <span>
              Out <strong>{formatCurrency(total('expense'))}</strong>
            </span>
            {removedCount > 0 && <span className="muted">{removedCount} removed</span>}
          </div>

          <div className={`cf-checks ${checksOpen ? 'open' : ''}`}>
            <button type="button" className="cf-checks-toggle" onClick={() => setChecksOpen((v) => !v)} aria-expanded={checksOpen}>
              {checksOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {attentionCount > 0 ? (
                <>
                  <AlertTriangle size={14} className="cf-checks-icon" />
                  {attentionCount} thing{attentionCount === 1 ? '' : 's'} to check
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} className="cf-checks-icon ok" />
                  Nothing unusual found
                </>
              )}
            </button>
            {checksOpen && (
              <div className="cf-checks-list">
                {checks.map((c) => {
                  const Icon = c.icon
                  return (
                    <div key={c.key} className={`cf-check ${c.tone}`}>
                      <Icon size={14} />
                      <div className="cf-check-body">{c.body}</div>
                      {c.action}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="segmented small" role="group" aria-label="Show rows" style={{ flexWrap: 'wrap' }}>
            {(
              [
                ['all', 'All', null],
                ['flagged', 'Flagged', flaggedCount],
                ['low_confidence', 'Unsure', lowConfidenceCount],
                ['uncategorized', 'Uncategorized', uncategorizedCount],
                ['transfer', 'Transfers', transferCount]
              ] as [FilterMode, string, number | null][]
            ).map(([mode, label, count]) => (
              <button key={mode} type="button" aria-pressed={filter === mode} onClick={() => setFilter(mode)}>
                {label}
                {count !== null && <span className="segmented-count">{count}</span>}
              </button>
            ))}
          </div>

          <div className="card cf-review-list">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }}>
                    <span className="sr-only">Confidence</span>
                  </th>
                  <th>Transaction</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th style={{ width: 72 }}>
                    <span className="sr-only">Actions</span>
                  </th>
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
                {visibleIndices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Nothing in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <button type="button" className="cf-link-btn" style={{ marginTop: 'var(--space-3)' }} onClick={addTxn}>
            <Plus size={12} /> Add a missing transaction
          </button>
        </div>

        <footer className="sheet-footer">
          {error ? (
            <div className="cf-sheet-error" role="alert">
              <AlertTriangle size={14} /> {error}
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              {needsCardWarning ? 'Confirm the statement type above to continue.' : 'Nothing is saved until you click Save.'}
            </span>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn secondary" onClick={cancel} disabled={busy}>
              Cancel
            </button>
            <button className="btn" onClick={submit} disabled={busy || needsCardWarning}>
              {busy ? 'Saving…' : `Save ${destinationLabel}`}
            </button>
          </div>
        </footer>
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

const CONFIDENCE: Record<EditableRow['confidence'], { color: string; label: string }> = {
  high: { color: 'transparent', label: 'AI is confident about this line' },
  medium: { color: 'var(--amber)', label: 'AI is fairly sure — worth a glance' },
  low: { color: 'var(--red)', label: 'AI is unsure — check this against the statement' }
}

// Memoized so editing one row doesn't re-render every other row in a 100+ row
// statement — safe because `transactions[i]`'s object reference only changes for
// the row actually touched (see updateTxn's functional setState), and onUpdate/
// onRemove/onRestore are stable (useCallback, no closed-over state).
// Reads as a plain line until clicked; a row with a problem opens itself.
const ReviewRow = memo(function ReviewRow({ index, row, error, onUpdate, onRemove, onRestore }: RowProps): JSX.Element {
  const [editing, setEditing] = useState(row.description === '')
  const open = editing || error !== null

  if (row.removed) {
    return (
      <tr className="cf-review-removed">
        <td />
        <td>
          <div className="cf-row-title">{row.description}</div>
          <div className="cf-row-meta">{formatDate(row.txn_date)} · removed</div>
        </td>
        <td />
        <td className="num">{row.amountText}</td>
        <td style={{ textAlign: 'right' }}>
          <button type="button" className="icon-btn" onClick={() => onRestore(index)} title="Put back" aria-label="Put back">
            <RotateCcw size={14} />
          </button>
        </td>
      </tr>
    )
  }

  const amount = parseIndianAmount(row.amountText)
  const conf = CONFIDENCE[row.confidence]
  const flagged = row.possibleDuplicate || row.isOutlier || row.possibleCardBillDouble

  return (
    <>
      <tr
        className={`cf-row ${flagged ? 'cf-review-flagged' : ''} ${error ? 'cf-review-error' : ''}`}
        onClick={() => setEditing((v) => !v)}
      >
        <td>
          {row.confidence !== 'high' && (
            <span className="cf-conf-dot" style={{ background: conf.color }} title={conf.label} aria-label={conf.label} role="img" />
          )}
        </td>
        <td className="cf-row-main">
          <div className="cf-row-title">
            {row.description || <span className="muted">New transaction</span>}
            {row.possibleDuplicate && (
              <span title="Possible duplicate of an existing transaction" className="cf-flag warn">
                <Copy size={12} aria-label="Possible duplicate" />
              </span>
            )}
            {row.isOutlier && (
              <span title="Unusually large amount for this statement" className="cf-flag bad">
                <AlertTriangle size={12} aria-label="Unusually large" />
              </span>
            )}
            {row.possibleCardBillDouble && (
              <span title="Looks like a card bill payment — possible double count" className="cf-flag warn">
                <CreditCard size={12} aria-label="Possible card bill" />
              </span>
            )}
          </div>
          <div className="cf-row-meta" title={row.raw_text ?? undefined}>
            {formatDateShort(row.txn_date)}
            {row.raw_text && row.raw_text !== row.description ? ` · ${row.raw_text}` : ''}
          </div>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <CashFlowCategoryPicker
            direction={row.direction}
            value={{ category: row.category, subcategory: row.subcategory || null }}
            onChange={(next) => onUpdate(index, { category: next.category, subcategory: next.subcategory ?? '' })}
          />
        </td>
        <td className={`num ${!countsTowardPnl(row.category) ? 'amount-muted' : row.direction === 'income' ? 'amount-in' : 'amount-out'}`}>
          {amount === null ? (
            <span style={{ color: 'var(--red)' }}>—</span>
          ) : (
            <>
              {row.direction === 'income' ? '+' : '−'}
              {formatCurrency(amount)}
            </>
          )}
          {row.currency !== 'INR' && <div className="cf-row-meta">{row.currency}</div>}
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setEditing((v) => !v)}
            title={open ? 'Done editing' : 'Edit'}
            aria-label={open ? 'Done editing' : 'Edit'}
            aria-expanded={open}
          >
            <Pencil size={14} />
          </button>
          <button type="button" className="icon-btn" onClick={() => onRemove(index)} title="Leave this line out" aria-label="Leave this line out">
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="cf-review-editor">
          <td />
          <td colSpan={4}>
            <div className="cf-review-fields">
              <label>
                Date
                <input
                  type="date"
                  value={row.txn_date}
                  className={!isValidIsoDate(row.txn_date) ? 'cf-invalid' : undefined}
                  onChange={(e) => onUpdate(index, { txn_date: e.target.value })}
                />
              </label>
              <label className="cf-review-desc">
                Description
                <input
                  value={row.description}
                  placeholder="What was it?"
                  onChange={(e) => onUpdate(index, { description: e.target.value })}
                  className={!row.description.trim() ? 'cf-invalid' : undefined}
                  autoFocus={row.description === ''}
                />
              </label>
              <label>
                In or out
                <select
                  value={row.direction}
                  onChange={(e) => {
                    const direction = e.target.value as CashFlowDirection
                    // Keep the category if it exists on the other side; otherwise
                    // re-derive it from the name (or fall back to the catch-all).
                    const keeps = categoriesFor(direction, 'short').some((c) => c.value === row.category)
                    onUpdate(index, {
                      direction,
                      category: keeps ? row.category : defaultCategoryFor(row.subcategory, direction)
                    })
                  }}
                >
                  <option value="income">Money in</option>
                  <option value="expense">Money out</option>
                </select>
              </label>
              <label>
                Amount
                <input
                  value={row.amountText}
                  placeholder="e.g. 1,250"
                  onChange={(e) => onUpdate(index, { amountText: e.target.value })}
                  className={amount === null || amount <= 0 ? 'cf-invalid' : undefined}
                />
              </label>
            </div>
            {error && <div className="cf-review-row-error">{error}</div>}
          </td>
        </tr>
      )}
    </>
  )
})
