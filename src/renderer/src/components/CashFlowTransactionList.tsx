import { Fragment, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Trash2, X } from 'lucide-react'
import type { CashFlowTrackedAccount, CashFlowTransaction } from '../../../shared/types'
import { formatCurrency, formatDate, formatDateShort } from '../lib/format'
import { countsTowardPnl } from '../lib/cashFlowCategories'
import { ICON_EDIT, ICON_DELETE, ICON_VIEW, ICON_DOWNLOAD } from '../lib/actionIcons'
import { api } from '../lib/api'
import ActionMenu from './ActionMenu'
import CashFlowCategoryPicker, { type CategoryValue } from './CashFlowCategoryPicker'

const PAGE_SIZE = 100

type SortKey = 'date' | 'amount' | 'description' | 'category'

interface Props {
  // Already filtered; sorting, grouping, paging and selection happen here. Remount
  // (via `key`) when the period changes so selection and paging start fresh.
  rows: CashFlowTransaction[]
  trackedAccounts: CashFlowTrackedAccount[]
  filtersActive: boolean
  // A running total only means something for one account with both directions
  // shown — the page decides that and passes true.
  showRunningTotal: boolean
  onClearFilters: () => void
  onEdit: (t: CashFlowTransaction) => void
  onDelete: (t: CashFlowTransaction) => void
  onSetCategory: (id: number, next: CategoryValue) => void
  onBulkCategorize: (ids: number[], next: CategoryValue) => Promise<void>
  onBulkDelete: (rows: CashFlowTransaction[], clearSelection: () => void) => void
}

function signedAmount(t: CashFlowTransaction): number {
  return t.direction === 'income' ? t.amount : -t.amount
}

function formatSigned(n: number): string {
  return `${n >= 0 ? '+' : '−'}${formatCurrency(Math.abs(n))}`
}

function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short' })
}

export default function CashFlowTransactionList({
  rows,
  trackedAccounts,
  filtersActive,
  showRunningTotal,
  onClearFilters,
  onEdit,
  onDelete,
  onSetCategory,
  onBulkCategorize,
  onBulkDelete
}: Props): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const accountName = (syncId: string | null): string | null => {
    if (!syncId) return null
    return trackedAccounts.find((a) => a.sync_id === syncId)?.name ?? '(account closed)'
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'date') cmp = a.txn_date.localeCompare(b.txn_date) || a.id - b.id
      else if (sortKey === 'amount') cmp = a.amount - b.amount
      else if (sortKey === 'description') cmp = a.description.localeCompare(b.description)
      else cmp = (a.category ?? '').localeCompare(b.category ?? '')
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const visible = sorted.slice(0, visibleCount)
  // Day headers only make sense in date order; any other sort shows the date per row.
  const groupByDay = sortKey === 'date'

  const runningTotals = useMemo(() => {
    if (!showRunningTotal) return null
    const chronological = [...rows].sort((a, b) => a.txn_date.localeCompare(b.txn_date) || a.id - b.id)
    const totals = new Map<number, number>()
    let running = 0
    for (const t of chronological) {
      running += signedAmount(t)
      totals.set(t.id, running)
    }
    return totals
  }, [rows, showRunningTotal])

  const dayNet = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of rows) if (countsTowardPnl(t.category)) m.set(t.txn_date, (m.get(t.txn_date) ?? 0) + signedAmount(t))
    return m
  }, [rows])

  // Bulk actions only reach rows still in the (filtered) list.
  const selectedRows = rows.filter((r) => selected.has(r.id))
  const clearSelection = (): void => setSelected(new Set())
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))
  const bulkDirection =
    selectedRows.length > 0 && selectedRows.every((r) => r.direction === selectedRows[0].direction) ? selectedRows[0].direction : null

  const toggle = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const counted = rows.filter((r) => countsTowardPnl(r.category))
  const totalIn = counted.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0)
  const totalOut = counted.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0)
  const notCounted = rows.filter((r) => !countsTowardPnl(r.category)).reduce((s, r) => s + r.amount, 0)

  const columnCount = 5 + (runningTotals ? 1 : 0)

  const sortButton = (key: SortKey, label: string): JSX.Element => {
    const active = sortKey === key
    const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
    return (
      <button
        type="button"
        className={`cf-sort ${active ? 'active' : ''}`}
        aria-label={`Sort by ${label.toLowerCase()}${active ? (sortDir === 'asc' ? ', ascending' : ', descending') : ''}`}
        onClick={() => {
          if (active) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
          else {
            setSortKey(key)
            // Text sorts A→Z first; dates and amounts biggest/newest first.
            setSortDir(key === 'description' || key === 'category' ? 'asc' : 'desc')
          }
        }}
      >
        {label}
        <Icon aria-hidden />
      </button>
    )
  }

  const ariaSort = (keys: SortKey[]): 'ascending' | 'descending' | 'none' =>
    keys.includes(sortKey) ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'

  if (rows.length === 0) {
    return (
      <div className="card cf-list-empty">
        {filtersActive ? (
          <>
            No transactions match these filters.
            <button className="btn secondary small" onClick={onClearFilters}>
              Clear filters
            </button>
          </>
        ) : (
          <>No transactions in this period. Use + Add to record one, or import a bank statement.</>
        )}
      </div>
    )
  }

  return (
    <div className="card cf-list">
      <table>
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input
                type="checkbox"
                aria-label="Select all shown"
                checked={allVisibleSelected}
                onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((r) => r.id)) : new Set())}
              />
            </th>
            <th aria-sort={ariaSort(['date', 'description'])}>
              <span className="cf-sort-group">
                {sortButton('date', 'Date')}
                {sortButton('description', 'Name')}
              </span>
            </th>
            <th aria-sort={ariaSort(['category'])}>{sortButton('category', 'Category')}</th>
            <th className="num" aria-sort={ariaSort(['amount'])}>
              {sortButton('amount', 'Amount')}
            </th>
            {runningTotals && (
              <th className="num" title="Adds up money in and out from the start of this period — not your bank balance">
                Running total
              </th>
            )}
            <th style={{ width: 44 }}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((t, i) => {
            const isNewDay = groupByDay && (i === 0 || visible[i - 1].txn_date !== t.txn_date)
            const net = dayNet.get(t.txn_date) ?? 0
            const account = accountName(t.account_sync_id)
            const isCounted = countsTowardPnl(t.category)
            // The subcategory is the chip's label now, so it's not repeated here.
            const meta = [
              !groupByDay ? formatDateShort(t.txn_date) : null,
              account,
              t.currency && t.amount_native != null ? `${t.currency} ${t.amount_native.toLocaleString('en-IN')} converted` : null,
              t.entry_method === 'ai_extracted' ? (t.document_original_name ? `from ${t.document_original_name}` : 'from a statement') : null
            ].filter(Boolean)
            return (
              <Fragment key={t.id}>
                {isNewDay && (
                  <tr className="cf-day-row">
                    <td colSpan={columnCount}>
                      <span>
                        {weekday(t.txn_date)} · {formatDate(t.txn_date)}
                      </span>
                      {net !== 0 && <span className="num cf-day-net">{formatSigned(net)}</span>}
                    </td>
                  </tr>
                )}
                <tr className={`cf-row ${selected.has(t.id) ? 'selected' : ''}`} onClick={() => onEdit(t)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.description}`}
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id)}
                    />
                  </td>
                  <td className="cf-row-main">
                    <div className="cf-row-title" title={t.notes ?? undefined}>
                      {t.description}
                    </div>
                    {meta.length > 0 && <div className="cf-row-meta">{meta.join(' · ')}</div>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <CashFlowCategoryPicker
                      direction={t.direction}
                      value={{ category: t.category, subcategory: t.subcategory }}
                      onChange={(next) => onSetCategory(t.id, next)}
                    />
                  </td>
                  <td
                    className={`num ${!isCounted ? 'amount-muted' : t.direction === 'income' ? 'amount-in' : 'amount-out'}`}
                    title={!isCounted ? 'Not counted in money in/out (transfer or reimbursement)' : undefined}
                  >
                    {formatSigned(signedAmount(t))}
                  </td>
                  {runningTotals && <td className="num muted">{formatCurrency(runningTotals.get(t.id) ?? 0)}</td>}
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                      items={[
                        { icon: ICON_EDIT, label: 'Edit', onClick: () => onEdit(t) },
                        ...(t.document_path
                          ? [
                              { icon: ICON_VIEW, label: 'View statement', onClick: () => api().cashFlow.openDocument(t.document_path!) },
                              {
                                icon: ICON_DOWNLOAD,
                                label: 'Download statement',
                                onClick: () => api().cashFlow.downloadDocument(t.document_path!, t.document_original_name)
                              }
                            ]
                          : []),
                        { icon: ICON_DELETE, label: 'Delete', danger: true, onClick: () => onDelete(t) }
                      ]}
                    />
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>

      {rows.length > visibleCount && (
        <div className="cf-list-more">
          <button className="btn secondary small" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, rows.length - visibleCount)} more ({rows.length - visibleCount} not shown)
          </button>
        </div>
      )}

      {/* Same rule as the summary cards: transfers/reimbursements are listed but not counted. */}
      <div className="cf-list-footer">
        <span>
          {rows.length} transaction{rows.length === 1 ? '' : 's'}
          {notCounted > 0 && <span className="muted"> · {formatCurrency(notCounted)} in transfers not counted</span>}
        </span>
        <span className="num">
          <span className="amount-in">In {formatCurrency(totalIn)}</span>
          <span>Out {formatCurrency(totalOut)}</span>
          <strong style={{ color: totalIn - totalOut < 0 ? 'var(--red)' : undefined }}>Net {formatSigned(totalIn - totalOut)}</strong>
        </span>
      </div>

      {selectedRows.length > 0 && (
        <div className="cf-bulkbar" role="toolbar" aria-label="Selected transactions">
          <span className="cf-bulkbar-count">
            {selectedRows.length} selected
            <span className="muted"> · {formatSigned(selectedRows.reduce((s, r) => s + signedAmount(r), 0))}</span>
          </span>
          {bulkDirection ? (
            <CashFlowCategoryPicker
              variant="button"
              direction={bulkDirection}
              value={{ category: null, subcategory: null }}
              onChange={(next) => void onBulkCategorize(selectedRows.map((r) => r.id), next).then(clearSelection)}
            />
          ) : (
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }} title="Income and expense have different categories">
              Select only money in or only money out to set a category
            </span>
          )}
          <button className="btn secondary small cf-danger" onClick={() => onBulkDelete(selectedRows, clearSelection)}>
            <Trash2 size={13} /> Delete
          </button>
          <button className="icon-btn" onClick={clearSelection} title="Clear selection" aria-label="Clear selection">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
