import { useCallback, useEffect, useRef, useState } from 'react'
import { Smartphone, KeyRound, ShieldCheck, Loader2, AlertTriangle, RotateCcw } from 'lucide-react'
import type { CloudStatus } from '../../../shared/types'
import RecoveryKeyCard from './RecoveryKeyCard'

interface Props {
  status: CloudStatus
  onReady: (status: CloudStatus) => void
  onSignOut: () => void
}

type Method = 'approve' | 'recovery'

const POLL_MS = 2500

/** After sign-in: get this device the account's encryption key.
 *  - new account     → create it and show the recovery key
 *  - existing        → approve from a signed-in device, or type the recovery key
 *  - legacy account  → old password, once, to convert it */
export default function CloudKeyStep({ status: initial, onReady, onSignOut }: Props): JSX.Element {
  const [status, setStatus] = useState<CloudStatus>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [readyStatus, setReadyStatus] = useState<CloudStatus | null>(null)

  // After an app restart mid-onboarding the key state isn't known locally yet.
  useEffect(() => {
    if (status.stage === 'needsKey' && status.keyState === null) {
      window.api.cloud.refresh().then((r) => {
        if (!r.ok) setError(r.error)
        else if (r.status.stage === 'ready') onReady(r.status)
        else setStatus(r.status)
      })
    }
  }, [status, onReady])

  if (recoveryKey && readyStatus) {
    return <RecoveryKeyCard recoveryKey={recoveryKey} onDone={() => onReady(readyStatus)} />
  }

  if (status.stage === 'signedOut') {
    return (
      <div className="error-text">
        You were signed out.{' '}
        <button type="button" className="link-btn" onClick={onSignOut}>
          Sign in again
        </button>
      </div>
    )
  }

  if (status.keyState === null) {
    return (
      <div className="cloud-waiting">
        {error ? <div className="error-text">{error}</div> : <><Loader2 size={16} className="spin" /> Checking your account…</>}
      </div>
    )
  }

  const footer = (
    <p className="help-text" style={{ marginBottom: 0, marginTop: 14 }}>
      Signed in as {status.email ?? 'your account'} ·{' '}
      <button type="button" className="link-btn" onClick={onSignOut}>
        Use a different account
      </button>
    </p>
  )

  if (status.keyState === 'none') {
    const create = async (): Promise<void> => {
      setError(null)
      setBusy(true)
      const result = await window.api.cloud.createKey()
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setReadyStatus(result.status)
      setRecoveryKey(result.recoveryKey)
    }
    return (
      <div>
        <div className="key-step-intro">
          <ShieldCheck size={18} color="var(--accent)" />
          <div>
            <strong>Secure your account</strong>
            <p className="help-text" style={{ margin: '2px 0 0' }}>
              Artha creates an encryption key on this computer. Everything is encrypted with it before it's uploaded,
              so Azure only ever stores data it can't read. You'll get a recovery key to keep as a backup.
            </p>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn" style={{ width: '100%' }} onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create my encryption key'}
        </button>
        {footer}
      </div>
    )
  }

  if (status.keyState === 'legacy') {
    return (
      <LegacyConvert
        email={status.email}
        onConverted={(key, next) => {
          setReadyStatus(next)
          setRecoveryKey(key)
        }}
        onReset={setStatus}
        footer={footer}
      />
    )
  }

  return <ExistingAccountKey onReady={onReady} onReset={setStatus} footer={footer} />
}

/** "Delete the unreadable cloud copy and start the account over" — the way out when the
 * key can't be recovered: a lost recovery key with no signed-in device, or a forgotten
 * password on an account that hasn't been upgraded yet. Data on this computer is kept
 * and uploaded again under the new key. */
function StartOver({
  reason,
  onReset,
  onBack
}: {
  reason: string
  onReset: (status: CloudStatus) => void
  onBack: () => void
}): JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    const result = await window.api.cloud.resetData()
    setBusy(false)
    if (result.ok) onReset(result.status)
    else setError(result.error)
  }

  return (
    <div>
      <div className="key-step-intro danger">
        <AlertTriangle size={18} color="var(--red)" />
        <div>
          <strong>Start your cloud data over?</strong>
          <p className="help-text" style={{ margin: '2px 0 0' }}>
            {reason} This deletes the cloud copy and sets up a new key. Everything stored on this computer is kept and
            uploaded again. Anything that only exists in the cloud (for example, added on your phone and never synced
            here) is lost, and other devices will need to be set up again.
          </p>
        </div>
      </div>
      <div className="field">
        <label htmlFor="reset-confirm">Type DELETE to confirm</label>
        <input id="reset-confirm" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </div>
      {error && <div className="error-text">{error}</div>}
      <button className="btn danger" style={{ width: '100%' }} onClick={reset} disabled={busy || text !== 'DELETE'}>
        <RotateCcw size={14} /> {busy ? 'Deleting…' : 'Delete cloud data and start over'}
      </button>
      <button type="button" className="btn secondary" style={{ width: '100%', marginTop: 8 }} onClick={onBack}>
        Back
      </button>
    </div>
  )
}

function LegacyConvert({
  email,
  onConverted,
  onReset,
  footer
}: {
  email: string | null
  onConverted: (recoveryKey: string, status: CloudStatus) => void
  onReset: (status: CloudStatus) => void
  footer: JSX.Element
}): JSX.Element {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forgot, setForgot] = useState(false)

  if (forgot) {
    return (
      <StartOver
        reason="Your existing cloud data is encrypted with a key made from that password, so without it nobody — including Artha — can decrypt it."
        onReset={onReset}
        onBack={() => setForgot(false)}
      />
    )
  }

  const submit = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    const result = await window.api.cloud.convertLegacy(password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPassword('')
    onConverted(result.recoveryKey, result.status)
  }

  return (
    <div>
      <div className="key-step-intro">
        <KeyRound size={18} color="var(--accent)" />
        <div>
          <strong>One-time upgrade</strong>
          <p className="help-text" style={{ margin: '2px 0 0' }}>
            {email ?? 'This account'} was set up with a cloud sync password. Enter it one last time to unlock your
            existing data — after this you'll sign in without a password and get a recovery key instead.
          </p>
        </div>
      </div>
      <div className="field">
        <label htmlFor="legacy-pw">Old cloud sync password</label>
        <input
          id="legacy-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && password) submit()
          }}
          autoFocus
        />
      </div>
      {error && <div className="error-text">{error}</div>}
      <button className="btn" style={{ width: '100%' }} onClick={submit} disabled={busy || !password}>
        {busy ? 'Unlocking… (takes a few seconds)' : 'Unlock and upgrade'}
      </button>
      <p className="help-text" style={{ marginTop: 14, marginBottom: 0 }}>
        Don't remember it?{' '}
        <button type="button" className="link-btn" onClick={() => setForgot(true)}>
          Start over without it
        </button>
      </p>
      {footer}
    </div>
  )
}

function ExistingAccountKey({
  onReady,
  onReset,
  footer
}: {
  onReady: (status: CloudStatus) => void
  onReset: (status: CloudStatus) => void
  footer: JSX.Element
}): JSX.Element {
  const [method, setMethod] = useState<Method>('approve')
  const [linkCode, setLinkCode] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [recoveryText, setRecoveryText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback((): void => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = null
  }, [])

  const startLink = useCallback(async (): Promise<void> => {
    stopPolling()
    setError(null)
    setExpired(false)
    setLinkCode(null)
    const result = await window.api.cloud.linkStart()
    if (!result.ok) {
      setError(result.error)
      return
    }
    setLinkCode(result.code)
    pollTimer.current = setInterval(async () => {
      const poll = await window.api.cloud.linkPoll()
      if (!poll.ok) {
        stopPolling()
        setError(poll.error)
        return
      }
      if (poll.linkStatus === 'approved') {
        stopPolling()
        onReady(poll.status)
      } else if (poll.linkStatus === 'expired') {
        stopPolling()
        setExpired(true)
      }
    }, POLL_MS)
  }, [onReady, stopPolling])

  useEffect(() => {
    if (method === 'approve') startLink()
    return () => {
      stopPolling()
      void window.api.cloud.linkCancel()
    }
  }, [method, startLink, stopPolling])

  const useRecovery = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    const result = await window.api.cloud.useRecoveryKey(recoveryText)
    setBusy(false)
    if (result.ok) onReady(result.status)
    else setError(result.error)
  }

  if (confirmReset) {
    return (
      <StartOver
        reason="Without a signed-in device or your recovery key, nobody — including Artha — can decrypt what's in the cloud."
        onReset={onReset}
        onBack={() => setConfirmReset(false)}
      />
    )
  }

  return (
    <div>
      <p className="help-text" style={{ marginTop: 0 }}>
        Your account already has encrypted data. Give this computer the key using one of these:
      </p>
      <div className="segmented" role="group" aria-label="How to get your key" style={{ marginBottom: 14 }}>
        <button type="button" aria-pressed={method === 'approve'} onClick={() => setMethod('approve')}>
          <Smartphone /> Approve from another device
        </button>
        <button type="button" aria-pressed={method === 'recovery'} onClick={() => setMethod('recovery')}>
          <KeyRound /> Use recovery key
        </button>
      </div>

      {method === 'approve' && (
        <div>
          {linkCode && !expired && (
            <>
              <div className="link-code" aria-label="Approval code">
                {linkCode}
              </div>
              <ol className="link-steps">
                <li>On a phone or computer that's already signed in to Artha, open Settings → Cloud Sync.</li>
                <li>Under "Approve a new device", check the code there matches this one.</li>
                <li>Tap Approve. This screen continues by itself.</li>
              </ol>
              <div className="cloud-waiting" style={{ marginBottom: 0 }}>
                <Loader2 size={14} className="spin" /> Waiting for approval…
              </div>
            </>
          )}
          {!linkCode && !error && (
            <div className="cloud-waiting">
              <Loader2 size={14} className="spin" /> Preparing…
            </div>
          )}
          {expired && (
            <>
              <p className="help-text">That request expired.</p>
              <button className="btn secondary" onClick={startLink}>
                Try again
              </button>
            </>
          )}
        </div>
      )}

      {method === 'recovery' && (
        <div>
          <div className="field">
            <label htmlFor="recovery-input">Recovery key</label>
            <input
              id="recovery-input"
              className="recovery-input"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              value={recoveryText}
              onChange={(e) => setRecoveryText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && recoveryText) useRecovery()
              }}
              spellCheck={false}
              autoFocus
            />
          </div>
          <button className="btn" style={{ width: '100%' }} onClick={useRecovery} disabled={busy || !recoveryText.trim()}>
            {busy ? 'Unlocking…' : 'Unlock with recovery key'}
          </button>
        </div>
      )}

      {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}

      <p className="help-text" style={{ marginTop: 14, marginBottom: 0 }}>
        No signed-in device and lost your recovery key?{' '}
        <button type="button" className="link-btn" onClick={() => setConfirmReset(true)}>
          Start over
        </button>
      </p>
      {footer}
    </div>
  )
}
