import { useEffect, useState } from 'react'
import { Cloud, CloudCheck, RefreshCw, LogOut, KeyRound, Lock } from 'lucide-react'
import type { CloudStatus } from '../../../shared/types'
import CloudSignIn from './CloudSignIn'
import CloudKeyStep from './CloudKeyStep'
import DeviceApprovals from './DeviceApprovals'
import RecoveryKeyCard from './RecoveryKeyCard'
import ConfirmDialog from './ConfirmDialog'

/** Settings → Cloud Sync: sign in, finish the key step, then manage sync. */
export default function CloudSyncPanel(): JSX.Element | null {
  const [status, setStatus] = useState<CloudStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null)
  const [confirmRotate, setConfirmRotate] = useState(false)

  useEffect(() => {
    window.api.cloud.status().then(setStatus)
  }, [])

  const syncNow = async (): Promise<void> => {
    setError(null)
    setMsg(null)
    setBusy(true)
    try {
      const result = await window.api.sync.now()
      if (result.ok) setMsg('Synced.')
      else {
        setError(result.error)
        setStatus(await window.api.cloud.status())
      }
    } finally {
      setBusy(false)
    }
  }

  const becameReady = (next: CloudStatus): void => {
    setStatus(next)
    if (next.stage === 'ready') syncNow()
  }

  const signOut = async (): Promise<void> => {
    setError(null)
    setMsg(null)
    setStatus(await window.api.cloud.signOut())
  }

  const rotate = async (): Promise<void> => {
    setConfirmRotate(false)
    setError(null)
    const result = await window.api.cloud.rotateRecoveryKey()
    if (result.ok) setNewRecoveryKey(result.recoveryKey)
    else setError(result.error)
  }

  if (!status) return null

  if (status.stage === 'signedOut') {
    return (
      <div className="card section" style={{ borderColor: 'var(--accent-dim)' }}>
        <div className="section-header">
          <h2>
            <Cloud size={14} /> Connect to cloud sync
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Use the same data on your phone and other computers. Everything is encrypted on this device before it's sent
          — Artha's servers on Azure only ever store data they can't read.
        </p>
        {error && <div className="error-text">{error}</div>}
        <div style={{ maxWidth: 380 }}>
          <CloudSignIn onSignedIn={becameReady} />
        </div>
      </div>
    )
  }

  if (status.stage === 'needsKey') {
    return (
      <div className="card section" style={{ borderColor: 'var(--accent-dim)' }}>
        <div className="section-header">
          <h2>
            <Lock size={14} /> Set up encryption on this computer
          </h2>
        </div>
        <div style={{ maxWidth: 460 }}>
          <CloudKeyStep status={status} onReady={becameReady} onSignOut={signOut} />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card section">
        <div className="section-header">
          <h2>
            <CloudCheck size={14} /> Connected
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Signed in as {status.email || 'your account'}. Your data is encrypted on this computer before it syncs.
        </p>
        {error && <div className="error-text">{error}</div>}
        {msg && <div className="success-text">{msg}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={syncNow} disabled={busy}>
            <RefreshCw size={14} /> {busy ? 'Syncing…' : 'Sync now'}
          </button>
          <button className="btn secondary" onClick={signOut} disabled={busy}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      <DeviceApprovals />

      <div className="card section">
        <div className="section-header">
          <h2>
            <KeyRound size={14} /> Recovery key
          </h2>
        </div>
        {newRecoveryKey ? (
          <div style={{ maxWidth: 460 }}>
            <RecoveryKeyCard recoveryKey={newRecoveryKey} doneLabel="Done" onDone={() => setNewRecoveryKey(null)} />
          </div>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Lost your recovery key, or think someone else has seen it? Create a new one — the old one stops working
              straight away.
            </p>
            <button className="btn secondary" onClick={() => setConfirmRotate(true)}>
              Create a new recovery key
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmRotate}
        title="Create a new recovery key?"
        message="Your current recovery key will stop working. Make sure you save the new one."
        confirmLabel="Create new key"
        onConfirm={rotate}
        onCancel={() => setConfirmRotate(false)}
      />
    </>
  )
}
