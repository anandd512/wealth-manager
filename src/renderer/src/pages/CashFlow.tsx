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
  CashFlowCategory,
  CashFlowMonthSummary,
  CashFlowTrackedAccount,
  CashFlowStatementExtraction,
  CashFlowBudget,
  CashFlowSavingsGoal,
  CashFlowRecurringTemplate
} from '../../../shared/types'
import { formatCurrency, formatDate, formatDateShort, formatMonthYear, todayLocalDateString } from '../lib/format'
import { friendlyError } from '../lib/friendlyError'
import { categoriesFor, countsTowardPnl } from '../lib/cashFlowCategories'
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
import CashFlowBreakdownChart from '../components/CashFlowBreakdownChart'
import CashFlowInsights from '../components/CashFlowInsights'
import CashFlowBudgetCard from '../components/CashFlowBudgetCard'
import CashFlowImportsModal from '../components/CashFlowImportsModal'
import CashFlowSummary, { type PeriodTotals } from '../components/CashFlowSummary'
import CashFlowAttention from '../components/CashFlowAttention'
import CashFlowOnboarding from '../components/CashFlowOnboarding'
import CashFlowFilterBar, { matchesFilters, DEFAULT_FILTERS, type CashFlowFilters } from '../components/CashFlowFilterBar'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { ICON_EDIT, ICON_DELETE, ICON_VIEW, ICON_DOWNLOAD } from '../lib/actionIcons'
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
const PAGE_SIZE = 100

type SortKey = 'date' | 'amount' | 'description' | 'category'

// The bulk-category picker starts on '' (nothing chosen, Apply disabled) so a stray
// click can't wipe categories; clearing them is its own explicit option.
const BULK_CLEAR = '__clear__'

const PERIOD_TYPES: { value: PeriodType; label: string; title: string }[] = [
  { value: 'month', label: 'Month', title: 'One calendar month' },
  { value: 'quarter', label: 'Quarter', title: 'Calendar quarter (Jan–Mar, Apr–Jun, …)' },
  { value: 'fy', label: 'FY', title: 'Financial year — April to March' },
  { value: 'ytd', label: 'YTD', title: 'Year to date — 1 January to today' },
  { value: 'custom', label: 'Custom', title: 'Pick your own start and end dates' }
]
type BulkCategoryChoice = CashFlowCategory | '' | typeof BULK_CLEAR

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

  const [viewMode, setViewMode] = useState<'split' | 'all'>('split')
  const [filters, setFilters] = useState<CashFlowFilters>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
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

  // One selection per table — the "All" view gets its own rather than borrowing the
  // income set, which used to carry hidden expense ids into the split view's
  // "Delete N" action.
  const [selectedIncome, setSelectedIncome] = useState<Set<number>>(new Set())
  const [selectedExpense, setSelectedExpense] = useState<Set<number>>(new Set())
  const [selectedAll, setSelectedAll] = useState<Set<number>>(new Set())
  const [incomeBulkCategory, setIncomeBulkCategory] = useState<BulkCategoryChoice>('')
  const [expenseBulkCategory, setExpenseBulkCategory] = useState<BulkCategoryChoice>('')
  const [allBulkCategory, setAllBulkCategory] = useState<BulkCategoryChoice>('')

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

  // Any change to what's on screen drops the selection, so a bulk action can never
  // reach rows the user can no longer see.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
    setSelectedIncome(new Set())
    setSelectedExpense(new Set())
    setSelectedAll(new Set())
  }, [selectedMonth, periodType, customStart, customEnd, viewMode])

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

  const sortRows = (rows: CashFlowTransaction[]): CashFlowTransaction[] => {
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'date') cmp = a.txn_date.localeCompare(b.txn_date)
      else if (sortKey === 'amount') cmp = a.amount - b.amount
      else if (sortKey === 'description') cmp = a.description.localeCompare(b.description)
      else cmp = (a.category ?? '').localeCompare(b.category ?? '')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }

  const incomeRows = sortRows(filtered.filter((t) => t.direction === 'income'))
  const expenseRows = sortRows(filtered.filter((t) => t.direction === 'expense'))
  const allRows = sortRows(filtered).slice(0, visibleCount)
  const totals = pnlTotals(transactions)
  const netThisPeriod = totals.income - totals.expense

  // Only compared when the previous period actually has data — "+₹72,000 vs last
  // quarter" against an empty quarter is noise, not insight.
  const prevTotals = prevTransactions && prevTransactions.length > 0 ? pnlTotals(prevTransactions) : null
  const periodMonths = monthsInRange(periodType, currentRange)

  // Running balance only makes sense scoped to one account — shown in the unified
  // "All" view when a single account filter is active (#20).
  const runningBalances = useMemo(() => {
    if (viewMode !== 'all' || !filters.accountSyncId) return null
    const chronological = [...filtered].sort((a, b) => a.txn_date.localeCompare(b.txn_date) || a.id - b.id)
    const balances = new Map<number, number>()
    let running = 0
    for (const t of chronological) {
      running += t.direction === 'income' ? t.amount : -t.amount
      balances.set(t.id, running)
    }
    return balances
  }, [viewMode, filters.accountSyncId, filtered])

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

  const setCategory = async (id: number, category: CashFlowCategory | null): Promise<void> => {
    await api().cashFlow.updateCategory(id, category, null)
    reloadAll()
  }

  const toggleSelected = (set: Set<number>, setFn: (s: Set<number>) => void, id: number): void => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFn(next)
  }

  const bulkCategorize = async (ids: number[], choice: BulkCategoryChoice, clear: () => void): Promise<void> => {
    if (ids.length === 0 || choice === '') return
    await api().cashFlow.bulkUpdateCategory(ids, choice === BULK_CLEAR ? null : choice, null)
    clear()
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

  const filtersActive =
    filters.search !== '' ||
    filters.category !== '' ||
    filters.accountSyncId !== '' ||
    filters.source !== 'all'

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

  const renderEmptyRows = (noun: string): JSX.Element => (
    <div className="muted" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      {filtersActive ? (
        <>
          No {noun} match these filters.
          <button className="btn secondary small" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Clear filters
          </button>
        </>
      ) : (
        <>No {noun} in this period.</>
      )}
    </div>
  )

  // Arrows step by the period's own length (a month, a quarter, a FY) and stop at
  // the period containing today — there's nothing to see in the future.
  const step = PERIOD_STEP_MONTHS[periodType]
  const canStepForward = step !== null && currentRange.end < todayLocalDateString()
  const stepPeriod = (direction: -1 | 1): void => {
    if (step === null) return
    if (direction === 1 && !canStepForward) return
    setSelectedMonth(shiftMonth(selectedMonth, direction * step))
  }

  function renderTable(
    rows: CashFlowTransaction[],
    direction: CashFlowDirection | 'all',
    selected: Set<number>,
    setSelected: (s: Set<number>) => void,
    bulkCategory: BulkCategoryChoice,
    setBulkCategory: (c: BulkCategoryChoice) => void
  ): JSX.Element {
    // Bulk actions only ever touch rows that are actually on screen — a selection
    // made before a filter changed can't reach rows the filter now hides.
    const selectedRows = rows.filter((r) => selected.has(r.id))
    const selectedIds = selectedRows.map((r) => r.id)
    const clearSelection = (): void => setSelected(new Set())
    const allSelected = rows.length > 0 && selectedRows.length === rows.length
    // Footer totals use the same rule as the summary cards (transfers and
    // reimbursements don't count), so the two never disagree. Net for the "all"
    // view (income positive, expense negative); a plain sum for the split tables (#32).
    const signed = (r: CashFlowTransaction): number => (direction === 'all' && r.direction === 'expense' ? -r.amount : r.amount)
    const countedTotal = rows.filter((r) => countsTowardPnl(r.category)).reduce((sum, r) => sum + signed(r), 0)
    const notCountedTotal = rows.filter((r) => !countsTowardPnl(r.category)).reduce((sum, r) => sum + r.amount, 0)
    const sortHeader = (key: SortKey, label: string, className?: string): JSX.Element => (
      <th
        className={className}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => {
          if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
          else {
            setSortKey(key)
            setSortDir('desc')
          }
        }}
      >
        {label}
        {sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
    return (
      <>
        {selectedRows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--accent-soft)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{selectedRows.length} selected</span>
            {direction !== 'all' && (
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value as BulkCategoryChoice)}
                aria-label="Category for selected transactions"
              >
                <option value="" disabled>
                  Choose category…
                </option>
                {categoriesFor(direction, 'short').map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
                <option value={BULK_CLEAR}>Uncategorized (clear category)</option>
              </select>
            )}
            {direction !== 'all' && (
              <button
                className="btn secondary small"
                disabled={bulkCategory === ''}
                onClick={() =>
                  bulkCategorize(selectedIds, bulkCategory, () => {
                    clearSelection()
                    setBulkCategory('')
                  })
                }
              >
                Apply category
              </button>
            )}
            <button
              className="btn secondary small"
              style={{ color: 'var(--red)' }}
              onClick={() => setPendingBulkDelete({ rows: selectedRows, clear: clearSelection })}
            >
              <Trash2 size={13} /> Delete {selectedRows.length}
            </button>
            <button className="btn secondary small" onClick={clearSelection}>
              Clear
            </button>
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 24 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                {sortHeader('date', 'Date')}
                {sortHeader('description', 'Description')}
                {sortHeader('category', 'Category')}
                {sortHeader('amount', 'Amount', 'num')}
                {runningBalances && <th className="num">Balance</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.description}`}
                      checked={selected.has(t.id)}
                      onChange={() => toggleSelected(selected, setSelected, t.id)}
                    />
                  </td>
                  <td className="muted">{formatDateShort(t.txn_date)}</td>
                  <td>
                    {t.description}
                    {accountName(t.account_sync_id) !== '—' && (
                      <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                        ({accountName(t.account_sync_id)})
                      </span>
                    )}
                    {t.subcategory && (
                      <span className="badge neutral" style={{ marginLeft: 6 }}>
                        {t.subcategory}
                      </span>
                    )}
                    {t.entry_method === 'ai_extracted' && (
                      <span className="badge neutral" style={{ marginLeft: 6 }} title={t.document_original_name ? `From ${t.document_original_name}` : 'Read by AI from an uploaded statement'}>
                        AI
                      </span>
                    )}
                    {t.currency && (
                      <span className="badge neutral" style={{ marginLeft: 6 }} title={`Converted from ${t.amount_native} ${t.currency}`}>
                        {t.currency}
                      </span>
                    )}
                  </td>
                  <td>
                    <select
                      value={t.category ?? ''}
                      onChange={(e) => setCategory(t.id, (e.target.value || null) as CashFlowCategory | null)}
                      aria-label={`Category for ${t.description}`}
                    >
                      <option value="">Uncategorized</option>
                      {categoriesFor(t.direction, 'short').map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  {countsTowardPnl(t.category) ? (
                    <td className={`num ${t.direction === 'income' ? 'amount-in' : 'amount-out'}`}>
                      {t.direction === 'income' ? '+' : '−'}
                      {formatCurrency(t.amount)}
                    </td>
                  ) : (
                    <td className="num amount-muted" title="Not counted in income/expense totals (transfer or reimbursement)">
                      {t.direction === 'income' ? '+' : '−'}
                      {formatCurrency(t.amount)}
                    </td>
                  )}
                  {runningBalances && <td className="num muted">{formatCurrency(runningBalances.get(t.id) ?? 0)}</td>}
                  <td style={{ textAlign: 'right' }}>
                    <ActionMenu
                      items={[
                        { icon: ICON_EDIT, label: 'Edit', onClick: () => { setEditingTxn(t); setModalDirection(t.direction) } },
                        ...(t.document_path
                          ? [
                              { icon: ICON_VIEW, label: 'View statement', onClick: () => api().cashFlow.openDocument(t.document_path!) },
                              { icon: ICON_DOWNLOAD, label: 'Download statement', onClick: () => api().cashFlow.downloadDocument(t.document_path!, t.document_original_name) }
                            ]
                          : []),
                        // Deleting a whole import lives only in "Uploaded statements" —
                        // a many-row delete doesn't belong next to single-row Delete.
                        { icon: ICON_DELETE, label: 'Delete', danger: true, onClick: () => remove(t) }
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border)' }}>
                  <td></td>
                  <td colSpan={3}>
                    Total ({rows.length})
                    {notCountedTotal > 0 && (
                      <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
                        Excludes {formatCurrency(notCountedTotal)} in transfers/reimbursements
                      </div>
                    )}
                  </td>
                  <td className="num" style={direction === 'all' ? { color: countedTotal >= 0 ? 'var(--green)' : 'var(--red)' } : undefined}>
                    {formatCurrency(countedTotal)}
                  </td>
                  {runningBalances && <td></td>}
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </>
    )
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
            periodGoal={savingsGoal.monthlyTarget ? savingsGoal.monthlyTarget * periodMonths : null}
          />

          {(summary.length > 0 || hasCountedExpenses) && (
            <div className="cf-two-up">
              {summary.length > 0 && (
                <div className="card">
                  <div className="section-header">
                    <h2>Monthly trend</h2>
                  </div>
                  <CashFlowTrendChart
                    summary={summary}
                    onMonthClick={(m) => {
                      setPeriodType('month')
                      setSelectedMonth(m)
                    }}
                  />
                </div>
              )}
              {hasCountedExpenses && (
                <div className="card">
                  <div className="section-header">
                    <h2>Where the money went</h2>
                  </div>
                  <CashFlowBreakdownChart transactions={transactions} />
                </div>
              )}
            </div>
          )}

          <div className="cf-two-up">
            <CashFlowInsights
              transactions={transactions}
              previousExpenseTotal={prevTotals?.expense ?? null}
              comparisonLabel={previous?.label ?? null}
            />
            <CashFlowBudgetCard
              budgets={budgets}
              savingsGoal={savingsGoal}
              transactions={transactions}
              netThisPeriod={netThisPeriod}
              periodMonths={periodMonths}
              periodPhrase={periodPhrase(periodType)}
              onBudgetsChanged={setBudgets}
              onGoalChanged={setSavingsGoal}
            />
          </div>

          <div className="section" ref={transactionsRef} style={{ scrollMarginTop: 'var(--space-4)' }}>
            <div className="cf-section-head">
              <h2>Transactions</h2>
              <div className="segmented small" role="group" aria-label="Transaction view">
                <button type="button" aria-pressed={viewMode === 'split'} onClick={() => setViewMode('split')}>
                  Money in / out
                </button>
                <button type="button" aria-pressed={viewMode === 'all'} onClick={() => setViewMode('all')}>
                  All in one list
                </button>
              </div>
            </div>

            <CashFlowFilterBar filters={filters} onChange={setFilters} trackedAccounts={trackedAccounts} />

            {!periodLoaded ? (
              <div className="card" aria-busy="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 14, margin: '10px 0', width: `${90 - i * 8}%` }} />
                ))}
              </div>
            ) : viewMode === 'all' ? (
              <div className="card" style={{ padding: 0 }}>
                {allRows.length === 0 ? (
                  renderEmptyRows('transactions')
                ) : (
                  <>
                    {renderTable(allRows, 'all', selectedAll, setSelectedAll, allBulkCategory, setAllBulkCategory)}
                    {filtered.length > visibleCount && (
                      <div style={{ textAlign: 'center', padding: 'var(--space-3)' }}>
                        <button className="btn secondary small" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                          Load more ({filtered.length - visibleCount} remaining)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="card section" style={{ padding: 0 }}>
                  <div className="section-header" style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
                    <h2>Money in</h2>
                  </div>
                  {incomeRows.length === 0
                    ? renderEmptyRows('income')
                    : renderTable(incomeRows, 'income', selectedIncome, setSelectedIncome, incomeBulkCategory, setIncomeBulkCategory)}
                </div>

                <div className="card" style={{ padding: 0 }}>
                  <div className="section-header" style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
                    <h2>Money out</h2>
                  </div>
                  {expenseRows.length === 0
                    ? renderEmptyRows('expenses')
                    : renderTable(expenseRows, 'expense', selectedExpense, setSelectedExpense, expenseBulkCategory, setExpenseBulkCategory)}
                </div>
              </>
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
