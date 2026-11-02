import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import type { Account, AccountCategory } from '../../../shared/types'
import {
  CATEGORY_LABELS,
  CATEGORY_IS_LIABILITY,
  CHECKIN_QUANTITY_SUBTYPES,
  getSubtypeLabel,
  getSubtypeIcon
} from '../lib/categories'
import { formatCurrency, formatDate, formatAgo, daysUntil } from '../lib/format'
import SummaryStrip from '../components/SummaryStrip'
import AccountModal from '../components/AccountModal'
import CheckInModal from '../components/CheckInModal'
import CheckInCelebration from '../components/CheckInCelebration'
import AccountTrendModal from '../components/AccountTrendModal'
import CategoryTrendModal from '../components/CategoryTrendModal'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import ActionMenu from '../components/ActionMenu'
import { Plus, ChevronDown, ChevronRight, Wallet, Link2 } from 'lucide-react'
import { ICON_TREND, ICON_CHECK_IN, ICON_EDIT, ICON_DELETE } from '../lib/actionIcons'
import { useUndoToast } from '../lib/useUndoToast'

function gainLabel(currentValue: number, investedAmount: number): JSX.Element {
  const gain = currentValue - investedAmount
  const pct = investedAmount !== 0 ? (gain / investedAmount) * 100 : 0
  const positive = gain >= 0
  return (
    <span style={{ color: positive ? 'var(--green)' : 'var(--red)' }}>
      {positive ? '+' : ''}
      {formatCurrency(gain)} ({positive ? '+' : ''}
      {pct.toFixed(1)}%)
    </span>
  )
}

// Your share of an account's value — same rule as netWorth.ts's effective value, so
// a section total here matches what net worth counts for part-owned property.
function ownedValue(a: Account): number {
  return a.ownership_pct != null && a.ownership_pct < 100 ? (a.current_value * a.ownership_pct) / 100 : a.current_value
}

// Values older than this get flagged — about six weeks, i.e. a missed monthly check-in.
const STALE_DAYS = 45

function isStale(a: Account): boolean {
  const d = daysUntil(a.last_updated?.slice(0, 10))
  return d !== null && -d > STALE_DAYS
}

// "3 months ago" (exact date on hover), amber once it's stale — every account type,
// not just real estate as before, since a balance from March is just as misleading.
function LastUpdatedCell({ iso }: { iso: string }): JSX.Element {
  const d = daysUntil(iso?.slice(0, 10))
  const stale = d !== null && -d > STALE_DAYS
  return (
    <td title={formatDate(iso)} className={stale ? undefined : 'muted'}>
      {stale ? <span className="badge warn">{formatAgo(iso)}</span> : formatAgo(iso)}
    </td>
  )
}

export default function Accounts(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const { offerUndo, undoToast } = useUndoToast()
  const [editing, setEditing] = useState<Account | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [linkedAssetSuggestion, setLinkedAssetSuggestion] = useState<Account | null>(null)
  const [assetModalInitial, setAssetModalInitial] = useState<{
    category: AccountCategory
    subtype: Account['subtype']
    name: string
  } | null>(null)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [autoSyncOnOpen, setAutoSyncOnOpen] = useState(false)
  const [checkInTarget, setCheckInTarget] = useState<Account | null>(null)
  const [celebration, setCelebration] = useState<{
    accountName: string
    previousValue: number
    newValue: number
    currency: string
  } | null>(null)
  const [trendTarget, setTrendTarget] = useState<Account | null>(null)
  const [categoryTrend, setCategoryTrend] = useState<AccountCategory | null>(null)
  const [collapsedInstitutions, setCollapsedInstitutions] = useState<Set<string>>(new Set())
  // `txns` is the choice made in the linked-transactions step, carried through and
  // only acted on once the delete itself is confirmed.
  const [pendingDelete, setPendingDelete] = useState<{
    id: number
    label: string
    txns?: { syncId: string; action: 'unlink' | 'delete'; count: number }
  } | null>(null)
  const [pendingTxnChoice, setPendingTxnChoice] = useState<{ id: number; label: string; syncId: string; count: number } | null>(null)

  // Totals come from the same service the Dashboard uses, so the two always agree.
  const [totals, setTotals] = useState<{ totalAssets: number; totalLiabilities: number; netWorth: number } | null>(null)

  const load = async (): Promise<void> => {
    const [list, t] = await Promise.all([api().accounts.list(), api().netWorth.summary()])
    setAccounts(list)
    setTotals(t)
  }

  useEffect(() => {
    load()
  }, [])

  // Cash-flow transactions reference an account by its sync_id, which deleting the
  // account doesn't touch on its own — if any exist, ask whether to keep them
  // (unlinked, still in the ledger) or delete them too, before the normal
  // delete-account confirmation.
  const remove = async (id: number, label: string): Promise<void> => {
    const syncId = await api().accounts.syncId(id)
    const count = syncId ? await api().cashFlow.accountTransactionCount(syncId) : 0
    if (syncId && count > 0) {
      setPendingTxnChoice({ id, label, syncId, count })
    } else {
      setPendingDelete({ id, label })
    }
  }

  // The linked transactions are only touched here, after the final confirmation —
  // they used to be unlinked/deleted as soon as the choice was made, so cancelling
  // the delete afterwards left the account in place with its transactions gone.
  const confirmRemove = async (): Promise<void> => {
    if (!pendingDelete) return
    const { id, label, txns } = pendingDelete
    setPendingDelete(null)
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    if (txns?.action === 'unlink') await api().cashFlow.unlinkAccount(txns.syncId)
    if (txns?.action === 'delete') await api().cashFlow.deleteForAccount(txns.syncId)
    await api().accounts.remove(id)
    load()
    // Undo only when the account was deleted on its own — restoring it can't put
    // back transactions that were deleted or unlinked alongside it.
    if (!txns) {
      offerUndo(`"${label}"`, async () => {
        await api().accounts.restore(id)
        load()
      })
    }
  }

  const chooseTxnAction = (action: 'unlink' | 'delete'): void => {
    if (!pendingTxnChoice) return
    const { id, label, syncId, count } = pendingTxnChoice
    setPendingTxnChoice(null)
    setPendingDelete({ id, label, txns: { syncId, action, count } })
  }

  const grouped = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    ;(acc[a.category] ??= []).push(a)
    return acc
  }, {})

  const handleSaved = (saved: Account): void => {
    const wasNew = editing === null
    setShowModal(false)
    load()
    if (wasNew && (saved.subtype === 'car_loan' || saved.subtype === 'home_loan')) {
      setLinkedAssetSuggestion(saved)
    }
  }

  const addLinkedAsset = (): void => {
    if (!linkedAssetSuggestion) return
    const isHome = linkedAssetSuggestion.subtype === 'home_loan'
    setAssetModalInitial({
      category: isHome ? 'real_estate' : 'other_asset',
      subtype: isHome ? 'home' : 'vehicle',
      name: linkedAssetSuggestion.name
    })
    setLinkedAssetSuggestion(null)
    setShowAssetModal(true)
  }

  // One row for every category. Clicking a row updates its value (the thing you do
  // most here); that action is also a visible, labelled button rather than only an
  // icon, and Edit/Delete live in the ⋯ menu.
  const renderAccountRow = (a: Account, showInstitution: boolean): JSX.Element => {
    const SubtypeIcon = getSubtypeIcon(a.subtype)
    const partOwned = a.ownership_pct != null && a.ownership_pct < 100
    const owned = ownedValue(a)
    return (
      <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setCheckInTarget(a)}>
        <td>{a.name}</td>
        <td className="muted">
          <span className="type-cell">
            <span className="icon">
              <SubtypeIcon />
            </span>
            {getSubtypeLabel(a.category, a.subtype)}
          </span>
        </td>
        {showInstitution && <td className="muted">{a.institution ?? '—'}</td>}
        <td className="num">
          {formatCurrency(owned, a.currency)}
          {partOwned && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              {a.ownership_pct}% of {formatCurrency(a.current_value)}
            </div>
          )}
          {a.category === 'real_estate' && a.purchase_price != null ? (
            <div style={{ fontSize: 12 }}>
              {gainLabel(owned, partOwned ? (a.purchase_price * a.ownership_pct!) / 100 : a.purchase_price)}
            </div>
          ) : a.principal_amount != null && !a.is_liability ? (
            <div style={{ fontSize: 12 }}>{gainLabel(a.current_value, a.principal_amount)}</div>
          ) : CHECKIN_QUANTITY_SUBTYPES.includes(a.subtype) && a.quantity != null ? (
            <div className="muted" style={{ fontSize: 12 }}>
              {a.quantity} {a.subtype === 'physical_gold' ? 'g' : 'shares'}
            </div>
          ) : null}
        </td>
        <LastUpdatedCell iso={a.last_updated} />
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <button className="btn secondary small" onClick={() => setCheckInTarget(a)}>
              <ICON_CHECK_IN size={13} /> Update value
            </button>
            <button className="icon-btn" title="View trend" aria-label={`View trend for ${a.name}`} onClick={() => setTrendTarget(a)}>
              <ICON_TREND size={15} />
            </button>
            <ActionMenu
              items={[
                {
                  icon: ICON_EDIT,
                  label: 'Edit',
                  onClick: () => {
                    setEditing(a)
                    setAutoSyncOnOpen(false)
                    setShowModal(true)
                  }
                },
                { icon: ICON_DELETE, label: 'Delete', danger: true, onClick: () => remove(a.id, a.name) }
              ]}
            />
          </span>
        </td>
      </tr>
    )
  }

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Accounts
        </h1>
        <button
          className="btn"
          onClick={() => {
            setEditing(null)
            setAutoSyncOnOpen(false)
            setShowModal(true)
          }}
        >
          <Plus size={14} /> Add account
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="card empty-state">
          <Wallet size={30} />
          <div>No accounts yet.</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>
            Add your bank accounts, investments, real estate, and loans to track your net worth.
          </div>
          <button
            className="btn"
            style={{ marginTop: 12 }}
            onClick={() => {
              setEditing(null)
              setAutoSyncOnOpen(false)
              setShowModal(true)
            }}
          >
            <Plus size={14} /> Add your first account
          </button>
        </div>
      )}

      {accounts.length > 0 && totals && (
        <SummaryStrip
          stats={[
            { label: 'Assets', value: formatCurrency(totals.totalAssets), hint: 'Everything you own — balances, investments, property (your share of it).' },
            {
              label: 'Owed',
              value: formatCurrency(totals.totalLiabilities),
              hint: 'Loans and other money you owe.',
              tone: totals.totalLiabilities > 0 ? 'bad' : undefined
            },
            {
              label: 'Net worth',
              value: `${totals.netWorth < 0 ? '−' : ''}${formatCurrency(Math.abs(totals.netWorth))}`,
              hint: 'Assets minus what you owe.',
              tone: totals.netWorth < 0 ? 'bad' : undefined
            },
            (() => {
              const stale = accounts.filter(isStale).length
              return {
                label: 'Need updating',
                value: stale === 0 ? 'All current' : `${stale} of ${accounts.length}`,
                hint: `Accounts whose value hasn't been updated in over ${STALE_DAYS} days. Click a row to update it.`,
                tone: stale > 0 ? ('warn' as const) : ('good' as const),
                note: stale > 0 ? 'Totals may be out of date until they are' : 'Every value is from the last six weeks'
              }
            })()
          ]}
        />
      )}

      {linkedAssetSuggestion && (
        <div className="notice info section">
          <Link2 />
          <div className="notice-body">
            <strong>
              Add the {linkedAssetSuggestion.subtype === 'home_loan' ? 'home' : 'car'} as an asset too?
            </strong>{' '}
            "{linkedAssetSuggestion.name}" is only recorded as a loan right now — adding what it&apos;s worth keeps your
            net worth accurate.
          </div>
          <div className="notice-actions">
            <button className="btn small" onClick={addLinkedAsset}>
              Add as asset
            </button>
            <button className="btn secondary small" onClick={() => setLinkedAssetSuggestion(null)}>
              Not now
            </button>
          </div>
        </div>
      )}

      {(Object.keys(CATEGORY_LABELS) as AccountCategory[]).map((cat) => {
        if (!grouped[cat] || grouped[cat].length === 0) return null
        const rows = [...grouped[cat]].sort((a, b) => b.current_value - a.current_value)
        const showInstitution = cat !== 'investment' && cat !== 'real_estate' && cat !== 'other_asset'
        const total = rows.reduce((sum, a) => sum + ownedValue(a), 0)
        return (
          <div key={cat} className="section">
            <div className="section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0 }}>{CATEGORY_LABELS[cat]}</h2>
                <span className="section-count-badge">
                  {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Loans read as money owed, not as another asset total. */}
                <span className="section-total" style={CATEGORY_IS_LIABILITY[cat] ? { color: 'var(--red)' } : undefined}>
                  {formatCurrency(total)}
                  {CATEGORY_IS_LIABILITY[cat] && <span className="muted" style={{ fontWeight: 400, marginLeft: 4 }}>owed</span>}
                </span>
                <button
                  className="icon-btn"
                  title="View trend"
                  aria-label="View trend"
                  onClick={() => setCategoryTrend(cat)}
                >
                  <ICON_TREND size={16} />
                </button>
              </div>
            </div>
            {/* One table for every category; banks are additionally grouped by
                institution. (The bank and non-bank tables used to be two ~110-line
                copies of the same row markup that had already started to drift.) */}
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    {showInstitution && <th>Institution</th>}
                    <th className="num">Value</th>
                    <th>Last updated</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                {cat === 'bank' ? (
                  [...rows.reduce((m, a) => m.set(a.institution ?? 'Other', [...(m.get(a.institution ?? 'Other') ?? []), a]), new Map<string, Account[]>())]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([inst, instRows]) => {
                      const isCollapsed = collapsedInstitutions.has(inst)
                      const toggleInst = (): void => {
                        setCollapsedInstitutions((prev) => {
                          const next = new Set(prev)
                          if (next.has(inst)) next.delete(inst)
                          else next.add(inst)
                          return next
                        })
                      }
                      return (
                        <tbody key={inst}>
                          <tr className="cf-day-row" style={{ cursor: 'pointer' }} onClick={toggleInst} aria-expanded={!isCollapsed}>
                            <td colSpan={showInstitution ? 6 : 5}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                {inst}
                                <span className="muted" style={{ fontWeight: 400 }}>
                                  · {instRows.length}
                                </span>
                              </span>
                            </td>
                          </tr>
                          {!isCollapsed && instRows.map((a) => renderAccountRow(a, showInstitution))}
                        </tbody>
                      )
                    })
                ) : (
                  <tbody>{rows.map((a) => renderAccountRow(a, showInstitution))}</tbody>
                )}
              </table>
            </div>
          </div>
        )
      })}

      {showModal && (
        <AccountModal
          account={editing}
          autoSync={autoSyncOnOpen}
          onClose={() => {
            setShowModal(false)
            setAutoSyncOnOpen(false)
          }}
          onSaved={(saved) => {
            setAutoSyncOnOpen(false)
            handleSaved(saved)
          }}
        />
      )}

      {showAssetModal && (
        <AccountModal
          account={null}
          initial={assetModalInitial}
          onClose={() => setShowAssetModal(false)}
          onSaved={() => {
            setShowAssetModal(false)
            load()
          }}
        />
      )}

      {checkInTarget && (
        <CheckInModal
          account={checkInTarget}
          onClose={() => setCheckInTarget(null)}
          onSaved={(previousValue, saved) => {
            setCheckInTarget(null)
            load()
            setCelebration({
              accountName: saved.name,
              previousValue,
              newValue: saved.current_value,
              currency: saved.currency
            })
          }}
          onChanged={load}
        />
      )}

      {trendTarget && <AccountTrendModal account={trendTarget} onClose={() => setTrendTarget(null)} />}

      {categoryTrend && (
        <CategoryTrendModal category={categoryTrend} onClose={() => setCategoryTrend(null)} />
      )}

      {celebration && (
        <CheckInCelebration
          accountName={celebration.accountName}
          previousValue={celebration.previousValue}
          newValue={celebration.newValue}
          currency={celebration.currency}
          onDone={() => setCelebration(null)}
        />
      )}

      {pendingTxnChoice && (
        // A plain ConfirmDialog's Cancel button would be ambiguous here — it needs
        // to mean "abort, don't delete the account at all", not "proceed with the
        // other option" — so this is a genuine 3-way choice rather than binary.
        <Modal title="Cash flow transactions linked to this account" onClose={() => setPendingTxnChoice(null)} dirty={false}>
          <p className="confirm-message">
            "{pendingTxnChoice.label}" has {pendingTxnChoice.count} cash flow transaction
            {pendingTxnChoice.count === 1 ? '' : 's'}. Delete them too, or keep them in your ledger (no longer
            linked to any account)?
          </p>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setPendingTxnChoice(null)}>
              Cancel — don't delete account
            </button>
            <button className="btn secondary" onClick={() => chooseTxnAction('unlink')}>
              Keep transactions
            </button>
            <button className="btn danger" onClick={() => chooseTxnAction('delete')}>
              Delete them too
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete account"
        message={
          pendingDelete?.txns
            ? `Delete "${pendingDelete.label}"? Its ${pendingDelete.txns.count} cash flow transaction${pendingDelete.txns.count === 1 ? '' : 's'} will be ${
                pendingDelete.txns.action === 'delete' ? 'deleted too' : 'kept, no longer linked to an account'
              }. This can't be undone.`
            : `Delete "${pendingDelete?.label}"? You can undo this for a few seconds after.`
        }
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />

      {undoToast}
    </div>
  )
}
