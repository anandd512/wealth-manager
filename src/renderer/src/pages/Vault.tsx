import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, Eye, EyeOff, Copy, Check, KeyRound, Search, ExternalLink } from 'lucide-react'
import type { VaultEntry, VaultCategory } from '../../../shared/types'
import { VAULT_CATEGORIES } from '../../../shared/types'
import VaultEntryModal from '../components/VaultEntryModal'
import ActionMenu from '../components/ActionMenu'
import { ICON_EDIT, ICON_DELETE } from '../lib/actionIcons'

async function computeTotp(base32: string): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const s = base32.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0, val = 0
  const bytes: number[] = []
  for (const c of s) {
    val = (val << 5) | chars.indexOf(c)
    bits += 5
    if (bits >= 8) { bytes.push((val >> (bits - 8)) & 0xff); bits -= 8 }
  }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const T = Math.floor(Date.now() / 30000)
  const tb = new Uint8Array(8)
  let t = T
  for (let i = 7; i >= 0; i--) { tb[i] = t & 0xff; t = Math.floor(t / 256) }
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, tb))
  const off = sig[19] & 0xf
  const code = ((sig[off] & 0x7f) << 24 | sig[off+1] << 16 | sig[off+2] << 8 | sig[off+3]) % 1000000
  return String(code).padStart(6, '0')
}

function TotpCell({ secret }: { secret: string }): JSX.Element {
  const [code, setCode] = useState('......')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let cancelled = false
    const refresh = async (): Promise<void> => {
      const c = await computeTotp(secret)
      if (!cancelled) setCode(c)
    }
    refresh()
    const id = setInterval(refresh, 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [secret])
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2 }}>{code}</span>
      <button className="icon-btn" onClick={copy} title="Copy TOTP code">
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  )
}

export default function Vault(): JSX.Element {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [editing, setEditing] = useState<VaultEntry | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'recent'>('name')
  const [undoPending, setUndoPending] = useState<{ id: number; label: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (): Promise<void> => {
    setEntries(await api().vault.list())
  }

  useEffect(() => {
    load()
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
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyPassword = async (entry: VaultEntry): Promise<void> => {
    if (!entry.password) return
    await navigator.clipboard.writeText(entry.password)
    setCopiedId(entry.id)
    // Reset the UI indicator after 1.5s
    setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1500)
    // Auto-clear clipboard after 30s for security
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30_000)
  }

  const renderRows = (group: VaultEntry[]): JSX.Element[] =>
    group.map((e) => {
      const isRevealed = revealed.has(e.id)
      const isNote = e.entry_type === 'note'
      return (
        <tr key={e.id}>
          <td>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {isNote && <span style={{ marginRight: 4 }}>📝</span>}
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
              </div>
            )}
          </td>
          <td>{e.username ?? '—'}</td>
          <td style={{ whiteSpace: 'nowrap' }}>
            {isNote ? (
              <span className="muted">—</span>
            ) : (
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
                    {e.password_changed_at && (() => {
                      const days = Math.floor((Date.now() - new Date(e.password_changed_at!).getTime()) / 86400000)
                      const color = days > 365 ? 'var(--red)' : days > 180 ? 'var(--amber)' : 'var(--text-faint)'
                      return <span style={{ fontSize: 10, color, marginLeft: 4 }}>{days}d</span>
                    })()}
                  </>
                )}
                {e.totp_secret && <TotpCell secret={e.totp_secret} />}
              </>
            )}
          </td>
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
      return a.service_name.toLowerCase().localeCompare(b.service_name.toLowerCase())
    })

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
                    <th>Username / ID</th>
                    <th>Password</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>{renderRows(byCategory.get(cat)!)}</tbody>
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              style={{ paddingLeft: 30, width: 200 }}
            />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'recent')} style={{ fontSize: 12, padding: '4px 8px' }}>
            <option value="name">A → Z</option>
            <option value="recent">Recently added</option>
          </select>
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
      </div>

      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Passwords are masked by default and protected by your master password. Clipboard clears automatically after 30 seconds.
      </p>

      {entries.length === 0 ? (
        <div className="card empty-state">
          <KeyRound size={30} />
          <div>No logins saved yet.</div>
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
