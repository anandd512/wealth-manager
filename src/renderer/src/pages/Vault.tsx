import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, Eye, EyeOff, Copy, Check, KeyRound, Search, ExternalLink } from 'lucide-react'
import type { VaultEntry, VaultCategory } from '../../../shared/types'
import { VAULT_CATEGORIES } from '../../../shared/types'
import VaultEntryModal from '../components/VaultEntryModal'
import ActionMenu from '../components/ActionMenu'
import { ICON_EDIT, ICON_DELETE } from '../lib/actionIcons'


export default function Vault(): JSX.Element {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [editing, setEditing] = useState<VaultEntry | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'changed'>('name')
  const [undoPending, setUndoPending] = useState<{ id: number; label: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [clipboardCountdown, setClipboardCountdown] = useState<number | null>(null)
  const clipboardIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

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
    // Optimistically remove from UI
    setEntries((prev) => prev.filter((e) => e.id !== id))
    // Cancel any previous pending delete
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoPending({ id, label })
    undoTimerRef.current = setTimeout(async () => {
      setUndoPending(null)
      await api().vault.remove(id)
      load()
    }, 5000)
  }

  const undoDelete = (): void => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoPending(null)
    load()  // Restore from server
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
    await navigator.clipboard.writeText(entry.password)
    setCopiedId(entry.id)
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
    // Auto-clear clipboard after 30s for security
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30_000)
  }

  const getDomain = (url: string): string => {
    try {
      return new URL(url.startsWith('http') ? url : 'https://' + url).hostname
    } catch {
      return url
    }
  }

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
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {e.service_name}
            </span>
            {e.url && (
              <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>
                {e.url}
                <button
                  className="icon-btn"
                  title={`Open ${e.url}`}
                  style={{ marginLeft: 4 }}
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
              <span>{isRevealed ? e.password ?? '—' : e.password ? '••••••••' : '—'}</span>
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
                  {copiedId === e.id && clipboardCountdown !== null && (
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 4 }}>{clipboardCountdown}s</span>
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
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 6,
                paddingLeft: 2
              }}
            >
              {cat}
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
      {(() => {
        const now = Date.now()
        const oldPasswords = entries.filter((e) => {
          if (!e.password) return false
          if (!e.password_changed_at) return true
          return (now - new Date(e.password_changed_at).getTime()) / 86400000 > 365
        })
        const weakPasswords = entries.filter((e) => e.password && e.password.length < 8)
        if (oldPasswords.length === 0 && weakPasswords.length === 0) return null
        return (
          <div style={{ background: 'rgba(232,177,79,0.08)', border: '1px solid rgba(232,177,79,0.3)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: 'var(--text-dim)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {oldPasswords.length > 0 && (
              <button
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12.5, padding: 0, textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
                title="Filter to show only passwords older than 1 year"
                onClick={() => { setSortBy('changed'); setSearch('') }}
              >
                ⚠ {oldPasswords.length} password{oldPasswords.length > 1 ? 's' : ''} not updated in over a year — click to review
              </button>
            )}
            {weakPasswords.length > 0 && (
              <span title={weakPasswords.map(e => e.service_name).join(', ')}>
                ⚠ {weakPasswords.length} weak password{weakPasswords.length > 1 ? 's' : ''} (under 8 characters){weakPasswords.length <= 3 ? `: ${weakPasswords.map(e => e.service_name).join(', ')}` : ''}
              </span>
            )}
          </div>
        )
      })()}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, marginTop: -4 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ paddingLeft: 30, width: 200 }}
          />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'recent' | 'changed')} style={{ fontSize: 12, padding: '4px 8px' }}>
          <option value="name">A → Z</option>
          <option value="recent">Date added</option>
          <option value="changed">Recently changed</option>
        </select>
      </div>

      <p className="muted" style={{ marginBottom: 20 }}>
        Passwords are masked by default and protected by your master password. Clipboard clears automatically after 30 seconds.
      </p>

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
    </div>
  )
}
