import { useEffect, useState } from 'react'
import { Mail, ArrowLeft, Loader2 } from 'lucide-react'
import type { CloudStatus } from '../../../shared/types'

interface Props {
  onSignedIn: (status: CloudStatus) => void
}

type Busy = null | 'google' | 'microsoft' | 'send' | 'verify'

function GoogleMark(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function MicrosoftMark(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

/** Google, Microsoft, or an emailed 6-digit code — never a password. Shared by the
 * first-run cloud gate and Settings → Cloud Sync. */
export default function CloudSignIn({ onSignedIn }: Props): JSX.Element {
  const [email, setEmail] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // If the user navigates away mid-browser-sign-in, stop the loopback listener.
  useEffect(() => () => void window.api.cloud.cancelOAuth(), [])

  const withProvider = async (provider: 'google' | 'microsoft'): Promise<void> => {
    setError(null)
    setInfo(null)
    setBusy(provider)
    const result = await window.api.cloud.oauth(provider)
    setBusy(null)
    if (result.ok) onSignedIn(result.status)
    else if (result.error !== 'Sign-in cancelled') setError(result.error)
  }

  const sendCode = async (): Promise<void> => {
    const address = email.trim().toLowerCase()
    setError(null)
    setInfo(null)
    setBusy('send')
    const result = await window.api.cloud.emailStart(address)
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCodeSentTo(address)
    setCode('')
    setInfo(`We sent a 6-digit code to ${address}. It expires in 15 minutes.`)
  }

  const verify = async (): Promise<void> => {
    if (!codeSentTo) return
    setError(null)
    setBusy('verify')
    const result = await window.api.cloud.emailVerify(codeSentTo, code)
    setBusy(null)
    if (result.ok) onSignedIn(result.status)
    else setError(result.error)
  }

  if (busy === 'google' || busy === 'microsoft') {
    return (
      <div className="cloud-signin">
        <div className="cloud-waiting">
          <Loader2 size={18} className="spin" />
          <div>
            <strong>Finish signing in in your browser</strong>
            <p className="help-text" style={{ margin: '2px 0 0' }}>
              A {busy === 'google' ? 'Google' : 'Microsoft'} sign-in page opened in your default browser. Artha
              continues automatically once you're done.
            </p>
          </div>
        </div>
        <button type="button" className="btn secondary" style={{ width: '100%' }} onClick={() => window.api.cloud.cancelOAuth()}>
          Cancel
        </button>
      </div>
    )
  }

  if (codeSentTo) {
    return (
      <div className="cloud-signin">
        {info && <p className="help-text" style={{ marginTop: 0 }}>{info}</p>}
        <div className="field">
          <label htmlFor="cloud-code">Sign-in code</label>
          <input
            id="cloud-code"
            className="cloud-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code.length === 6) verify()
            }}
            autoFocus
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn" style={{ width: '100%' }} onClick={verify} disabled={busy !== null || code.length !== 6}>
          {busy === 'verify' ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="cloud-signin-links">
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setCodeSentTo(null)
              setError(null)
              setInfo(null)
            }}
          >
            <ArrowLeft size={12} /> Use a different email
          </button>
          <button type="button" className="link-btn" onClick={sendCode} disabled={busy !== null}>
            Send a new code
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="cloud-signin">
      <button type="button" className="btn secondary provider-btn" onClick={() => withProvider('google')} disabled={busy !== null}>
        <GoogleMark /> Continue with Google
      </button>
      <button type="button" className="btn secondary provider-btn" onClick={() => withProvider('microsoft')} disabled={busy !== null}>
        <MicrosoftMark /> Continue with Microsoft
      </button>

      <div className="cloud-divider">
        <span>or use your email</span>
      </div>

      <div className="field">
        <label htmlFor="cloud-email">Email</label>
        <input
          id="cloud-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && email.includes('@')) sendCode()
          }}
        />
      </div>
      {error && <div className="error-text">{error}</div>}
      <button className="btn" style={{ width: '100%' }} onClick={sendCode} disabled={busy !== null || !email.includes('@')}>
        <Mail size={14} /> {busy === 'send' ? 'Sending…' : 'Email me a sign-in code'}
      </button>
      <p className="help-text" style={{ marginBottom: 0 }}>
        No password needed — we'll email you a one-time code. New here? Signing in creates your account.
      </p>
    </div>
  )
}
