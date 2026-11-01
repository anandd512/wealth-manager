import { api } from '../lib/api'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Upload,
  RefreshCw,
  Receipt,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Sparkles,
  Info,
  AlertTriangle
} from 'lucide-react'
import type {
  CashFlowTransaction,
  CashFlowDirection,
  CashFlowMonthSummary,
  CashFlowTrackedAccount,
  CashFlowStatementExtraction,
  CashFlowBudget,
  CashFlowSavingsGoal,
  CashFlowRecurringTemplate
} from '../../../shared/types'
import { formatCurrency, formatDate, formatMonthYear, todayLocalDateString } from '../lib/format'
import { friendlyError } from '../lib/friendlyError'
import { countsTowardPnl } from '../lib/cashFlowCategories'
import type { PeriodType } from '../lib/cashFlowPeriods'
import {
  fyRangeFor,
  quarterRangeFor,
  ytdRangeFor,
  monthRangeFor,
  shiftMonth,
  previousRangeFor,
  monthsInRange,
  periodPhrase,
  PERIOD_STEP_MONTHS
} from '../lib/cashFlowPeriods'
import CashFlowEntryModal from '../components/CashFlowEntryModal'
import CashFlowExtractionReviewModal from '../components/CashFlowExtractionReviewModal'
import CashFlowTrendChart from '../components/CashFlowTrendChart'
import CashFlowInsights from '../components/CashFlowInsights'
import CashFlowSpending from '../components/CashFlowSpending'
import CashFlowImportsModal from '../components/CashFlowImportsModal'
import CashFlowSummary, { type PeriodTotals } from '../components/CashFlowSummary'
import CashFlowAttention from '../components/CashFlowAttention'
import CashFlowOnboarding from '../components/CashFlowOnboarding'
import CashFlowFilterBar, {
  matchesFilters,
  hasActiveFilters,
  DEFAULT_FILTERS,
  type CashFlowFilters
} from '../components/CashFlowFilterBar'
import CashFlowTransactionList from '../components/CashFlowTransactionList'
import type { CategoryValue } from '../components/CashFlowCategoryPicker'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { useDecryptedUpload, isPasswordCancelled } from '../lib/useDecryptedUpload'

function currentMonth(): string {
  return todayLocalDateString().slice(0, 7)
}

// Today if adding to the current month, otherwise the 1st of whichever month is
// selected — a sensible default date to land on, always editable.
function defaultDateFor(month: string): string {
  return month === currentMonth() ? todayLocalDateString() : `${month}-01`
}

const SESSION_MONTH_KEY = 'cashflow.selectedMonth'
const INTRO_DISMISSED_KEY = 'artha_cashflow_intro_dismissed'

const PERIOD_TYPES: { value: PeriodType; label: string; title: string }[] = [
  { value: 'month', label: 'Month', title: 'One calendar month' },
  { value: 'quarter', label: 'Quarter', title: 'Calendar quarter (Jan–Mar, Apr–Jun, …)' },
  { value: 'fy', label: 'FY', title: 'Financial year — April to March' },
  { value: 'ytd', label: 'YTD', title: 'Year to date — 1 January to today' },
  { value: 'custom', label: 'Custom', title: 'Pick your own start and end dates' }
]

function pnlTotals(rows: CashFlowTransaction[]): PeriodTotals {
  const totals: PeriodTotals = { income: 0, expense: 0, excludedIn: 0, excludedOut: 0 }
  for (const t of rows) {
    const counted = countsTowardPnl(t.category)
    if (t.direction === 'income') totals[counted ? 'income' : 'excludedIn'] += t.amount
    else totals[counted ? 'expense' : 'excludedOut'] += t.amount
  }
  return totals
}

interface ReviewDocument {
  path: string
  originalName: string | null
  fileHash: string
}

interface PendingDuplicate {
  decryptedPath: string
  importedAt: string
  transactionCount: number
}

export default function CashFlow(): JSX.Element {
  const { ensureDecrypted, modal: passwordModal } = useDecryptedUpload()
  const navigate = useNavigate()
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => sessionStorage.getItem(SESSION_MONTH_KEY) || currentMonth()
  )
  const [periodType, setPeriodType] = useState<PeriodType>('month')
  const [customStart, setCustomStart] = useState(defaultDateFor(currentMonth()))
  const [customEnd, setCustomEnd] = useState(todayLocalDateString())
  const [transactions, setTransactions] = useState<CashFlowTransaction[]>([])
  // The period just before the one on screen (null for custom ranges) — every
  // "vs …" figure compares against this, like-for-like.
  const [prevTransactions, setPrevTransactions] = useState<CashFlowTransaction[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summary, setSummary] = useState<CashFlowMonthSummary[]>([])
  const [trackedAccounts, setTrackedAccounts] = useState<CashFlowTrackedAccount[]>([])
  const [missingStatements, setMissingStatements] = useState<string[]>([])
  const [budgets, setBudgets] = useState<CashFlowBudget[]>([])
  const [savingsGoal, setSavingsGoal] = useState<CashFlowSavingsGoal>({ monthlyTarget: null })
  const [recurringDue, setRecurringDue] = useState<CashFlowRecurringTemplate[]>([])
  const [hasSampleData, setHasSampleData] = useState(false)
  const [sampleBusy, setSampleBusy] = useState(false)
  const [showIntro, setShowIntro] = useState(() => localStorage.getItem(INTRO_DISMISSED_KEY) !== '1')

  const [filters, setFilters] = useState<CashFlowFilters>(DEFAULT_FILTERS)
  // First-load flags: until both land, the page shows skeletons rather than ₹0
  // cards and "no transactions" messages that are about to be wrong.
  const [sharedLoaded, setSharedLoaded] = useState(false)
  const [periodLoaded, setPeriodLoaded] = useState(false)
  // Why "Import bank statement" can't proceed yet, with a link to fix it — shown
  // instead of a disabled button whose only explanation is a hover tooltip.
  const [setupIssue, setSetupIssue] = useState<'no_accounts' | 'no_ai' | null>(null)

  const [modalDirection, setModalDirection] = useState<CashFlowDirection | null>(null)
  const [editingTxn, setEditingTxn] = useState<CashFlowTransaction | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CashFlowTransaction | null>(null)
  const [pendingBulkDelete, setPendingBulkDelete] = useState<{ rows: CashFlowTransaction[]; clear: () => void } | null>(null)
  const [showImportsModal, setShowImportsModal] = useState(false)
  const [recentlyDeleted, setRecentlyDeleted] = useState<{ ids: number[]; label: string } | null>(null)

  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState<{ completed: number; total: number } | null>(null)
  const extractCancelledRef = useRef(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [reviewExtraction, setReviewExtraction] = useState<CashFlowStatementExtraction | null>(null)
  const [reviewDocument, setReviewDocument] = useState<ReviewDocument | null>(null)
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null)
  const [pendingConsent, setPendingConsent] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<string[]>([])

  const loadShared = async (): Promise<void> => {
    const [m, s, accs, b, goal] = await Promise.all([
      api().cashFlow.months(),
      api().cashFlow.summary(),
      api().cashFlow.trackedAccounts(),
      api().cashFlow.getBudgets(),
      api().cashFlow.getSavingsGoal()
    ])
    setMonths(m)
    setSummary(s)
    setTrackedAccounts(accs)
    setBudgets(b)
    setSavingsGoal(goal)
    setSharedLoaded(true)
  }

  const currentRange = useMemo(() => {
    if (periodType === 'month') return monthRangeFor(selectedMonth)
    if (periodType === 'quarter') return quarterRangeFor(`${selectedMonth}-01`)
    if (periodType === 'fy') return fyRangeFor(`${selectedMonth}-01`)
    if (periodType === 'ytd') return ytdRangeFor(todayLocalDateString())
    return { start: customStart, end: customEnd, label: 'Custom range' }
  }, [periodType, selectedMonth, customStart, customEnd])

  const previous = previousRangeFor(periodType, selectedMonth, todayLocalDateString())

  const fetchPeriod = async (): Promise<{ rows: CashFlowTransaction[]; prevRows: CashFlowTransaction[] | null }> => {
    const [rows, prevRows] = await Promise.all([
      periodType === 'month'
        ? api().cashFlow.list(selectedMonth)
        : api().cashFlow.listRange(currentRange.start, currentRange.end),
      previous ? api().cashFlow.listRange(previous.range.start, previous.range.end) : Promise.resolve(null)
    ])
    return { rows, prevRows }
  }

  const loadPeriod = async (isStale: () => boolean = () => false): Promise<void> => {
    setLoadError(null)
    try {
      const { rows, prevRows } = await fetchPeriod()
      if (isStale()) return
      setTransactions(rows)
      setPrevTransactions(prevRows)
    } catch (e) {
      if (!isStale()) setLoadError(friendlyError(e))
    } finally {
      if (!isStale()) setPeriodLoaded(true)
    }
  }

  const loadExtras = async (): Promise<void> => {
    try {
      const [missing, due, sample] = await Promise.all([
        api().cashFlow.missingStatements(selectedMonth),
        api().cashFlow.recurringDue(selectedMonth),
        api().cashFlow.hasSampleData()
      ])
      setMissingStatements(missing)
      setRecurringDue(due)
      setHasSampleData(sample.hasSampleData)
    } catch {
      // non-critical — leave previous values rather than erroring the whole page
    }
  }

  useEffect(() => {
    loadShared()
  }, [])

  // Recomputes "the current month" when the window regains focus (#17) — the app
  // can sit open across a month boundary, and monthOptions below (built fresh every
  // render from currentMonth()) would otherwise show a stale "current" month until
  // something else happened to trigger a re-render. `focusTick` exists purely to
  // force that re-render; nothing reads its value.
  const [, setFocusTick] = useState(0)
  useEffect(() => {
    const onFocus = (): void => setFocusTick((n) => n + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    sessionStorage.setItem(SESSION_MONTH_KEY, selectedMonth)
  }, [selectedMonth])

  // Request-id guard (#16): if the user flips through months quickly, an older
  // in-flight response landing after a newer one would otherwise show stale data.
  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      await loadPeriod(() => cancelled)
      if (cancelled) return
      await loadExtras()
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, periodType, customStart, customEnd])

  const reloadAll = async (): Promise<void> => {
    await Promise.all([loadShared(), loadPeriod(), loadExtras()])
  }

  const accountName = (syncId: string | null): string => {
    if (!syncId) return '—'
    return trackedAccounts.find((a) => a.sync_id === syncId)?.name ?? '(account closed)'
  }

  // The transaction list's selection and paging reset whenever this changes.
  const listKey = `${currentRange.start}:${currentRange.end}`

  const filtered = transactions.filter((t) => matchesFilters(t, filters))
  const uncategorizedCount = transactions.filter((t) => !t.category).length
  // "Review" in the attention strip drives the same filter as the filter bar's
  // Uncategorized option, so the two can never disagree about what's shown.
  const reviewingUncategorized = filters.category === 'uncategorized'
  const transactionsRef = useRef<HTMLDivElement>(null)
  const toggleUncategorizedReview = (): void => {
    setFilters((f) => ({ ...f, category: f.category === 'uncategorized' ? '' : 'uncategorized' }))
    if (!reviewingUncategorized) transactionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const totals = pnlTotals(transactions)

  // Only compared when the previous period actually has data — "+₹72,000 vs last
  // quarter" against an empty quarter is noise, not insight.
  const prevTotals = prevTransactions && prevTransactions.length > 0 ? pnlTotals(prevTransactions) : null
  const periodMonths = monthsInRange(periodType, currentRange)

  // A running total only makes sense for one account with both directions shown (#20).
  const showRunningTotal = filters.accountSyncId !== '' && filters.direction === 'all'

  const remove = (t: CashFlowTransaction): void => setPendingDelete(t)

  const offerUndo = (ids: number[], label: string): void => {
    const entry = { ids, label }
    setRecentlyDeleted(entry)
    setTimeout(() => setRecentlyDeleted((cur) => (cur === entry ? null : cur)), 8000)
  }

  const confirmRemove = async (): Promise<void> => {
    if (!pendingDelete) return
    const { id, description } = pendingDelete
    setPendingDelete(null)
    await api().cashFlow.remove(id)
    offerUndo([id], `"${description}"`)
    reloadAll()
  }

  const undoDelete = async (): Promise<void> => {
    if (!recentlyDeleted) return
    await Promise.all(recentlyDeleted.ids.map((id) => api().cashFlow.restore(id)))
    setRecentlyDeleted(null)
    reloadAll()
  }

  // Always sends the subcategory along — passing null here used to wipe a
  // transaction's subcategory whenever only its category was changed.
  const setCategory = async (id: number, next: CategoryValue): Promise<void> => {
    await api().cashFlow.updateCategory(id, next.category, next.subcategory)
    reloadAll()
  }

  const saveGoal = async (monthlyTarget: number | null): Promise<void> => {
    const goal = { monthlyTarget }
    await api().cashFlow.setSavingsGoal(goal)
    setSavingsGoal(goal)
  }

  const bulkCategorize = async (ids: number[], next: CategoryValue): Promise<void> => {
    if (ids.length === 0) return
    await api().cashFlow.bulkUpdateCategory(ids, next.category, next.subcategory)
    reloadAll()
  }

  const confirmBulkDelete = async (): Promise<void> => {
    if (!pendingBulkDelete) return
    const { rows, clear } = pendingBulkDelete
    setPendingBulkDelete(null)
    const ids = rows.map((r) => r.id)
    await api().cashFlow.bulkRemove(ids)
    clear()
    offerUndo(ids, `${ids.length} transaction${ids.length === 1 ? '' : 's'}`)
    reloadAll()
  }

  const filtersActive = hasActiveFilters(filters)

  // Exports exactly what's on screen: the selected period, and only the filtered
  // rows when a filter is active.
  const exportCsv = async (): Promise<void> => {
    const label = periodType === 'month' ? selectedMonth : `${currentRange.start}-to-${currentRange.end}`
    await api().cashFlow.exportCsv({
      start: currentRange.start,
      end: currentRange.end,
      label,
      ids: filtersActive ? filtered.map((t) => t.id) : undefined
    })
  }

  const generateSample = async (): Promise<void> => {
    setSampleBusy(true)
    try {
      await api().cashFlow.generateSampleData()
      await reloadAll()
    } finally {
      setSampleBusy(false)
    }
  }

  const removeSample = async (): Promise<void> => {
    setSampleBusy(true)
    try {
      await api().cashFlow.removeSampleData()
      await reloadAll()
    } finally {
      setSampleBusy(false)
    }
  }

  // --- Upload flow ---

  const runExtraction = async (decryptedPath: string, force: boolean): Promise<void> => {
    setExtracting(true)
    setExtractProgress(null)
    extractCancelledRef.current = false
    // Real per-chunk progress (not a fabricated animation) — only multi-chunk
    // statements report anything, since a single call has no meaningful midpoint.
    const unsubscribe = api().cashFlow.onExtractionProgress(({ completed, total }) => {
      if (!extractCancelledRef.current) setExtractProgress({ completed, total })
    })
    try {
      const result = await api().cashFlow.extractStatement(decryptedPath, force)
      // "Cancel" during extraction (#64) can't abort the in-flight AI call itself —
      // it discards the result instead, which is the part the user actually cares
      // about (not being forced to review something they backed out of). A ref
      // (not state) because this check runs after an await, where a React state
      // closure would still see the value from when the call started, not any
      // update made while it was in flight.
      if (extractCancelledRef.current) return
      if (result.duplicate) {
        setPendingDuplicate({ decryptedPath, importedAt: result.importedAt, transactionCount: result.transactionCount })
        return
      }
      setReviewExtraction(result.extraction)
      setReviewDocument({ path: result.storedPath, originalName: result.originalName, fileHash: result.fileHash })
    } catch (e) {
      if (!extractCancelledRef.current) setExtractError(friendlyError(e))
    } finally {
      unsubscribe()
      setExtracting(false)
      setExtractProgress(null)
      processNextInQueue()
    }
  }

  const processNextInQueue = (): void => {
    setUploadQueue((prev) => {
      if (prev.length === 0) return prev
      const [next, ...rest] = prev
      runExtraction(next, false)
      return rest
    })
  }

  const pickAndExtract = async (): Promise<void> => {
    const paths = await api().cashFlow.pickStatement()
    if (paths.length === 0) return
    try {
      const allImages = paths.every((p) => /\.(png|jpe?g|webp)$/i.test(p))
      if (paths.length > 1 && allImages && paths.every((p) => /\.jpe?g$/i.test(p))) {
        // Several photos of pages of ONE statement — combine into a single PDF so
        // the rest of the flow (hash/store/extract) runs exactly once (#71).
        const combinedPath = await api().cashFlow.combineImages(paths)
        await runExtraction(combinedPath, false)
        return
      }
      // Several separate statement files — queue them, one review per file (#66).
      const decrypted = await Promise.all(paths.map((p) => ensureDecrypted(p)))
      const [first, ...rest] = decrypted
      setUploadQueue(rest)
      await runExtraction(first, false)
    } catch (e) {
      // User dismissed the password prompt on purpose — not worth an error banner (#69).
      if (!isPasswordCancelled(e)) setExtractError(friendlyError(e))
    }
  }

  const cancelExtraction = (): void => {
    extractCancelledRef.current = true
    setExtracting(false)
    setUploadQueue([])
  }

  const uploadStatement = async (): Promise<void> => {
    setExtractError(null)
    setSetupIssue(null)
    if (trackedAccounts.length === 0) {
      setSetupIssue('no_accounts')
      return
    }
    const appSettings = await api().settings.get()
    const providerConfigured =
      appSettings.extractionProvider === 'anthropic' ? appSettings.hasAnthropicKey : appSettings.hasOpenAiKey
    if (!providerConfigured) {
      setSetupIssue('no_ai')
      return
    }
    const consent = await api().cashFlow.consentStatus()
    if (!consent.given) {
      setPendingConsent(true)
      return
    }
    await pickAndExtract()
  }

  const confirmConsent = async (): Promise<void> => {
    setPendingConsent(false)
    await api().cashFlow.setConsent()
    await pickAndExtract()
  }

  // Months with data plus the current month, so there's always something sensible to
  // land on even before any transactions exist.
  // selectedMonth is always included (the arrows can land on a month with no data),
  // otherwise the <select> would show a different month than the one loaded.
  const monthOptions = Array.from(new Set([currentMonth(), selectedMonth, ...months]))
    .filter((m) => m <= currentMonth())
    .sort()
    .reverse()

  const openAdd = (direction: CashFlowDirection): void => {
    setEditingTxn(null)
    setModalDirection(direction)
  }

  // No data anywhere — the whole page becomes the onboarding panel.
  const isEmpty = sharedLoaded && periodLoaded && months.length === 0 && transactions.length === 0
  // The breakdown chart renders nothing without counted expenses, so its card
  // shouldn't render either (it used to leave an empty titled card).
  const hasCountedExpenses = transactions.some((t) => t.direction === 'expense' && countsTowardPnl(t.category))

  // Arrows step by the period's own length (a month, a quarter, a FY) and stop at
  // the period containing today — there's nothing to see in the future.
  const step = PERIOD_STEP_MONTHS[periodType]
  const canStepForward = step !== null && currentRange.end < todayLocalDateString()
  const stepPeriod = (direction: -1 | 1): void => {
    if (step === null) return
    if (direction === 1 && !canStepForward) return
    setSelectedMonth(shiftMonth(selectedMonth, direction * step))
  }

  const stepNoun = periodType === 'fy' ? 'FY' : periodType

  return (
    <div>
      <div className="cf-header">
        <div>
          <h1 className="page-title">Cash Flow</h1>
          {!isEmpty && (
            <div className="cf-header-sub">
              {formatDate(currentRange.start)} – {formatDate(currentRange.end)}
            </div>
          )}
        </div>
        {!isEmpty && (
          <div className="cf-header-controls">
            {step !== null && (
              <div className="cf-period-nav">
                <button className="icon-btn" onClick={() => stepPeriod(-1)} title={`Previous ${stepNoun}`} aria-label={`Previous ${stepNoun}`}>
                  <ChevronLeft size={16} />
                </button>
                {periodType === 'month' ? (
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} aria-label="Month">
                    {monthOptions.map((m) => (
                      <option key={m} value={m}>
                        {formatMonthYear(m)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="cf-period-label">{currentRange.label}</span>
                )}
                <button
                  className="icon-btn"
                  onClick={() => stepPeriod(1)}
                  disabled={!canStepForward}
                  title={`Next ${stepNoun}`}
                  aria-label={`Next ${stepNoun}`}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <div className="segmented" role="group" aria-label="Period">
              {PERIOD_TYPES.map((p) => (
                <button key={p.value} type="button" title={p.title} aria-pressed={periodType === p.value} onClick={() => setPeriodType(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
            <ActionMenu
              ariaLabel="More actions"
              items={[
                { icon: Receipt, label: 'Uploaded statements', onClick: () => setShowImportsModal(true) },
                {
                  icon: Download,
                  label: filtersActive ? 'Export filtered rows (CSV)' : 'Export this period (CSV)',
                  onClick: () => void exportCsv()
                },
                ...(hasSampleData
                  ? [{ icon: Trash2, label: 'Remove sample data', danger: true, onClick: () => void removeSample() }]
                  : [])
              ]}
            />
            <ActionMenu
              triggerClassName="btn"
              trigger={
                <>
                  <Plus size={14} /> Add <ChevronDown size={13} />
                </>
              }
              items={[
                { icon: ArrowDownLeft, label: 'Add income', hint: 'Salary, interest, a refund…', onClick: () => openAdd('income') },
                { icon: ArrowUpRight, label: 'Add expense', hint: 'A bill, groceries, a cash spend…', onClick: () => openAdd('expense') },
                {
                  icon: Upload,
                  label: extracting ? 'Reading a statement…' : 'Import bank statement',
                  hint: 'PDF, CSV or a photo — AI reads every transaction for you to review',
                  onClick: () => {
                    if (!extracting) void uploadStatement()
                  }
                }
              ]}
            />
          </div>
        )}
      </div>

      {periodType === 'custom' && !isEmpty && (
        <div className="cf-custom-range">
          <span className="muted">From</span>
          <input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} aria-label="Start date" />
          <span className="muted">to</span>
          <input type="date" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} aria-label="End date" />
        </div>
      )}

      {setupIssue && (
        <div className="notice warn section" role="alert">
          <AlertTriangle />
          <div className="notice-body">
            {setupIssue === 'no_accounts'
              ? 'Add your bank account first — each statement is filed under the account it belongs to.'
              : 'Connect an AI provider to read statements — add an Anthropic or OpenAI key in Settings.'}
          </div>
          <div className="notice-actions">
            <button className="btn small" onClick={() => navigate(setupIssue === 'no_accounts' ? '/accounts' : '/settings')}>
              {setupIssue === 'no_accounts' ? 'Go to Accounts' : 'Open Settings'}
            </button>
            <button className="icon-btn" onClick={() => setSetupIssue(null)} title="Dismiss" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {hasSampleData && !isEmpty && (
        <div className="notice info section">
          <Sparkles />
          <div className="notice-body">
            You&apos;re looking at sample data. Remove it before adding your own so the two don&apos;t mix.
          </div>
          <div className="notice-actions">
            <button className="btn secondary small" onClick={removeSample} disabled={sampleBusy}>
              {sampleBusy ? 'Removing…' : 'Remove sample data'}
            </button>
          </div>
        </div>
      )}

      {showIntro && !isEmpty && !hasSampleData && (
        <div className="notice info section">
          <Info />
          <div className="notice-body">
            Transfers between your own accounts and reimbursements are tracked but don&apos;t count as money in or out —
            so your totals reflect what you actually earned and spent.
          </div>
          <button
            className="icon-btn"
            title="Dismiss"
            aria-label="Dismiss"
            onClick={() => {
              setShowIntro(false)
              localStorage.setItem(INTRO_DISMISSED_KEY, '1')
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {extractError && (
        <div className="notice error section" role="alert">
          <AlertTriangle />
          <div className="notice-body">{extractError}</div>
          <button className="icon-btn" onClick={() => setExtractError(null)} title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
      {loadError && (
        <div className="notice error section" role="alert">
          <AlertTriangle />
          <div className="notice-body">{loadError}</div>
          <div className="notice-actions">
            <button className="btn secondary small" onClick={() => loadPeriod()}>Retry</button>
          </div>
        </div>
      )}

      {/* Background progress and undo float over the page rather than pushing it down. */}
      <div className="toast-region" aria-live="polite">
        {extracting && (
          <div className="toast">
            <RefreshCw className="spin" />
            <div className="toast-body">
              {extractProgress && extractProgress.total > 1
                ? `Reading statement… ${Math.round((extractProgress.completed / extractProgress.total) * 100)}%`
                : 'Your AI provider is reading the statement…'}
              {(uploadQueue.length > 0 || (extractProgress && extractProgress.total > 1)) && (
                <div className="toast-sub">
                  {extractProgress && extractProgress.total > 1 && `Part ${extractProgress.completed} of ${extractProgress.total}`}
                  {extractProgress && extractProgress.total > 1 && uploadQueue.length > 0 && ' · '}
                  {uploadQueue.length > 0 && `${uploadQueue.length} more statement${uploadQueue.length === 1 ? '' : 's'} queued`}
                </div>
              )}
            </div>
            <button className="btn secondary small" onClick={cancelExtraction}>
              Cancel
            </button>
            {extractProgress && extractProgress.total > 1 && (
              <div
                className="toast-progress"
                style={{ width: `${Math.round((extractProgress.completed / extractProgress.total) * 100)}%` }}
              />
            )}
          </div>
        )}
        {recentlyDeleted && (
          // keyed so the countdown restarts when a second delete replaces the first
          <div className="toast" key={recentlyDeleted.ids.join(',')}>
            <Trash2 />
            <div className="toast-body">Deleted {recentlyDeleted.label}</div>
            <button className="btn secondary small" onClick={undoDelete}>
              Undo
            </button>
            <div className="toast-countdown" />
          </div>
        )}
      </div>

      {isEmpty ? (
        <CashFlowOnboarding
          onImport={() => void uploadStatement()}
          onAddManually={() => openAdd('expense')}
          onTrySample={() => void generateSample()}
          sampleBusy={sampleBusy}
        />
      ) : (
        <>
          <CashFlowAttention
            uncategorizedCount={uncategorizedCount}
            reviewingUncategorized={reviewingUncategorized}
            onToggleUncategorized={toggleUncategorizedReview}
            recurringDue={recurringDue}
            month={selectedMonth}
            onRecurringHandled={() => void reloadAll()}
            missingStatements={periodType === 'month' ? missingStatements : []}
            onImport={() => void uploadStatement()}
          />

          <CashFlowSummary
            current={periodLoaded ? totals : null}
            previous={prevTotals}
            comparisonLabel={previous?.label ?? null}
            monthlyGoal={savingsGoal.monthlyTarget}
            periodMonths={periodMonths}
            onGoalChange={saveGoal}
          />

          {periodLoaded && (
            <CashFlowInsights
              transactions={transactions}
              prevTransactions={prevTransactions}
              comparisonLabel={previous?.label ?? null}
              periodPhrase={periodPhrase(periodType)}
            />
          )}

          {(summary.length > 0 || hasCountedExpenses || budgets.length > 0) && (
            <div className="cf-two-up">
              {summary.length > 0 && (
                <div className="card">
                  <div className="section-header">
                    <h2>Month by month</h2>
                  </div>
                  <CashFlowTrendChart
                    summary={summary}
                    highlight={currentRange}
                    onMonthClick={(m) => {
                      setPeriodType('month')
                      setSelectedMonth(m)
                    }}
                  />
                </div>
              )}
              {(hasCountedExpenses || budgets.length > 0) && (
                <div className="card">
                  <div className="section-header">
                    <h2>Where the money went</h2>
                  </div>
                  <CashFlowSpending
                    transactions={transactions}
                    budgets={budgets}
                    periodMonths={periodMonths}
                    onBudgetsChanged={setBudgets}
                  />
                </div>
              )}
            </div>
          )}

          <div className="section" ref={transactionsRef} style={{ scrollMarginTop: 'var(--space-4)' }}>
            <div className="cf-section-head">
              <h2>Transactions</h2>
            </div>

            <CashFlowFilterBar filters={filters} onChange={setFilters} trackedAccounts={trackedAccounts} />

            {!periodLoaded ? (
              <div className="card" aria-busy="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 14, margin: '10px 0', width: `${90 - i * 8}%` }} />
                ))}
              </div>
            ) : (
              <CashFlowTransactionList
                key={listKey}
                rows={filtered}
                trackedAccounts={trackedAccounts}
                filtersActive={filtersActive}
                showRunningTotal={showRunningTotal}
                onClearFilters={() => setFilters(DEFAULT_FILTERS)}
                onEdit={(t) => {
                  setEditingTxn(t)
                  setModalDirection(t.direction)
                }}
                onDelete={remove}
                onSetCategory={(id, next) => void setCategory(id, next)}
                onBulkCategorize={bulkCategorize}
                onBulkDelete={(rows, clear) => setPendingBulkDelete({ rows, clear })}
              />
            )}
          </div>
        </>
      )}

      {modalDirection && (
        <CashFlowEntryModal
          direction={modalDirection}
          entry={editingTxn}
          trackedAccounts={trackedAccounts}
          defaultDate={defaultDateFor(selectedMonth)}
          onClose={() => setModalDirection(null)}
          onSaved={() => { setModalDirection(null); reloadAll() }}
        />
      )}

      {reviewExtraction && reviewDocument && (
        <CashFlowExtractionReviewModal
          extraction={reviewExtraction}
          trackedAccounts={trackedAccounts}
          documentPath={reviewDocument.path}
          documentOriginalName={reviewDocument.originalName}
          fileHash={reviewDocument.fileHash}
          onClose={() => { setReviewExtraction(null); setReviewDocument(null) }}
          onSaved={() => { setReviewExtraction(null); setReviewDocument(null); reloadAll() }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete transaction"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.description}" (${formatDate(pendingDelete.txn_date)}, ${formatCurrency(pendingDelete.amount)}${pendingDelete.account_sync_id ? `, ${accountName(pendingDelete.account_sync_id)}` : ''})? You can undo this for a few seconds after.`
            : ''
        }
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingBulkDelete !== null}
        title={`Delete ${pendingBulkDelete?.rows.length ?? 0} transaction${pendingBulkDelete?.rows.length === 1 ? '' : 's'}`}
        message={
          pendingBulkDelete
            ? `Delete ${pendingBulkDelete.rows.length} selected transaction${pendingBulkDelete.rows.length === 1 ? '' : 's'} ` +
              `totalling ${formatCurrency(pendingBulkDelete.rows.reduce((sum, r) => sum + r.amount, 0))}? ` +
              'You can undo this for a few seconds after.'
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => void confirmBulkDelete()}
        onCancel={() => setPendingBulkDelete(null)}
      />

      <ConfirmDialog
        open={pendingDuplicate !== null}
        title="Already imported"
        message={
          pendingDuplicate
            ? `This file was already imported on ${formatDate(pendingDuplicate.importedAt)} with ${pendingDuplicate.transactionCount} transaction(s). Import it again?`
            : ''
        }
        confirmLabel="Import anyway"
        onConfirm={() => {
          const p = pendingDuplicate
          setPendingDuplicate(null)
          if (p) runExtraction(p.decryptedPath, true)
        }}
        onCancel={() => setPendingDuplicate(null)}
      />

      <ConfirmDialog
        open={pendingConsent}
        title="Send statement to AI?"
        message="This file will be sent to your configured AI provider (Anthropic or OpenAI, set in Settings) so it can be read. It isn't stored anywhere else by Artha — just processed to extract transactions, per that provider's standard API terms."
        confirmLabel="Continue"
        onConfirm={() => void confirmConsent()}
        onCancel={() => setPendingConsent(false)}
      />

      {passwordModal}

      {showImportsModal && (
        <CashFlowImportsModal
          trackedAccounts={trackedAccounts}
          onClose={() => setShowImportsModal(false)}
          onChanged={reloadAll}
        />
      )}
    </div>
  )
}
