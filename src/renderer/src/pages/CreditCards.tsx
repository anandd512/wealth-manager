import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, Eye, EyeOff, CreditCard as CreditCardGlyph, Check, X } from 'lucide-react'
import type { CreditCard, UpcomingItem } from '../../../shared/types'
import { formatCurrency, formatDate } from '../lib/format'
import CreditCardModal from '../components/CreditCardModal'
import ActionMenu from '../components/ActionMenu'
import { ICON_EDIT, ICON_DELETE } from '../lib/actionIcons'

function maskNumber(num: string | null): string {
  if (!num) return '—'
  const digits = num.replace(/\s/g, '')
  if (digits.length <= 4) return digits
  return `•••• ${digits.slice(-4)}`
}

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
  const [revealedCvv, setRevealedCvv] = useState<Set<number>>(new Set())
  const [undoPending, setUndoPending] = useState<{ id: number; label: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  }, [])

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

  const toggleCvv = (id: number): void => {
    setRevealedCvv((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
        Card numbers show only the last 4 digits. CVV is masked by default — click the eye icon to
        reveal it.
      </p>

      {cards.length === 0 ? (
        <div className="card empty-state">
          <CreditCardGlyph size={30} />
          <div>No cards added yet.</div>
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
                <th>CVV</th>
                <th>Limit</th>
                <th>Utilisation</th>
                <th>Statement date</th>
                <th>Due date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const isCvvRevealed = revealedCvv.has(c.id)
                const due = dueByCardId.get(c.id)
                return (
                  <tr key={c.id} className={due ? 'row-due' : undefined}>
                    <td>{c.nickname}</td>
                    <td className="muted">{c.issuer ?? '—'}</td>
                    <td className="muted">{c.network ?? '—'}</td>
                    <td>{maskNumber(c.card_number)}</td>
                    <td className="muted">
                      {c.expiry_month && c.expiry_year
                        ? `${String(c.expiry_month).padStart(2, '0')}/${c.expiry_year}`
                        : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span>{isCvvRevealed ? c.cvv ?? '—' : c.cvv ? '•••' : '—'}</span>
                      {c.cvv && (
                        <button
                          className="icon-btn"
                          style={{ marginLeft: 6 }}
                          title={isCvvRevealed ? 'Hide CVV' : 'Show CVV'}
                          aria-label={isCvvRevealed ? 'Hide CVV' : 'Show CVV'}
                          onClick={() => toggleCvv(c.id)}
                        >
                          {isCvvRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                    </td>
                    <td className="muted">
                      {c.credit_limit != null ? formatCurrency(c.credit_limit) : '—'}
                    </td>
                    <td>
                      {c.credit_limit && c.outstanding_balance != null ? (
                        (() => {
                          const pct = Math.round((c.outstanding_balance / c.credit_limit) * 100)
                          const color = pct >= 75 ? 'var(--red)' : pct >= 40 ? 'var(--amber)' : 'var(--green)'
                          return (
                            <span style={{ color, fontWeight: 600 }}>
                              {pct}%
                              <div style={{ width: 50, height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 2 }}>
                                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
                              </div>
                            </span>
                          )
                        })()
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">
                      {c.statement_day != null ? `${ordinal(c.statement_day)} of month` : '—'}
                    </td>
                    <td>
                      {due ? (
                        <span className={`badge ${due.daysLeft <= 5 ? 'danger' : 'warn'}`}>
                          {formatDate(due.dueDate)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
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
