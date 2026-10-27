import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  fileName: string
  error: string | null
  busy: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
}

// Mirrors VaultEntryModal's modal shell + show/hide password field, and AuthGate's
// retry-on-error behavior — a wrong password just shows an inline error and leaves
// the modal open for another attempt, rather than closing or resetting the input.
export default function PdfPasswordModal({ fileName, error, busy, onSubmit, onCancel }: Props): JSX.Element {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)

  const submit = (): void => {
    if (!password || busy) return
    onSubmit(password)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Password required</h2>
        <div className="help-text" style={{ marginBottom: 12 }}>
          "{fileName}" is password-protected. The password is used locally to unlock it and is never sent anywhere
          or saved.
        </div>

        <div className="field">
          <label>PDF password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              style={{ paddingRight: 36 }}
            />
            <div style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>
              <button
                type="button"
                className="icon-btn"
                title={showPw ? 'Hide' : 'Show'}
                onClick={() => setShowPw((v) => !v)}
                style={{ width: 26, height: 26 }}
              >
                {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </div>
        </div>

        <div className="help-text" style={{ marginTop: 6, fontSize: 12 }}>
          Most Indian bank/card statements use your PAN (e.g. ABCDE1234F) or date of birth (DDMMYYYY) as the
          password — check the email the statement came from if neither works.
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <button className="btn secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={busy || !password}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  )
}
