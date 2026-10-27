import { api } from '../lib/api'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Upload, RefreshCw, Receipt, Download, Trash2, ChevronLeft, ChevronRight, X, Sparkles, FileSpreadsheet } from 'lucide-react'
import type {
  CashFlowTransaction,
  CashFlowDirection,
  CashFlowCategory,
  CashFlowMonthSummary,
  CashFlowTrackedAccount,
  CashFlowStatementExtraction,
  CashFlowBudget,
  CashFlowSavingsGoal,
  CashFlowRecurringTemplate,
  CashFlowAccountCoverage
} from '../../../shared/types'
import { formatCurrency, formatDate, formatDateShort, formatMonthYear, todayLocalDateString } from '../lib/format'
import { friendlyError } from '../lib/friendlyError'
import { categoriesFor, countsTowardPnl } from '../lib/cashFlowCategories'
import type { PeriodType } from '../lib/cashFlowPeriods'
import { fyRangeFor, quarterRangeFor, ytdRangeFor, monthRangeFor } from '../lib/cashFlowPeriods'
import CashFlowEntryModal from '../components/CashFlowEntryModal'
import CashFlowExtractionReviewModal from '../components/CashFlowExtractionReviewModal'
import CashFlowTrendChart from '../components/CashFlowTrendChart'
import CashFlowBreakdownChart from '../components/CashFlowBreakdownChart'
import CashFlowInsights from '../components/CashFlowInsights'
import CashFlowBudgetCard from '../components/CashFlowBudgetCard'
import CashFlowRecurringNudge from '../components/CashFlowRecurringNudge'
import CashFlowImportsModal from '../components/CashFlowImportsModal'
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
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => sessionStorage.getItem(SESSION_MONTH_KEY) || currentMonth()
  )
  const [periodType, setPeriodType] = useState<PeriodType>('month')
  const [customStart, setCustomStart] = useState(defaultDateFor(currentMonth()))
  const [customEnd, setCustomEnd] = useState(todayLocalDateString())
  const [transactions, setTransactions] = useState<CashFlowTransaction[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summary, setSummary] = useState<CashFlowMonthSummary[]>([])
  const [trackedAccounts, setTrackedAccounts] = useState<CashFlowTrackedAccount[]>([])
  const [coverage, setCoverage] = useState<CashFlowAccountCoverage[]>([])
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
  const [showUncategorizedOnly, setShowUncategorizedOnly] = useState(false)

  const [modalDirection, setModalDirection] = useState<CashFlowDirection | null>(null)
  const [editingTxn, setEditingTxn] = useState<CashFlowTransaction | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CashFlowTransaction | null>(null)
  const [pendingDeleteImport, setPendingDeleteImport] = useState<{ importId: number } | null>(null)
  const [showImportsModal, setShowImportsModal] = useState(false)
  const [recentlyDeleted, setRecentlyDeleted] = useState<{ id: number; description: string } | null>(null)

  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState<{ completed: number; total: number } | null>(null)
  const extractCancelledRef = useRef(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [reviewExtraction, setReviewExtraction] = useState<CashFlowStatementExtraction | null>(null)
  const [reviewDocument, setReviewDocument] = useState<ReviewDocument | null>(null)
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null)
  const [pendingConsent, setPendingConsent] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<string[]>([])

  const [selectedIncome, setSelectedIncome] = useState<Set<number>>(new Set())
  const [selectedExpense, setSelectedExpense] = useState<Set<number>>(new Set())
  const [incomeBulkCategory, setIncomeBulkCategory] = useState<CashFlowCategory | ''>('')
  const [expenseBulkCategory, setExpenseBulkCategory] = useState<CashFlowCategory | ''>('')

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
  }

  const currentRange = useMemo(() => {
    if (periodType === 'month') return monthRangeFor(selectedMonth)
    if (periodType === 'quarter') return quarterRangeFor(`${selectedMonth}-01`)
    if (periodType === 'fy') return fyRangeFor(`${selectedMonth}-01`)
    if (periodType === 'ytd') return ytdRangeFor(todayLocalDateString())
    return { start: customStart, end: customEnd, label: 'Custom range' }
  }, [periodType, selectedMonth, customStart, customEnd])

  const loadPeriod = async (): Promise<void> => {
    setLoadError(null)
    try {
      const rows =
        periodType === 'month'
          ? await api().cashFlow.list(selectedMonth)
          : await api().cashFlow.listRange(currentRange.start, currentRange.end)
      setTransactions(rows)
    } catch (e) {
      setLoadError(friendlyError(e))
    }
  }

  const loadExtras = async (): Promise<void> => {
    try {
      const [cov, due, sample] = await Promise.all([
        api().cashFlow.coverage(selectedMonth),
        api().cashFlow.recurringDue(selectedMonth),
        api().cashFlow.hasSampleData()
      ])
      setCoverage(cov)
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
    setVisibleCount(PAGE_SIZE)
    setSelectedIncome(new Set())
    setSelectedExpense(new Set())
  }, [selectedMonth])

  // Request-id guard (#16): if the user flips through months quickly, an older
  // in-flight response landing after a newer one would otherwise show stale data.
  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      await loadPeriod()
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

  const filtered = transactions.filter((t) => matchesFilters(t, filters) && (!showUncategorizedOnly || !t.category))
  const uncategorizedCount = transactions.filter((t) => !t.category).length

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
  const incomeTotal = transactions
    .filter((t) => t.direction === 'income' && countsTowardPnl(t.category))
    .reduce((sum, t) => sum + t.amount, 0)
  const expenseTotal = transactions
    .filter((t) => t.direction === 'expense' && countsTowardPnl(t.category))
    .reduce((sum, t) => sum + t.amount, 0)
  const netThisPeriod = incomeTotal - expenseTotal
  const savingsRate = incomeTotal > 0 ? (netThisPeriod / incomeTotal) * 100 : null

  const thisMonthIdx = summary.findIndex((s) => s.month === selectedMonth)
  const lastMonthSummary = thisMonthIdx > 0 ? summary[thisMonthIdx - 1] : null
  const netDeltaVsLastMonth = lastMonthSummary ? netThisPeriod - lastMonthSummary.net : null

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

  const confirmRemove = async (): Promise<void> => {
    if (!pendingDelete) return
    const { id, description } = pendingDelete
    setPendingDelete(null)
    await api().cashFlow.remove(id)
    setRecentlyDeleted({ id, description })
    setTimeout(() => setRecentlyDeleted((cur) => (cur?.id === id ? null : cur)), 8000)
    reloadAll()
  }

  const undoDelete = async (): Promise<void> => {
    if (!recentlyDeleted) return
    await api().cashFlow.restore(recentlyDeleted.id)
    setRecentlyDeleted(null)
    reloadAll()
  }

  const confirmRemoveImport = async (): Promise<void> => {
    if (!pendingDeleteImport) return
    const { importId } = pendingDeleteImport
    setPendingDeleteImport(null)
    await api().cashFlow.deleteImport(importId)
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

  const bulkCategorize = async (ids: Set<number>, category: CashFlowCategory | '', clear: () => void): Promise<void> => {
    if (ids.size === 0) return
    await api().cashFlow.bulkUpdateCategory(Array.from(ids), category || null, null)
    clear()
    reloadAll()
  }

  const bulkDelete = async (ids: Set<number>, clear: () => void): Promise<void> => {
    if (ids.size === 0) return
    await api().cashFlow.bulkRemove(Array.from(ids))
    clear()
    reloadAll()
  }

  const exportCsv = async (): Promise<void> => {
    await api().cashFlow.exportCsv(periodType === 'month' ? selectedMonth : undefined)
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
    const appSettings = await api().settings.get()
    const providerConfigured =
      appSettings.extractionProvider === 'anthropic' ? appSettings.hasAnthropicKey : appSettings.hasOpenAiKey
    if (!providerConfigured) {
      setExtractError('Set up an AI provider in Settings before uploading a statement.')
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
  const monthOptions = Array.from(new Set([currentMonth(), ...months])).sort().reverse()
  const noTrackedAccounts = trackedAccounts.length === 0

  const shiftMonth = (delta: number): void => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  function renderTable(
    rows: CashFlowTransaction[],
    direction: CashFlowDirection | 'all',
    selected: Set<number>,
    setSelected: (s: Set<number>) => void,
    bulkCategory: CashFlowCategory | '',
    setBulkCategory: (c: CashFlowCategory | '') => void
  ): JSX.Element {
    const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
    // Net for the "all" view (income positive, expense negative); a plain sum for the split tables (#32).
    const total = rows.reduce((sum, r) => sum + (direction === 'all' ? (r.direction === 'income' ? r.amount : -r.amount) : r.amount), 0)
    const sortHeader = (key: SortKey, label: string): JSX.Element => (
      <th
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
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--accent-soft)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{selected.size} selected</span>
            {direction !== 'all' && (
              <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value as CashFlowCategory | '')}>
                <option value="">Uncategorized</option>
                {categoriesFor(direction, 'short').map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            {direction !== 'all' && (
              <button className="btn secondary small" onClick={() => bulkCategorize(selected, bulkCategory, () => setSelected(new Set()))}>
                Apply category
              </button>
            )}
            <button className="btn secondary small" style={{ color: 'var(--red)' }} onClick={() => bulkDelete(selected, () => setSelected(new Set()))}>
              <Trash2 size={13} /> Delete {selected.size}
            </button>
            <button className="btn secondary small" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 24 }}>
                  <input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                </th>
                {sortHeader('date', 'Date')}
                {sortHeader('description', 'Description')}
                {sortHeader('category', 'Category')}
                {sortHeader('amount', 'Amount')}
                {runningBalances && <th>Balance</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelected(selected, setSelected, t.id)} />
                  </td>
                  <td className="muted">{formatDateShort(t.txn_date)}</td>
                  <td>
                    {direction === 'all' && (
                      <span style={{ color: t.direction === 'income' ? 'var(--green)' : 'var(--red)', marginRight: 4 }}>
                        {t.direction === 'income' ? '+' : '−'}
                      </span>
                    )}
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
                    <select value={t.category ?? ''} onChange={(e) => setCategory(t.id, (e.target.value || null) as CashFlowCategory | null)}>
                      <option value="">Uncategorized</option>
                      {categoriesFor(t.direction, 'short').map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{formatCurrency(t.amount)}</td>
                  {runningBalances && <td className="muted">{formatCurrency(runningBalances.get(t.id) ?? 0)}</td>}
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
                        ...(t.import_id
                          ? [{ icon: ICON_DELETE, label: 'Delete entire import…', danger: true, onClick: () => setPendingDeleteImport({ importId: t.import_id! }) }]
                          : []),
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
                  </td>
                  <td style={direction === 'all' ? { color: total >= 0 ? 'var(--green)' : 'var(--red)' } : undefined}>{formatCurrency(total)}</td>
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

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Cash Flow
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {periodType === 'month' && (
            <>
              <button className="icon-btn" onClick={() => shiftMonth(-1)} title="Previous month">
                <ChevronLeft size={16} />
              </button>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthYear(m)}
                  </option>
                ))}
              </select>
              <button className="icon-btn" onClick={() => shiftMonth(1)} title="Next month">
                <ChevronRight size={16} />
              </button>
            </>
          )}
          <select value={periodType} onChange={(e) => setPeriodType(e.target.value as PeriodType)}>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="fy">Financial year</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom range</option>
          </select>
          {periodType === 'custom' && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span className="muted">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </>
          )}
          <button className="btn secondary" onClick={() => setShowImportsModal(true)} title="See every statement you've uploaded">
            <Receipt size={14} /> Uploaded statements
          </button>
          <button className="btn secondary" onClick={exportCsv} title="Export as CSV">
            <Download size={14} /> Export CSV
          </button>
          <button
            className="btn"
            onClick={uploadStatement}
            disabled={extracting || noTrackedAccounts}
            title={
              noTrackedAccounts
                ? 'Add a bank account first (under Accounts) before uploading a statement'
                : 'Upload a bank statement (PDF/CSV/photo) and AI reads every transaction line from it.'
            }
          >
            <Upload size={14} /> {extracting ? 'Reading statement…' : 'Import bank statement'}
          </button>
        </div>
      </div>

      {showIntro && (
        <div className="help-text section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <span>
            Cash Flow tracks money moving in and out — your salary and other <strong>income</strong>, day-to-day{' '}
            <strong>expenses</strong>, and what you set aside as <strong>savings</strong> (income minus expenses).
            Transfers between your own accounts aren&apos;t income or expense, so leave those uncategorized or skip
            them. Upload a bank statement and AI will sort most of this out for you.
          </span>
          <button
            className="icon-btn"
            title="Dismiss"
            onClick={() => {
              setShowIntro(false)
              localStorage.setItem(INTRO_DISMISSED_KEY, '1')
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {periodType !== 'month' && (
        <div className="help-text section" style={{ marginTop: -8 }}>
          Showing {currentRange.label}: {formatDate(currentRange.start)} – {formatDate(currentRange.end)}
        </div>
      )}

      {extracting && (
        <div className="syncing-banner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={15} className="spin" />
            {extractProgress && extractProgress.total > 1
              ? `Reading statement… ${Math.round((extractProgress.completed / extractProgress.total) * 100)}% ` +
                `(part ${extractProgress.completed} of ${extractProgress.total})`
              : 'Your AI provider is reading the statement…'}
            <button className="btn secondary small" style={{ marginLeft: 'auto' }} onClick={cancelExtraction}>
              Cancel
            </button>
          </div>
          {extractProgress && extractProgress.total > 1 && (
            <div style={{ height: 4, background: 'var(--bg-inset)', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.round((extractProgress.completed / extractProgress.total) * 100)}%`,
                  background: 'var(--accent)',
                  transition: 'width 200ms ease'
                }}
              />
            </div>
          )}
        </div>
      )}
      {uploadQueue.length > 0 && (
        <div className="help-text section">{uploadQueue.length} more statement{uploadQueue.length === 1 ? '' : 's'} queued</div>
      )}
      {extractError && (
        <div className="error-text section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {extractError}
          <button className="icon-btn" onClick={() => setExtractError(null)} title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
      {loadError && (
        <div className="error-text section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {loadError}
          <button className="btn secondary small" onClick={loadPeriod}>Retry</button>
        </div>
      )}

      {recentlyDeleted && (
        <div className="syncing-banner" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Deleted "{recentlyDeleted.description}"</span>
          <button className="btn secondary small" onClick={undoDelete}>Undo</button>
        </div>
      )}

      <CashFlowRecurringNudge due={recurringDue} month={selectedMonth} onHandled={loadExtras} />

      {trackedAccounts.length > 0 && periodType === 'month' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {trackedAccounts.map((a) => {
            const covered = coverage.some((c) => c.account_sync_id === a.sync_id)
            return (
              <span key={a.sync_id} className={`badge ${covered ? 'ok' : 'warn'}`} title={covered ? `Statement imported for ${a.name}` : `No statement imported for ${a.name} this month`}>
                {a.name}: {covered ? 'imported' : 'no statement'}
              </span>
            )
          })}
        </div>
      )}

      <div className="grid cols-3 section">
        <div className="card stat-card">
          <div className="label">Income</div>
          <div className="value positive">{formatCurrency(incomeTotal)}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Expense</div>
          <div className="value negative">{formatCurrency(expenseTotal)}</div>
        </div>
        <div className="card stat-card">
          <div className="label">{netThisPeriod >= 0 ? 'Saved' : 'Overspent'}</div>
          <div className={`value ${netThisPeriod >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(Math.abs(netThisPeriod))}
          </div>
          {savingsRate !== null && (
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              {savingsRate.toFixed(0)}% savings rate
              {netDeltaVsLastMonth !== null && (
                <> · {netDeltaVsLastMonth >= 0 ? '+' : ''}{formatCurrency(netDeltaVsLastMonth)} vs last month</>
              )}
            </div>
          )}
        </div>
      </div>

      {uncategorizedCount > 0 && (
        <div className="card section" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>
            {uncategorizedCount} transaction{uncategorizedCount === 1 ? '' : 's'} need{uncategorizedCount === 1 ? 's' : ''} a category.
          </span>
          <button className="btn secondary small" onClick={() => setShowUncategorizedOnly((v) => !v)}>
            {showUncategorizedOnly ? 'Show all' : 'Review'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn small ${viewMode === 'split' ? '' : 'secondary'}`} onClick={() => setViewMode('split')}>
            Income / Expense
          </button>
          <button className={`btn small ${viewMode === 'all' ? '' : 'secondary'}`} onClick={() => setViewMode('all')}>
            All transactions
          </button>
        </div>
        {!hasSampleData ? (
          <button className="btn secondary small" onClick={generateSample} disabled={sampleBusy}>
            <Sparkles size={12} /> Try with sample data
          </button>
        ) : (
          <button className="btn secondary small" onClick={removeSample} disabled={sampleBusy}>
            <FileSpreadsheet size={12} /> Remove sample data
          </button>
        )}
      </div>

      <CashFlowFilterBar filters={filters} onChange={setFilters} trackedAccounts={trackedAccounts} />

      {viewMode === 'all' ? (
        <div className="card section" style={{ padding: 0 }}>
          <div className="section-header" style={{ padding: '16px 16px 0' }}>
            <h2>All transactions</h2>
          </div>
          {allRows.length === 0 ? (
            <div className="muted" style={{ padding: 16 }}>No transactions match.</div>
          ) : (
            <>
              {renderTable(allRows, 'all', selectedIncome, setSelectedIncome, incomeBulkCategory, setIncomeBulkCategory)}
              {filtered.length > visibleCount && (
                <div style={{ textAlign: 'center', padding: 12 }}>
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
            <div className="section-header" style={{ padding: '16px 16px 0' }}>
              <h2>Income</h2>
              <button className="btn secondary" onClick={() => { setModalDirection('income'); setEditingTxn(null) }}>
                <Plus size={14} /> Add income
              </button>
            </div>
            {incomeRows.length === 0 ? (
              <div className="muted" style={{ padding: 16 }}>No income transactions match.</div>
            ) : (
              renderTable(incomeRows, 'income', selectedIncome, setSelectedIncome, incomeBulkCategory, setIncomeBulkCategory)
            )}
          </div>

          <div className="card section" style={{ padding: 0 }}>
            <div className="section-header" style={{ padding: '16px 16px 0' }}>
              <h2>Expense</h2>
              <button className="btn secondary" onClick={() => { setModalDirection('expense'); setEditingTxn(null) }}>
                <Plus size={14} /> Add expense
              </button>
            </div>
            {expenseRows.length === 0 ? (
              <div className="muted" style={{ padding: 16 }}>No expense transactions match.</div>
            ) : (
              renderTable(expenseRows, 'expense', selectedExpense, setSelectedExpense, expenseBulkCategory, setExpenseBulkCategory)
            )}
          </div>
        </>
      )}

      {transactions.length === 0 && months.length === 0 && (
        <div className="card empty-state">
          <Receipt size={30} />
          <div>
            No cash flow data yet. Add income/expense transactions manually, import a bank statement (PDF, CSV, or a
            photo) and let AI read every transaction line from it, or try sample data above to see how it looks.
          </div>
        </div>
      )}

      <div className="grid cols-2 section">
        {summary.length >= 1 && (
          <div className="card">
            <div className="section-header">
              <h2>Trend</h2>
            </div>
            <CashFlowTrendChart summary={summary} onMonthClick={(m) => { setPeriodType('month'); setSelectedMonth(m) }} />
          </div>
        )}
        {transactions.some((t) => t.direction === 'expense') && (
          <div className="card">
            <div className="section-header">
              <h2>Where it went</h2>
            </div>
            <CashFlowBreakdownChart transactions={transactions} />
          </div>
        )}
      </div>

      <CashFlowInsights transactions={transactions} previousMonthExpenseTotal={lastMonthSummary?.expense_total ?? null} />

      <CashFlowBudgetCard
        budgets={budgets}
        savingsGoal={savingsGoal}
        transactions={transactions}
        netThisMonth={netThisPeriod}
        onBudgetsChanged={setBudgets}
        onGoalChanged={setSavingsGoal}
      />

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
        open={pendingDeleteImport !== null}
        title="Delete entire import"
        message="Delete every transaction from this statement upload? This can't be undone."
        confirmLabel="Delete all"
        onConfirm={() => void confirmRemoveImport()}
        onCancel={() => setPendingDeleteImport(null)}
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
