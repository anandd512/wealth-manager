import { useEffect, useState } from 'react'
import { LockKeyhole, DatabaseBackup, Upload, ScanFace, HelpCircle, RotateCcw, ArrowLeft, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import logo from '../assets/logo.png'
import { formatDate } from '../lib/format'

type Mode = 'password' | 'restore' | 'forgot-password' | 'reset-confirm'

interface Props {
  initialized: boolean
  onUnlocked: () => void
  onTakeTour: () => void
}

export default function AuthGate({ initialized, onUnlocked, onTakeTour }: Props): JSX.Element {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [showPw, setShowPw] = useState(false)
  const [helloReady, setHelloReady] = useState(false)
  const [helloBusy, setHelloBusy] = useState(false)

  useEffect(() => {
    if (!initialized) return
    ;(async () => {
      const [available, enabled] = await Promise.all([
        window.api.auth.windowsHelloAvailable(),
        window.api.auth.windowsHelloEnabled()
      ])
      setHelloReady(available && enabled)
    })()
  }, [initialized])

  const unlockWithHello = async (): Promise<void> => {
    setError(null)
    setHelloBusy(true)
    const result = await window.api.auth.unlockWithWindowsHello()
    setHelloBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'Could not verify with Windows Hello')
      return
    }
    onUnlocked()
  }

  const [mode, setMode] = useState<Mode>('password')
  const [importPath, setImportPath] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<{
    exportedAt: string
    documentCount: number
    hasSecrets: boolean
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setError(null)
    if (!initialized) {
      if (password.length < 8) {
        setError('Use at least 8 characters for your master password.')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match.')
        return
      }
      setBusy(true)
      await window.api.auth.setup(password)
      setBusy(false)
      onUnlocked()
      return
    }
    setBusy(true)
    const result = await window.api.auth.unlock(password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'Could not unlock')
      return
    }
    onUnlocked()
  }

  const pickImportFile = async (): Promise<void> => {
    setImportError(null)
    setImportSummary(null)
    const path = await window.api.backup.pickFile()
    if (!path) return
    try {
      const summary = await window.api.backup.summary(path)
      setImportPath(path)
      setImportSummary(summary)
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  const confirmImport = async (): Promise<void> => {
    if (!importPath) return
    setImportBusy(true)
    try {
      await window.api.backup.import(importPath)
    } catch (e) {
      setImportError((e as Error).message)
      setImportBusy(false)
    }
  }

  const confirmReset = async (): Promise<void> => {
    setResetBusy(true)
    setResetError(null)
    try {
      await window.api.auth.resetData()
    } catch (e) {
      setResetError((e as Error).message)
      setResetBusy(false)
    }
  }

  // ── Restore from backup ──────────────────────────────────────────────────
  if (mode === 'restore') {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="gate-icon">
            <DatabaseBackup size={20} />
          </div>
          <h1>Restore from a backup</h1>
          <p>Bring over everything from an Artha backup file made on another device.</p>

          <button className="btn secondary" style={{ width: '100%' }} onClick={pickImportFile} disabled={importBusy}>
            <Upload size={14} /> Choose backup file…
          </button>
          {importError && <div className="error-text">{importError}</div>}
          {importSummary && (
            <div className="card" style={{ marginTop: 14, borderColor: 'var(--amber)' }}>
              <p style={{ margin: '0 0 8px', fontSize: 13 }}>
                Backup from {formatDate(importSummary.exportedAt)} — {importSummary.documentCount}{' '}
                document(s)
                {importSummary.hasSecrets ? ', including saved API/SMTP credentials' : ''}.
              </p>
              <p className="help-text" style={{ margin: '0 0 12px' }}>
                You'll unlock it next with the master password it was created with.
              </p>
              <button className="btn danger" style={{ width: '100%' }} onClick={confirmImport} disabled={importBusy}>
                {importBusy ? 'Restoring…' : 'Import and restart'}
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn secondary"
            style={{ width: '100%', marginTop: 10, background: 'transparent', border: 'none' }}
            onClick={() => setMode('password')}
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // ── Forgot password ──────────────────────────────────────────────────────
  if (mode === 'forgot-password') {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="gate-icon" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
            <HelpCircle size={20} />
          </div>
          <h1>Forgot your password</h1>
          <p>
            Artha uses zero-knowledge encryption — your master password cannot be recovered.
            Choose an option below.
          </p>

          <button
            className="btn secondary"
            style={{ width: '100%', marginBottom: 10 }}
            onClick={() => setMode('restore')}
          >
            <DatabaseBackup size={14} /> Import a backup file
          </button>
          <p className="help-text" style={{ marginBottom: 16, textAlign: 'center' }}>
            If you have a <code>.wmbackup</code> file from another device or an earlier export, restore it here. You'll use the password that backup was created with.
          </p>

          <button
            className="btn danger"
            style={{ width: '100%' }}
            onClick={() => setMode('reset-confirm')}
          >
            <RotateCcw size={14} /> Reset all data &amp; start fresh
          </button>
          <p className="help-text" style={{ marginTop: 8, textAlign: 'center' }}>
            Permanently deletes all local data so you can set a new master password. This cannot be undone.
          </p>

          <button
            type="button"
            className="btn secondary"
            style={{ width: '100%', marginTop: 14, background: 'transparent', border: 'none' }}
            onClick={() => setMode('password')}
          >
            <ArrowLeft size={14} /> Back to login
          </button>
        </div>
      </div>
    )
  }

  // ── Reset confirmation ───────────────────────────────────────────────────
  if (mode === 'reset-confirm') {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="gate-icon" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
            <AlertTriangle size={20} />
          </div>
          <h1>Reset all data?</h1>
          <div className="card" style={{ borderColor: 'var(--red)', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
              <strong>This is permanent.</strong> All your accounts, insurance policies, identity
              documents, credit cards, passwords, and uploaded files will be erased from this
              device. There is no undo.
            </p>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            After reset, the app will restart and you can set a new master password.
          </p>
          {resetError && <div className="error-text">{resetError}</div>}
          <button
            className="btn danger"
            style={{ width: '100%', marginBottom: 10 }}
            onClick={confirmReset}
            disabled={resetBusy}
          >
            {resetBusy ? 'Resetting…' : 'Yes, delete everything & restart'}
          </button>
          <button
            type="button"
            className="btn secondary"
            style={{ width: '100%', background: 'transparent', border: 'none' }}
            onClick={() => setMode('forgot-password')}
            disabled={resetBusy}
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </div>
    )
  }

  // ── Main login / first-run ───────────────────────────────────────────────
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-icon">
          <img src={logo} alt="Artha" style={{ width: 56, height: 56, objectFit: 'contain' }} />
        </div>
        <h1>{initialized ? 'Unlock Artha' : 'Set your master password'}</h1>
        <p>
          {initialized
            ? 'Welcome back. Enter your master password to open your vault.'
            : 'This is the one password that unlocks everything — your accounts, cards, IDs, and saved passwords.'}
        </p>
        <p className="help-text" style={{ marginTop: -8, marginBottom: 12 }}>
          Keep it somewhere safe. There's no recovery if it's forgotten — that's what keeps Artha private.
        </p>
        <div className="field">
          <label>Master password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && initialized) submit()
              }}
              autoFocus
              style={{ paddingRight: 36 }}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowPw(v => !v)}
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28 }}
              tabIndex={-1}
            >
              {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>
        {!initialized && (
          <div className="field">
            <label>Confirm password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                style={{ paddingRight: 36 }}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28 }}
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
        <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={submit} disabled={busy}>
          {busy ? (initialized ? 'Opening…' : 'Creating…') : initialized ? 'Unlock' : 'Create my vault'}
        </button>
        {initialized && helloReady && (
          <button
            type="button"
            className="btn secondary"
            style={{ width: '100%', marginTop: 10 }}
            onClick={unlockWithHello}
            disabled={helloBusy}
          >
            <ScanFace size={14} /> {helloBusy ? 'Waiting for Windows Hello…' : 'Unlock with Windows Hello'}
          </button>
        )}
        {!initialized && (
          <button
            type="button"
            className="btn secondary"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => setMode('restore')}
          >
            <DatabaseBackup size={14} /> Restore from backup
          </button>
        )}

        {/* Tour + Forgot password row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
          <button
            type="button"
            className="gate-text-btn"
            onClick={onTakeTour}
          >
            ✦ Take a tour
          </button>
          {initialized && (
            <button
              type="button"
              className="gate-text-btn"
              onClick={() => setMode('forgot-password')}
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
