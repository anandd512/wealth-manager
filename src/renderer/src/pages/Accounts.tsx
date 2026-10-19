import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import type { Account, AccountCategory } from '../../../shared/types'
import {
  CATEGORY_LABELS,
  SUPPORTS_TICKER,
  CHECKIN_QUANTITY_SUBTYPES,
  getSubtypeLabel,
  getSubtypeIcon
} from '../lib/categories'
import { formatCurrency, formatDate } from '../lib/format'
import AccountModal from '../components/AccountModal'
import ActionMenu from '../components/ActionMenu'
import CheckInModal from '../components/CheckInModal'
import CheckInCelebration from '../components/CheckInCelebration'
import AccountTrendModal from '../components/AccountTrendModal'
import CategoryTrendModal from '../components/CategoryTrendModal'
import { Plus, Landmark } from 'lucide-react'
import { ICON_VIEW, ICON_DOWNLOAD, ICON_EDIT, ICON_DELETE, ICON_SYNC, ICON_TREND, ICON_CHECK_IN } from '../lib/actionIcons'

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
  const [refreshingId, setRefreshingId] = useState<number | null>(null)
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
  const [priceError, setPriceError] = useState<string | null>(null)
  const [undoPending, setUndoPending] = useState<{ id: number; label: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (): Promise<void> => {
    setAccounts(await api().accounts.list())
  }

  useEffect(() => {
    load()
  }, [])

  const remove = (id: number, label: string): void => {
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoPending({ id, label })
    undoTimerRef.current = setTimeout(async () => {
      setUndoPending(null)
      await api().accounts.remove(id)
      load()
    }, 5000)
  }

  const undoDelete = (): void => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoPending(null)
    load()
  }

  const refreshPrice = async (id: number): Promise<void> => {
    setRefreshingId(id)
    setPriceError(null)
    try {
      const quote = await api().accounts.refreshPrice(id)
      if (quote.error) setPriceError(`Could not fetch price: ${quote.error}`)
    } finally {
      setRefreshingId(null)
      load()
    }
  }

  const openLoanSync = (a: Account): void => {
    setEditing(a)
    setAutoSyncOnOpen(true)
    setShowModal(true)
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
      {undoPending && (
        <div className="undo-toast">
          <span>"{undoPending.label}" deleted</span>
          <button className="btn secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={undoDelete}>
            Undo
          </button>
        </div>
      )}
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

      {priceError && (
        <div className="error-text section" style={{ marginTop: -10 }}>
          {priceError}
        </div>
      )}

      {accounts.length === 0 && (
        <div className="card empty-state">
          <Landmark size={30} />
          <div>
            No accounts yet. Add your bank accounts, investments, real estate, or loans to start
            tracking your net worth.
          </div>
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
                      {sorted.map(([inst, instRows]) => (
                        <tbody key={inst}>
                          <tr>
                            <td colSpan={showInstitution ? 6 : 5} style={{ background: 'var(--bg-inset)', color: 'var(--text-faint)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 14px' }}>
                              {inst}
                            </td>
                          </tr>
                          {instRows.map((a) => {
                            const SubtypeIcon = getSubtypeIcon(a.subtype)
                            return (
                              <tr key={a.id}>
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
                                    onClick={() => setCheckInTarget(a)}
                                  >
                                    <ICON_CHECK_IN size={15} />
                                  </button>
                                  <button
                                    className="icon-btn"
                                    style={{ marginRight: 6 }}
                                    title="View trend"
                                    aria-label="View trend"
                                    onClick={() => setTrendTarget(a)}
                                  >
                                    <ICON_TREND size={15} />
                                  </button>
                                  <ActionMenu
                                    items={[
                                      ...(SUPPORTS_TICKER.includes(a.subtype) && a.ticker
                                        ? [
                                            {
                                              icon: ICON_SYNC,
                                              label: refreshingId === a.id ? 'Refreshing price…' : 'Refresh price',
                                              onClick: () => refreshPrice(a.id)
                                            }
                                          ]
                                        : []),
                                      ...(a.category === 'loan' && a.document_path
                                        ? [
                                            {
                                              icon: ICON_SYNC,
                                              label: 'Update from document',
                                              onClick: () => openLoanSync(a)
                                            }
                                          ]
                                        : []),
                                      ...(a.document_path
                                        ? [
                                            {
                                              icon: ICON_VIEW,
                                              label: 'View',
                                              onClick: () => api().accounts.openDocument(a.document_path!)
                                            },
                                            {
                                              icon: ICON_DOWNLOAD,
                                              label: 'Download',
                                              onClick: () =>
                                                api().accounts.downloadDocument(
                                                  a.document_path!,
                                                  a.document_original_name
                                                )
                                            }
                                          ]
                                        : []),
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
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      ))}
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
                      return (
                        <tr key={a.id}>
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
                              onClick={() => setCheckInTarget(a)}
                            >
                              <ICON_CHECK_IN size={15} />
                            </button>
                            <button
                              className="icon-btn"
                              style={{ marginRight: 6 }}
                              title="View trend"
                              aria-label="View trend"
                              onClick={() => setTrendTarget(a)}
                            >
                              <ICON_TREND size={15} />
                            </button>
                            <ActionMenu
                              items={[
                                ...(SUPPORTS_TICKER.includes(a.subtype) && a.ticker
                                  ? [
                                      {
                                        icon: ICON_SYNC,
                                        label: refreshingId === a.id ? 'Refreshing price…' : 'Refresh price',
                                        onClick: () => refreshPrice(a.id)
                                      }
                                    ]
                                  : []),
                                ...(a.category === 'loan' && a.document_path
                                  ? [
                                      {
                                        icon: ICON_SYNC,
                                        label: 'Update from document',
                                        onClick: () => openLoanSync(a)
                                      }
                                    ]
                                  : []),
                                ...(a.document_path
                                  ? [
                                      {
                                        icon: ICON_VIEW,
                                        label: 'View',
                                        onClick: () => api().accounts.openDocument(a.document_path!)
                                      },
                                      {
                                        icon: ICON_DOWNLOAD,
                                        label: 'Download',
                                        onClick: () =>
                                          api().accounts.downloadDocument(
                                            a.document_path!,
                                            a.document_original_name
                                          )
                                      }
                                    ]
                                  : []),
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
    </div>
  )
}
