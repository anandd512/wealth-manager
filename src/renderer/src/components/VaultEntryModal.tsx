import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { VaultEntry, VaultEntryInput, VaultCategory } from '../../../shared/types'
import { VAULT_CATEGORIES } from '../../../shared/types'

interface Props {
  entry: VaultEntry | null
  onClose: () => void
  onSaved: () => void
}

interface GenOptions {
  upper: boolean
  lower: boolean
  numbers: boolean
  symbols: boolean
}

function generatePassword(length = 16, opts: GenOptions = { upper: true, lower: true, numbers: true, symbols: true }): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower   = 'abcdefghijkmnpqrstuvwxyz'
  const digits  = '23456789'
  const special = '!@#$%&*'
  const pools: string[] = []
  if (opts.upper)   pools.push(upper)
  if (opts.lower)   pools.push(lower)
  if (opts.numbers) pools.push(digits)
  if (opts.symbols) pools.push(special)
  if (pools.length === 0) pools.push(lower)
  const all = pools.join('')
  const arr = new Uint8Array(Math.max(length, pools.length + 1))
  crypto.getRandomValues(arr)
  // One guaranteed character from each enabled pool
  let pw = pools.map((pool, i) => pool[arr[i] % pool.length])
  // Fill the rest
  for (let i = pools.length; i < length; i++) {
    pw.push(all[arr[i] % all.length])
  }
  // Shuffle
  for (let i = pw.length - 1; i > 0; i--) {
    const j = arr[i % arr.length] % (i + 1)
    ;[pw[i], pw[j]] = [pw[j], pw[i]]
  }
  return pw.join('')
}

const getStrength = (pw: string): { score: 0|1|2|3|4; label: string; color: string } => {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  score = Math.min(score, 4) as 0|1|2|3|4
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', 'var(--red)', '#e8b14f', 'var(--accent)', 'var(--green)']
  return { score: score as 0|1|2|3|4, label: labels[score], color: colors[score] }
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
  const [genOpts, setGenOpts] = useState<GenOptions>({ upper: true, lower: true, numbers: true, symbols: true })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

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
            <label>Username</label>
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
              const s = getStrength(password)
              return (
                <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 4 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 999, background: i <= s.score ? s.color : 'var(--border)', transition: 'background 200ms' }} />
                  ))}
                  <span style={{ fontSize: 10, color: s.color, marginLeft: 4, minWidth: 36 }}>{s.label}</span>
                </div>
              )
            })()}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>Length: {pwLength}</span>
              <input
                type="range" min={8} max={32} value={pwLength}
                onChange={e => setPwLength(Number(e.target.value))}
                style={{ width: 70 }}
              />
              <button type="button" className="btn secondary" style={{ padding: '3px 10px', fontSize: 11, marginLeft: 'auto' }}
                onClick={() => { setPassword(generatePassword(pwLength, genOpts)); setShowPw(true) }}>
                Generate
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
              {([
                { key: 'upper',   label: 'A–Z' },
                { key: 'lower',   label: 'a–z' },
                { key: 'numbers', label: '0–9' },
                { key: 'symbols', label: '!@#' },
              ] as { key: keyof GenOptions; label: string }[]).map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={genOpts[key]}
                    onChange={e => setGenOpts(prev => ({ ...prev, [key]: e.target.checked }))}
                    style={{ width: 12, height: 12 }}
                  />
                  {label}
                </label>
              ))}
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
