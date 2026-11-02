import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, Eye, EyeOff, Copy, Check, KeyRound, Search, ExternalLink } from 'lucide-react'
import type { VaultEntry, VaultCategory } from '../../../shared/types'
import { VAULT_CATEGORIES } from '../../../shared/types'
import VaultEntryModal from '../components/VaultEntryModal'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { ICON_EDIT, ICON_DELETE } from '../lib/actionIcons'
import { useUndoToast } from '../lib/useUndoToast'
import Tip from '../components/Tip'
import SummaryStrip from '../components/SummaryStrip'


export default function Vault(): JSX.Element {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const { offerUndo, undoToast } = useUndoToast()
  const [editing, setEditing] = useState<VaultEntry | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  // copiedId drives the brief ✓; countdownId keeps the "clears in Ns" hint on the
  // entry that was copied for the whole 30s (it used to vanish with the ✓ at 1.5s).
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [countdownId, setCountdownId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'changed'>('name')
  const [clipboardCountdown, setClipboardCountdown] = useState<number | null>(null)
  const clipboardIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const [pendingDelete, setPendingDelete] = useState<{ id: number; label: string } | null>(null)

  const load = async (): Promise<void> => {
    setEntries(await api().vault.list())
  }

  useEffect(() => {
    load()
    return () => {
      // Cleanup clipboard interval and reveal timers on unmount
      if (clipboardIntervalRef.current !== null) clearInterval(clipboardIntervalRef.current)
      revealTimersRef.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  const remove = (id: number, label: string): void => {
    setPendingDelete({ id, label })
  }

  const confirmRemove = async (): Promise<void> => {
    if (!pendingDelete) return
    const { id, label } = pendingDelete
    setPendingDelete(null)
    setEntries((prev) => prev.filter((e) => e.id !== id))
    await api().vault.remove(id)
    load()
    offerUndo(`"${label}"`, async () => {
      await api().vault.restore(id)
      load()
    })
  }

  const toggleReveal = (id: number): void => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        // Cancel auto-hide timer if user manually hides
        const existing = revealTimersRef.current.get(id)
        if (existing !== undefined) {
          clearTimeout(existing)
          revealTimersRef.current.delete(id)
        }
      } else {
        next.add(id)
        // Cancel any existing timer for this id
        const existing = revealTimersRef.current.get(id)
        if (existing !== undefined) clearTimeout(existing)
        // Auto-hide after 15 seconds
        const timer = setTimeout(() => {
          setRevealed((p) => {
            const n = new Set(p)
            n.delete(id)
            return n
          })
          revealTimersRef.current.delete(id)
        }, 15000)
        revealTimersRef.current.set(id, timer)
      }
      return next
    })
  }

  const copyPassword = async (entry: VaultEntry): Promise<void> => {
    if (!entry.password) return
    // Main process clears it after 30s, but only if it's still this password.
    await api().clipboard.writeSecret(entry.password, 30_000)
    setCopiedId(entry.id)
    setCountdownId(entry.id)
    // Start countdown from 30
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
    // Reset the UI indicator after 1.5s
    setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1500)
  }

  const getDomain = (url: string): string => {
    try {
      return new URL(url.startsWith('http') ? url : 'https://' + url).hostname
    } catch {
      return url
    }
  }

  // ── Password health ──
  // The same password on several logins is the biggest real risk here (one breach
  // opens them all), and nothing flagged it before — only length and age.
  const usesByPassword = new Map<string, number>()
  for (const e of entries) if (e.password) usesByPassword.set(e.password, (usesByPassword.get(e.password) ?? 0) + 1)
  const isReused = (e: VaultEntry): boolean => !!e.password && (usesByPassword.get(e.password) ?? 0) > 1
  const reusedCount = entries.filter(isReused).length
  const weakCount = entries.filter((e) => e.password && e.password.length < 8).length
  const oldCount = entries.filter((e) => {
    if (!e.password) return false
    if (!e.password_changed_at) return true
    return (Date.now() - new Date(e.password_changed_at).getTime()) / 86400000 > 365
  }).length

  const renderRows = (group: VaultEntry[], domainCounts: Map<string, number>): JSX.Element[] =>
    group.map((e) => {
      const isRevealed = revealed.has(e.id)
      // Age column calculation
      const ageCell = (() => {
        if (!e.password_changed_at) {
          return <td style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</td>
        }
        const days = Math.floor((Date.now() - new Date(e.password_changed_at).getTime()) / 86400000)
        const color = days > 365 ? 'var(--red)' : days > 180 ? 'var(--amber, #e8b14f)' : 'var(--text-faint)'
        const ageLabel = days < 30 ? `${days}d` : days < 365 ? `${Math.floor(days / 30)} mo` : `${Math.floor(days / 365)} yr`
        return <td style={{ fontSize: 11, color }}>{ageLabel}</td>
      })()
      return (
        <tr key={e.id}>
          <td>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {e.service_name}
              {isReused(e) && (
                <span className="badge warn" title={`This password is also used on ${(usesByPassword.get(e.password!) ?? 1) - 1} other login(s)`}>
                  Reused
                </span>
              )}
            </span>
            {e.url && (
              <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>
                {/* Just the site, not the whole URL; the full address is on hover. */}
                <span title={e.url}>{getDomain(e.url).replace(/^www\./, '')}</span>
                <button
                  className="icon-btn"
                  title={`Open ${e.url}`}
                  aria-label={`Open ${getDomain(e.url)}`}
                  style={{ marginLeft: 4, width: 24, height: 24 }}
                  onClick={() => window.open(e.url!.startsWith('http') ? e.url! : `https://${e.url}`, '_blank')}
                >
                  <ExternalLink size={12} />
                </button>
                {(() => {
                  const domain = getDomain(e.url)
                  const count = domainCounts.get(domain) ?? 0
                  if (count > 1) {
                    return <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 4 }} title="Multiple entries for this site">×{count}</span>
                  }
                  return null
                })()}
              </div>
            )}
          </td>
          <td>{e.username ?? '—'}</td>
          <td style={{ whiteSpace: 'nowrap' }}>
            <>
              {/* Monospace when revealed, so l/I/1 and O/0 can be told apart. */}
              <span style={isRevealed ? { fontFamily: 'ui-monospace, Consolas, "Cascadia Mono", monospace' } : undefined}>
                {isRevealed ? e.password ?? '—' : e.password ? '••••••••' : '—'}
              </span>
              {e.password && (
                <>
                  <button
                    className="icon-btn"
                    style={{ marginLeft: 6 }}
                    title={isRevealed ? 'Hide password' : 'Show password'}
                    aria-label={isRevealed ? 'Hide password' : 'Show password'}
                    onClick={() => toggleReveal(e.id)}
                  >
                    {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    className="icon-btn"
                    title={copiedId === e.id ? 'Copied' : 'Copy password'}
                    aria-label="Copy password"
                    onClick={() => copyPassword(e)}
                  >
                    {copiedId === e.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  {countdownId === e.id && clipboardCountdown !== null && (
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 4 }} title="Clipboard clears automatically">
                      clears in {clipboardCountdown}s
                    </span>
                  )}
                </>
              )}
            </>
          </td>
          {ageCell}
          <td style={{ textAlign: 'right' }}>
            <ActionMenu
              items={[
                {
                  icon: ICON_EDIT,
                  label: 'Edit',
                  onClick: () => {
                    setEditing(e)
                    setShowModal(true)
                  }
                },
                { icon: ICON_DELETE, label: 'Delete', danger: true, onClick: () => remove(e.id, e.service_name) }
              ]}
            />
          </td>
        </tr>
      )
    })

  const renderGrouped = (all: VaultEntry[]): JSX.Element => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? all.filter(
          (e) =>
            e.service_name.toLowerCase().includes(q) ||
            (e.username ?? '').toLowerCase().includes(q) ||
            (e.url ?? '').toLowerCase().includes(q)
        )
      : all

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (sortBy === 'changed') {
        const aTime = a.password_changed_at ? new Date(a.password_changed_at).getTime() : 0
        const bTime = b.password_changed_at ? new Date(b.password_changed_at).getTime() : 0
        if (bTime === 0 && aTime === 0) return 0
        if (bTime === 0) return -1
        if (aTime === 0) return 1
        return bTime - aTime
      }
      return a.service_name.toLowerCase().localeCompare(b.service_name.toLowerCase())
    })

    // Build domain → count map for URL deduplication (Item 40)
    const domainCounts = new Map<string, number>()
    for (const e of all) {
      if (e.url) {
        const domain = getDomain(e.url)
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)
      }
    }

    const byCategory = new Map<string, VaultEntry[]>()
    const categoryOrder = [...VAULT_CATEGORIES]
    for (const e of sorted) {
      const key: string = e.category ?? 'Uncategorized'
      if (!byCategory.has(key)) byCategory.set(key, [])
      byCategory.get(key)!.push(e)
    }
    const orderedKeys = [
      ...categoryOrder.filter((c) => byCategory.has(c)),
      ...(byCategory.has('Uncategorized') ? ['Uncategorized'] : [])
    ] as (VaultCategory | 'Uncategorized')[]

    return (
      <>
        {orderedKeys.map((cat) => (
          <div key={cat} style={{ marginBottom: 24 }}>
            {/* Was coloured with an undefined --muted var, so it rendered at full
                text brightness; now uses the shared section heading. */}
            <div className="section-header" style={{ marginBottom: 'var(--space-2)' }}>
              <h2>{cat}</h2>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Username</th>
                    <th>Password</th>
                    <th>Age</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>{renderRows(byCategory.get(cat)!, domainCounts)}</tbody>
              </table>
            </div>
          </div>
        ))}
      </>
    )
  }

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Vault
        </h1>
        <button
          className="btn"
          onClick={() => {
            setEditing(null)
            setShowModal(true)
          }}
        >
          <Plus size={14} /> Add login
        </button>
      </div>
      {entries.length > 0 && (
        <SummaryStrip
          stats={[
            { label: 'Logins', value: String(entries.length) },
            {
              label: 'Reused',
              value: String(reusedCount),
              tone: reusedCount > 0 ? 'bad' : 'good',
              hint: 'Logins sharing a password with another login. If one site leaks it, the others are open too.',
              note: reusedCount > 0 ? 'Give each a unique password — look for the “Reused” tag' : 'Every password is unique'
            },
            {
              label: 'Weak',
              value: String(weakCount),
              tone: weakCount > 0 ? 'warn' : 'good',
              hint: 'Passwords shorter than 8 characters.',
              note: weakCount > 0 && weakCount <= 3
                ? entries.filter((e) => e.password && e.password.length < 8).map((e) => e.service_name).join(', ')
                : undefined
            },
            {
              label: 'Not changed in a year',
              value: String(oldCount),
              tone: oldCount > 0 ? 'warn' : 'good',
              hint: 'Passwords not changed in over 12 months (or never recorded as changed).',
              note:
                oldCount > 0 ? (
                  // Honest label — this re-sorts the list, it doesn't filter it.
                  <button
                    className="cf-link-btn"
                    onClick={() => {
                      setSortBy('changed')
                      setSearch('')
                    }}
                  >
                    Sort by last changed
                  </button>
                ) : undefined
            }
          ]}
        />
      )}
      <Tip storageKey="artha_tip_vault">
        Passwords stay masked until you reveal them, and are protected by your master password. A copied password is
        cleared from the clipboard after 30 seconds.
      </Tip>

      {entries.length > 0 && (
        <div className="cf-filterbar-row" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="cf-search" style={{ maxWidth: 280 }}>
            <Search aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logins…" aria-label="Search logins" />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'recent' | 'changed')}
            aria-label="Sort logins"
            style={{ width: 'auto' }}
          >
            <option value="name">Sort: A → Z</option>
            <option value="recent">Sort: date added</option>
            <option value="changed">Sort: recently changed</option>
          </select>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="card empty-state">
          <KeyRound size={30} />
          <div>Your vault is empty. Add a login to get started.</div>
        </div>
      ) : (
        renderGrouped(entries)
      )}

      {showModal && (
        <VaultEntryModal
          entry={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            load()
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete entry"
        message={`Delete "${pendingDelete?.label}"? You can undo this for a few seconds after.`}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />

      {undoToast}
    </div>
  )
}
