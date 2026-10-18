import { useState } from 'react'
import type { VaultEntry, VaultEntryInput, VaultCategory } from '../../../shared/types'
import { VAULT_CATEGORIES } from '../../../shared/types'

interface Props {
  entry: VaultEntry | null
  onClose: () => void
  onSaved: () => void
}

export default function VaultEntryModal({ entry, onClose, onSaved }: Props): JSX.Element {
  const [serviceName, setServiceName] = useState(entry?.service_name ?? '')
  const [category, setCategory] = useState<VaultCategory | ''>(entry?.category ?? '')
  const [url, setUrl] = useState(entry?.url ?? '')
  const [username, setUsername] = useState(entry?.username ?? '')
  const [password, setPassword] = useState(entry?.password ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    setError(null)
    if (!serviceName.trim()) {
      setError('Service / account name is required')
      return
    }
    const input: VaultEntryInput = {
      service_name: serviceName.trim(),
      category: (category as VaultCategory) || null,
      url: url.trim() || null,
      username: username.trim() || null,
      password: password || null,
      notes: notes.trim() || null
    }
    setBusy(true)
    try {
      if (entry) await window.api.vault.update(entry.id, input)
      else await window.api.vault.create(input)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{entry ? 'Edit login' : 'Add login'}</h2>

        <div className="form-row">
          <div className="field">
            <label>Service / account name</label>
            <input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g. Zerodha, Gmail"
            />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as VaultCategory | '')}>
              <option value="">— Select category —</option>
              {VAULT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Website (optional)</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="e.g. kite.zerodha.com" />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Username / ID</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
