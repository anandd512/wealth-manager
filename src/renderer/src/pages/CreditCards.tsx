import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, CreditCard as CreditCardGlyph, Check, X, Eye, EyeOff, Copy, Power } from 'lucide-react'
import type { CreditCard, UpcomingItem } from '../../../shared/types'
import { cardDigits, formatCardNumber, maskCardNumber } from '../lib/cardNumber'

import CreditCardModal from '../components/CreditCardModal'
import MiniCard from '../components/MiniCard'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { ICON_EDIT, ICON_DELETE } from '../lib/actionIcons'
import { useUndoToast } from '../lib/useUndoToast'
import { formatCurrency, formatDate, formatDateShort } from '../lib/format'
import Tip from '../components/Tip'
import SummaryStrip from '../components/SummaryStrip'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export default function CreditCards(): JSX.Element {
  const [cards, setCards] = useState<CreditCard[]>([])
  const { offerUndo, undoToast } = useUndoToast()
  const [dueByCardId, setDueByCardId] = useState<Map<number, UpcomingItem>>(new Map())
  const [editing, setEditing] = useState<CreditCard | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: number; label: string } | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  // copiedId drives the brief ✓; countdownId keeps the "clears in Ns" hint on the
  // card that was copied for the whole 30s (it used to vanish with the ✓ at 1.5s).
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [countdownId, setCountdownId] = useState<number | null>(null)
  const [clipboardCountdown, setClipboardCountdown] = useState<number | null>(null)
  const clipboardIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const load = async (): Promise<void> => {
    const [cardList, upcoming] = await Promise.all([
      api().creditCards.list(),
      api().dashboard.upcoming()
    ])
    setCards(cardList)
    setDueByCardId(
      new Map(
        (upcoming as UpcomingItem[])
          .filter((i) => i.itemType === 'credit_card')
          .map((i) => [i.itemId, i])
      )
    )
  }

  useEffect(() => {
    load()
    return () => {
      if (clipboardIntervalRef.current !== null) clearInterval(clipboardIntervalRef.current)
      revealTimersRef.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  const toggleReveal = (id: number): void => {
    const existing = revealTimersRef.current.get(id)
    if (existing !== undefined) {
      clearTimeout(existing)
      revealTimersRef.current.delete(id)
    }
    if (revealed.has(id)) {
      setRevealed((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      return
    }
    setRevealed((prev) => new Set(prev).add(id))
    // Auto-hide after 15 seconds
    revealTimersRef.current.set(
      id,
      setTimeout(() => {
        setRevealed((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        revealTimersRef.current.delete(id)
      }, 15000)
    )
  }

  const copyNumber = async (card: CreditCard): Promise<void> => {
    const digits = cardDigits(card.card_number)
    if (!digits) return
    // Main process clears it after 30s, but only if it's still this number.
    await api().clipboard.writeSecret(digits, 30_000)
    setCopiedId(card.id)
    setCountdownId(card.id)
    if (clipboardIntervalRef.current !== null) clearInterval(clipboardIntervalRef.current)
    setClipboardCountdown(30)
    clipboardIntervalRef.current = setInterval(() => {
      setClipboardCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (clipboardIntervalRef.current !== null) {
            clearInterval(clipboardIntervalRef.current)
            clipboardIntervalRef.current = null
          }
          return null
        }
        return prev - 1
      })
    }, 1000)
    setTimeout(() => setCopiedId((id) => (id === card.id ? null : id)), 1500)
  }

  const toggleStatus = async (card: CreditCard): Promise<void> => {
    await api().creditCards.update(card.id, {
      status: card.status === 'disabled' ? 'active' : 'disabled'
    })
    load()
  }

  const remove = (id: number, label: string): void => {
    setPendingDelete({ id, label })
  }

  const confirmRemove = async (): Promise<void> => {
    if (!pendingDelete) return
    const { id, label } = pendingDelete
    setPendingDelete(null)
    setCards((prev) => prev.filter((c) => c.id !== id))
    await api().creditCards.remove(id)
    load()
    offerUndo(`"${label}"`, async () => {
      await api().creditCards.restore(id)
      load()
    })
  }

  const resolveDue = async (item: UpcomingItem, status: 'paid' | 'dismissed'): Promise<void> => {
    await api().dashboard.dismiss(item.itemType, item.itemId, item.dueDate, status)
    load()
  }

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Credit Cards
        </h1>
        <button
          className="btn"
          onClick={() => {
            setEditing(null)
            setShowModal(true)
          }}
        >
          <Plus size={14} /> Add card
        </button>
      </div>

      <Tip storageKey="artha_tip_cards">
        Card numbers show only the last 4 digits until you reveal them, and a copied number is cleared from the
        clipboard after 30 seconds.
      </Tip>

      {cards.length > 0 &&
        (() => {
          const active = cards.filter((c) => c.status !== 'disabled')
          const limit = active.reduce((s, c) => s + (c.credit_limit ?? 0), 0)
          const withoutLimit = active.filter((c) => c.credit_limit == null).length
          const dues = active
            .map((c) => ({ card: c, due: dueByCardId.get(c.id) }))
            .filter((x): x is { card: CreditCard; due: UpcomingItem } => x.due !== undefined)
            .sort((a, b) => a.due.daysLeft - b.due.daysLeft)
          const next = dues[0]
          const thisWeek = dues.filter((d) => d.due.daysLeft <= 7).length
          return (
            <SummaryStrip
              stats={[
                {
                  label: 'Active cards',
                  value: String(active.length),
                  note: cards.length > active.length ? `${cards.length - active.length} disabled` : undefined
                },
                {
                  label: 'Total credit limit',
                  value: formatCurrency(limit),
                  hint: 'Sum of the credit limits on your active cards.',
                  note: withoutLimit > 0 ? `${withoutLimit} card${withoutLimit === 1 ? '' : 's'} without a limit set` : undefined
                },
                {
                  label: 'Next payment due',
                  value: next ? (next.due.daysLeft <= 0 ? 'Today' : `${next.due.daysLeft} days`) : 'Nothing due',
                  tone: next && next.due.daysLeft <= 3 ? 'warn' : undefined,
                  note: next ? `${next.card.nickname} · ${formatDateShort(next.due.dueDate)}` : undefined
                },
                {
                  label: 'Due this week',
                  value: String(thisWeek),
                  tone: thisWeek > 0 ? 'warn' : undefined,
                  hint: 'Card bills due in the next 7 days that you haven’t marked as paid.'
                }
              ]}
            />
          )
        })()}

      {cards.length === 0 ? (
        <div className="card empty-state">
          <CreditCardGlyph size={30} />
          <div>Add your credit cards to track payment dates and never pay a late fee.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Issuer</th>
                <th>Number</th>
                <th>Expiry</th>
                <th>Statement</th>
                <th>Next payment due</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const disabled = c.status === 'disabled'
                const due = disabled ? undefined : dueByCardId.get(c.id)
                const daysUntilDue = due != null ? due.daysLeft : null
                const isRevealed = revealed.has(c.id)
                const hasNumber = cardDigits(c.card_number).length > 0
                // One "due" highlight (the row-due class); the extra hardcoded red tint
                // within 3 days stacked a second, theme-blind colour on top of it.
                return (
                  <tr key={c.id} className={due ? 'row-due' : undefined} style={disabled ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <MiniCard card={c} />
                        <span>{c.nickname}</span>
                      </div>
                    </td>
                    <td className="muted">{c.issuer ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {!hasNumber
                          ? '—'
                          : isRevealed
                            ? formatCardNumber(c.card_number, c.network)
                            : maskCardNumber(c.card_number, c.network)}
                      </span>
                      {hasNumber && (
                        <>
                          <button
                            className="icon-btn"
                            style={{ marginLeft: 6 }}
                            title={isRevealed ? 'Hide card number' : 'Show card number'}
                            aria-label={isRevealed ? 'Hide card number' : 'Show card number'}
                            onClick={() => toggleReveal(c.id)}
                          >
                            {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button
                            className="icon-btn"
                            title={copiedId === c.id ? 'Copied' : 'Copy card number'}
                            aria-label="Copy card number"
                            onClick={() => copyNumber(c)}
                          >
                            {copiedId === c.id ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                          {countdownId === c.id && clipboardCountdown !== null && (
                            <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 4 }} title="Clipboard clears automatically">
                              clears in {clipboardCountdown}s
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {c.expiry_month && c.expiry_year
                        ? `${String(c.expiry_month).padStart(2, '0')}/${String(c.expiry_year % 100).padStart(2, '0')}`
                        : '—'}
                      {(() => {
                        // A card is valid through the last day of its expiry month.
                        if (!c.expiry_month || !c.expiry_year || disabled) return null
                        const lastDay = new Date(c.expiry_year, c.expiry_month, 0)
                        const days = Math.ceil((lastDay.getTime() - Date.now()) / 86400000)
                        if (days < 0) return <span className="badge danger" style={{ marginLeft: 6 }}>Expired</span>
                        if (days <= 60) return <span className="badge warn" style={{ marginLeft: 6 }}>Expires soon</span>
                        return null
                      })()}
                    </td>
                    <td className="muted">{c.statement_day != null ? ordinal(c.statement_day) : '—'}</td>
                    {/* The payment date is what matters — it used to appear only as tiny
                        red text inside the statement column, and only within 7 days. */}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {due ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span title={formatDate(due.dueDate)}>{formatDateShort(due.dueDate)}</span>
                          {daysUntilDue != null && daysUntilDue <= 7 && (
                            <span className={`badge ${daysUntilDue <= 3 ? 'danger' : 'warn'}`}>
                              {daysUntilDue <= 0 ? 'Today' : `${daysUntilDue}d`}
                            </span>
                          )}
                          <button className="btn secondary small" onClick={() => resolveDue(due, 'paid')} title={due.actionLabel}>
                            <Check size={13} /> Mark paid
                          </button>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {/* Only the exception is labelled — "Active" on every row was noise. */}
                      {disabled && <span className="badge neutral">Disabled</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <ActionMenu
                        items={[
                          ...(due
                            ? [
                                // "Mark paid" is a visible button in the Next payment due column.
                                { icon: X, label: 'Ignore this bill', onClick: () => resolveDue(due, 'dismissed') }
                              ]
                            : []),
                          {
                            icon: Power,
                            label: disabled ? 'Mark as active' : 'Disable card',
                            onClick: () => toggleStatus(c)
                          },
                          {
                            icon: ICON_EDIT,
                            label: 'Edit',
                            onClick: () => {
                              setEditing(c)
                              setShowModal(true)
                            }
                          },
                          { icon: ICON_DELETE, label: 'Delete', danger: true, onClick: () => remove(c.id, c.nickname) }
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

      {showModal && (
        <CreditCardModal
          card={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            load()
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete card"
        message={`Delete "${pendingDelete?.label}"? You can undo this for a few seconds after.`}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />

      {undoToast}
    </div>
  )
}
