import { api } from '../lib/api'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { VaultEntry, VaultEntryInput, VaultCategory } from '../../../shared/types'
import { VAULT_CATEGORIES } from '../../../shared/types'

interface Props {
  entry: VaultEntry | null
  onClose: () => void
  onSaved: () => void
}

function generatePassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '!@#$%&*'
  const all = upper + lower + digits + special
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  // Ensure at least one of each type
  let pw = [
    upper[arr[0] % upper.length],
    lower[arr[1] % lower.length],
    digits[arr[2] % digits.length],
    special[arr[3] % special.length],
    ...Array.from({ length: length - 4 }, (_, i) => all[arr[4 + i] % all.length])
  ]
  // Shuffle
  for (let i = pw.length - 1; i > 0; i--) {
    const j = arr[i % arr.length] % (i + 1)
    ;[pw[i], pw[j]] = [pw[j], pw[i]]
  }
  return pw.join('')
}

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: 'transparent' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong']
  const colors = ['transparent', 'var(--red)', 'var(--amber)', 'var(--amber)', 'var(--green)', 'var(--green)']
  return { score, label: labels[score] ?? 'Strong', color: colors[score] ?? 'var(--green)' }
}

export default function VaultEntryModal({ entry, onClose, onSaved }: Props): JSX.Element {
  const [serviceName, setServiceName] = useState(entry?.service_name ?? '')
  const [category, setCategory] = useState<VaultCategory | ''>(entry?.category ?? '')
  const [url, setUrl] = useState(entry?.url ?? '')
  const [username, setUsername] = useState(entry?.username ?? '')
  const [password, setPassword] = useState(entry?.password ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [showPw, setShowPw] = useState(false)
  const [pwLength, setPwLength] = useState(16)
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
      notes: notes.trim() || null,
      totp_secret: null,
      entry_type: 'login'
    }
    setBusy(true)
    try {
      if (entry) await api().vault.update(entry.id, input)
      else await api().vault.create(input)
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
        <h2>{entry ? 'Edit entry' : 'Add entry'}</h2>

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
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: 36 }}
              />
              <div style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2 }}>
                <button
                  type="button"
                  className="icon-btn"
                  title={showPw ? 'Hide' : 'Show'}
                  onClick={() => setShowPw(v => !v)}
                  style={{ width: 26, height: 26 }}
                >
                  {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>
            {password && (() => {
              const s = passwordStrength(password)
              return (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= s.score ? s.color : 'var(--border)' }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: s.color }}>{s.label}</div>
                </div>
              )
            })()}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Length: {pwLength}</span>
              <input
                type="range" min={12} max={32} value={pwLength}
                onChange={e => setPwLength(Number(e.target.value))}
                style={{ width: 80 }}
              />
              <button type="button" className="btn secondary" style={{ padding: '3px 10px', fontSize: 11 }}
                onClick={() => { setPassword(generatePassword(pwLength)); setShowPw(true) }}>
                Generate
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Recovery codes, WiFi passwords, PINs, security questions…"
          />
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
