import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import type { Account, AccountCategory } from '../../../shared/types'
import {
  CATEGORY_LABELS,
  CHECKIN_QUANTITY_SUBTYPES,
  getSubtypeLabel,
  getSubtypeIcon
} from '../lib/categories'
import { formatCurrency, formatDate } from '../lib/format'
import AccountModal from '../components/AccountModal'
import CheckInModal from '../components/CheckInModal'
import CheckInCelebration from '../components/CheckInCelebration'
import AccountTrendModal from '../components/AccountTrendModal'
import CategoryTrendModal from '../components/CategoryTrendModal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Wallet } from 'lucide-react'
import { ICON_TREND, ICON_CHECK_IN } from '../lib/actionIcons'

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

export default function Accounts(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
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
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [collapsedInstitutions, setCollapsedInstitutions] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<{ id: number; label: string } | null>(null)
  const [pendingTxnChoice, setPendingTxnChoice] = useState<{ id: number; label: string; syncId: string; count: number } | null>(null)

  const load = async (): Promise<void> => {
    setAccounts(await api().accounts.list())
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

  const confirmRemove = async (): Promise<void> => {
    if (!pendingDelete) return
    const { id } = pendingDelete
    setPendingDelete(null)
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    await api().accounts.remove(id)
    load()
  }

  const keepTransactionsUnlinked = async (): Promise<void> => {
    if (!pendingTxnChoice) return
    const { id, label, syncId } = pendingTxnChoice
    setPendingTxnChoice(null)
    await api().cashFlow.unlinkAccount(syncId)
    setPendingDelete({ id, label })
  }

  const deleteTransactionsToo = async (): Promise<void> => {
    if (!pendingTxnChoice) return
    const { id, label, syncId } = pendingTxnChoice
    setPendingTxnChoice(null)
    await api().cashFlow.deleteForAccount(syncId)
    setPendingDelete({ id, label })
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

      {linkedAssetSuggestion && (
        <div className="card section" style={{ borderColor: 'var(--accent)' }}>
          <strong>
            You added a {linkedAssetSuggestion.subtype === 'home_loan' ? 'home loan' : 'car loan'} — add the {linkedAssetSuggestion.subtype === 'home_loan' ? 'home' : 'car'} as an asset too?
          </strong>
          <p className="muted" style={{ marginTop: 4, marginBottom: 10 }}>
            "{linkedAssetSuggestion.name}" is only recorded as a liability right now. Adding the asset value too keeps your net worth accurate.
          </p>
          <button className="btn secondary small" onClick={addLinkedAsset}>
            Add as asset
          </button>
          <button
            className="btn secondary small"
            style={{ marginLeft: 8 }}
            onClick={() => setLinkedAssetSuggestion(null)}
          >
            Not now
          </button>
        </div>
      )}

      {(Object.keys(CATEGORY_LABELS) as AccountCategory[]).map((cat) => {
        const rows = grouped[cat]
        if (!rows || rows.length === 0) return null
        rows.sort((a, b) => b.current_value - a.current_value)
        const showInstitution = cat !== 'investment' && cat !== 'real_estate' && cat !== 'other_asset'
        const total = rows.reduce((sum, a) => sum + a.current_value, 0)
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
                <span className="section-total">{formatCurrency(total)}</span>
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
            {cat === 'bank' ? (
              (() => {
                const byInst = new Map<string, typeof rows>()
                for (const a of rows) {
                  const k = a.institution ?? 'Other'
                  if (!byInst.has(k)) byInst.set(k, [])
                  byInst.get(k)!.push(a)
                }
                const sorted = [...byInst.entries()].sort(([a], [b]) => a.localeCompare(b))
                return (
                  <div className="card" style={{ padding: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          {showInstitution && <th>Institution</th>}
                          <th>Value</th>
                          <th>Last updated</th>
                          <th></th>
                        </tr>
                      </thead>
                      {sorted.map(([inst, instRows]) => {
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
                            <tr
                              style={{ cursor: 'pointer' }}
                              onClick={toggleInst}
                            >
                              <td colSpan={showInstitution ? 6 : 5} style={{ background: 'var(--bg-inset)', color: 'var(--text-faint)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 14px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                  {inst}
                                </span>
                              </td>
                            </tr>
                            {!isCollapsed && instRows.map((a) => {
                              const SubtypeIcon = getSubtypeIcon(a.subtype)
                              return (
                                <tr
                                  key={a.id}
                                  style={{ cursor: 'pointer' }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--hover-row, rgba(255,255,255,0.03))'
                                    setHoveredId(a.id)
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = ''
                                    setHoveredId(null)
                                  }}
                                  onClick={() => setCheckInTarget(a)}
                                >
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
                                  <td>
                                    {formatCurrency(a.current_value, a.currency)}
                                    {a.principal_amount != null && !a.is_liability ? (
                                      <div style={{ fontSize: 12 }}>
                                        {gainLabel(a.current_value, a.principal_amount)}
                                      </div>
                                    ) : CHECKIN_QUANTITY_SUBTYPES.includes(a.subtype) && a.quantity != null ? (
                                      <div className="muted" style={{ fontSize: 12 }}>
                                        {a.quantity} {a.subtype === 'physical_gold' ? 'g' : 'shares'}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="muted">{formatDate(a.last_updated)}</td>
                                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <button
                                      className="icon-btn"
                                      style={{ marginRight: 4 }}
                                      title="Update value"
                                      aria-label="Update value"
                                      onClick={(e) => { e.stopPropagation(); setCheckInTarget(a) }}
                                    >
                                      <ICON_CHECK_IN size={15} />
                                    </button>
                                    <button
                                      className="icon-btn"
                                      style={{ marginRight: 6 }}
                                      title="View trend"
                                      aria-label="View trend"
                                      onClick={(e) => { e.stopPropagation(); setTrendTarget(a) }}
                                    >
                                      <ICON_TREND size={15} />
                                    </button>
                                    <div style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end', opacity: hoveredId === a.id ? 1 : 0, transition: 'opacity 150ms' }}>
                                      <button
                                        className="icon-btn"
                                        title="Edit"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setEditing(a)
                                          setAutoSyncOnOpen(false)
                                          setShowModal(true)
                                        }}
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button
                                        className="icon-btn"
                                        title="Delete"
                                        onClick={(e) => { e.stopPropagation(); remove(a.id, a.name) }}
                                        style={{ color: 'var(--red)' }}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        )
                      })}
                    </table>
                  </div>
                )
              })()
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      {showInstitution && <th>Institution</th>}
                      <th>Value</th>
                      <th>Last updated</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => {
                      const SubtypeIcon = getSubtypeIcon(a.subtype)
                      const monthsOld = (() => {
                        const d = new Date(a.last_updated)
                        const now = new Date()
                        return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
                      })()
                      return (
                        <tr
                          key={a.id}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--hover-row, rgba(255,255,255,0.03))'
                            setHoveredId(a.id)
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = ''
                            setHoveredId(null)
                          }}
                          onClick={() => setCheckInTarget(a)}
                        >
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
                          <td>
                            {(() => {
                              const hasPartialOwnership = a.category === 'real_estate' && a.ownership_pct != null && a.ownership_pct < 100
                              const effectiveValue = hasPartialOwnership
                                ? a.current_value * (a.ownership_pct!) / 100
                                : a.current_value
                              return (
                                <>
                                  {formatCurrency(effectiveValue, a.currency)}
                                  {hasPartialOwnership && (
                                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                                      {a.ownership_pct}% of {formatCurrency(a.current_value)}
                                    </div>
                                  )}
                                  {a.category === 'real_estate' && monthsOld > 6 && (
                                    <span style={{ fontSize: 10, color: 'var(--amber, #e8b14f)', marginLeft: 6 }}>Update value</span>
                                  )}
                                </>
                              )
                            })()}
                            {a.category === 'real_estate' && a.purchase_price != null ? (
                              <div style={{ fontSize: 12 }}>
                                {gainLabel(
                                  a.ownership_pct != null && a.ownership_pct < 100 ? a.current_value * a.ownership_pct / 100 : a.current_value,
                                  a.ownership_pct != null && a.ownership_pct < 100 ? a.purchase_price * a.ownership_pct / 100 : a.purchase_price
                                )}
                              </div>
                            ) : a.principal_amount != null && !a.is_liability ? (
                              <div style={{ fontSize: 12 }}>
                                {gainLabel(a.current_value, a.principal_amount)}
                              </div>
                            ) : CHECKIN_QUANTITY_SUBTYPES.includes(a.subtype) && a.quantity != null ? (
                              <div className="muted" style={{ fontSize: 12 }}>
                                {a.quantity} {a.subtype === 'physical_gold' ? 'g' : 'shares'}
                              </div>
                            ) : null}
                          </td>
                          <td className="muted">{formatDate(a.last_updated)}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              className="icon-btn"
                              style={{ marginRight: 4 }}
                              title="Update value"
                              aria-label="Update value"
                              onClick={(e) => { e.stopPropagation(); setCheckInTarget(a) }}
                            >
                              <ICON_CHECK_IN size={15} />
                            </button>
                            <button
                              className="icon-btn"
                              style={{ marginRight: 6 }}
                              title="View trend"
                              aria-label="View trend"
                              onClick={(e) => { e.stopPropagation(); setTrendTarget(a) }}
                            >
                              <ICON_TREND size={15} />
                            </button>
                            <div style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end', opacity: hoveredId === a.id ? 1 : 0, transition: 'opacity 150ms' }}>
                              <button
                                className="icon-btn"
                                title="Edit"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditing(a)
                                  setAutoSyncOnOpen(false)
                                  setShowModal(true)
                                }}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                className="icon-btn"
                                title="Delete"
                                onClick={(e) => { e.stopPropagation(); remove(a.id, a.name) }}
                                style={{ color: 'var(--red)' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
        <div className="modal-backdrop" onClick={() => setPendingTxnChoice(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Cash flow transactions linked to this account</h2>
            <p className="confirm-message">
              "{pendingTxnChoice.label}" has {pendingTxnChoice.count} cash flow transaction
              {pendingTxnChoice.count === 1 ? '' : 's'}. Delete them too, or keep them in your ledger (no longer
              linked to any account)?
            </p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setPendingTxnChoice(null)}>
                Cancel — don't delete account
              </button>
              <button className="btn secondary" onClick={() => void keepTransactionsUnlinked()}>
                Keep transactions
              </button>
              <button className="btn danger" onClick={() => void deleteTransactionsToo()}>
                Delete them too
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete account"
        message={`Delete "${pendingDelete?.label}"? This can't be undone.`}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
