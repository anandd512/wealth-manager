import { useEffect, useState } from 'react'
import { Plus, Eye, EyeOff, Copy, Check, KeyRound } from 'lucide-react'
import type { VaultEntry } from '../../../shared/types'
import VaultEntryModal from '../components/VaultEntryModal'
import ActionMenu from '../components/ActionMenu'
import { ICON_EDIT, ICON_DELETE } from '../lib/actionIcons'

export default function Vault(): JSX.Element {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [editing, setEditing] = useState<VaultEntry | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const load = async (): Promise<void> => {
    setEntries(await window.api.vault.list())
  }

  useEffect(() => {
    load()
  }, [])

  const remove = async (id: number): Promise<void> => {
    if (!confirm('Delete this login?')) return
    await window.api.vault.remove(id)
    load()
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
    setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1500)
  }

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Logins &amp; Passwords
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

      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Passwords are masked by default and protected the same way as the rest of your data — by
        your master password.
      </p>

      {entries.length === 0 ? (
        <div className="card empty-state">
          <KeyRound size={30} />
          <div>No logins saved yet.</div>
        </div>
      ) : (
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
            <tbody>
              {entries.map((e) => {
                const isRevealed = revealed.has(e.id)
                return (
                  <tr key={e.id}>
                    <td>
                      {e.service_name}
                      {e.url && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {e.url}
                        </div>
                      )}
                    </td>
                    <td>{e.username ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
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
                          { icon: ICON_DELETE, label: 'Delete', danger: true, onClick: () => remove(e.id) }
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
