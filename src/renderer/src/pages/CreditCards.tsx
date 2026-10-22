import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, CreditCard as CreditCardGlyph, Check, X, Eye, EyeOff, Copy, Power } from 'lucide-react'
import type { CreditCard, UpcomingItem } from '../../../shared/types'
import { cardDigits, formatCardNumber, maskCardNumber } from '../lib/cardNumber'

import CreditCardModal from '../components/CreditCardModal'
import MiniCard from '../components/MiniCard'
import ActionMenu from '../components/ActionMenu'
import { ICON_EDIT, ICON_DELETE } from '../lib/actionIcons'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export default function CreditCards(): JSX.Element {
  const [cards, setCards] = useState<CreditCard[]>([])
  const [dueByCardId, setDueByCardId] = useState<Map<number, UpcomingItem>>(new Map())
  const [editing, setEditing] = useState<CreditCard | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [undoPending, setUndoPending] = useState<{ id: number; label: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [copiedId, setCopiedId] = useState<number | null>(null)
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
    await navigator.clipboard.writeText(digits)
    setCopiedId(card.id)
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
    // Auto-clear clipboard after 30s for security
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30_000)
  }

  const toggleStatus = async (card: CreditCard): Promise<void> => {
    await api().creditCards.update(card.id, {
      status: card.status === 'disabled' ? 'active' : 'disabled'
    })
    load()
  }

  const remove = (id: number, label: string): void => {
    setCards((prev) => prev.filter((c) => c.id !== id))
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoPending({ id, label })
    undoTimerRef.current = setTimeout(async () => {
      setUndoPending(null)
      await api().creditCards.remove(id)
      load()
    }, 5000)
  }

  const undoDelete = (): void => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoPending(null)
    load()
  }

  const resolveDue = async (item: UpcomingItem, status: 'paid' | 'dismissed'): Promise<void> => {
    await api().dashboard.dismiss(item.itemType, item.itemId, item.dueDate, status)
    load()
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

      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Card numbers show only the last 4 digits until you reveal them.
      </p>

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
                <th>Network</th>
                <th>Number</th>
                <th>Expiry</th>
                <th>Statement date</th>
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
                const rowStyle = disabled
                  ? { opacity: 0.55 }
                  : daysUntilDue != null && daysUntilDue <= 3
                    ? { background: 'rgba(239,91,91,0.04)' }
                    : undefined
                return (
                  <tr key={c.id} className={due ? 'row-due' : undefined} style={rowStyle}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <MiniCard card={c} />
                        <span>{c.nickname}</span>
                      </div>
                    </td>
                    <td className="muted">{c.issuer ?? '—'}</td>
                    <td className="muted">{c.network ?? '—'}</td>
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
                          {copiedId === c.id && clipboardCountdown !== null && (
                            <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 4 }}>
                              {clipboardCountdown}s
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="muted">
                      {c.expiry_month && c.expiry_year
                        ? `${String(c.expiry_month).padStart(2, '0')}/${String(c.expiry_year % 100).padStart(2, '0')}`
                        : '—'}
                    </td>
                    <td className="muted">
                      {c.statement_day != null ? ordinal(c.statement_day) : '—'}
                      {daysUntilDue != null && daysUntilDue <= 7 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginLeft: 6 }}>
                          Due in {daysUntilDue}d
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${disabled ? 'neutral' : 'ok'}`}>
                        {disabled ? 'Disabled' : 'Active'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <ActionMenu
                        items={[
                          ...(due
                            ? [
                                { icon: Check, label: 'Mark as paid', onClick: () => resolveDue(due, 'paid') },
                                { icon: X, label: 'Ignore', onClick: () => resolveDue(due, 'dismissed') }
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
    </div>
  )
}
