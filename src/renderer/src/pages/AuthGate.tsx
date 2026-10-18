import { useEffect, useState } from 'react'
import { LockKeyhole, DatabaseBackup, Upload, ScanFace } from 'lucide-react'
import logo from '../assets/logo.png'
import { formatDate } from '../lib/format'

interface Props {
  initialized: boolean
  onUnlocked: () => void
}

export default function AuthGate({ initialized, onUnlocked }: Props): JSX.Element {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  const [mode, setMode] = useState<'password' | 'restore'>('password')
  const [importPath, setImportPath] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<{
    exportedAt: string
    documentCount: number
    hasSecrets: boolean
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)

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
      // The app relaunches from the main process; this line normally never runs.
    } catch (e) {
      setImportError((e as Error).message)
      setImportBusy(false)
    }
  }

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

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-icon">
          <img src={logo} alt="Artha" style={{ width: 56, height: 56, objectFit: 'contain' }} />
        </div>
        <h1>{initialized ? 'Unlock Artha' : 'Set your master password'}</h1>
        <p>
          {initialized
            ? 'Enter your master password to decrypt your local data.'
            : 'This password encrypts your entire local database. There is no password reset — if you forget it, your data cannot be recovered. Store it somewhere safe.'}
        </p>
        <div className="field">
          <label>Master password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && initialized) submit()
            }}
            autoFocus
          />
        </div>
        {!initialized && (
          <div className="field">
            <label>Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
        <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={submit} disabled={busy}>
          {busy ? 'Please wait…' : initialized ? 'Unlock' : 'Create & unlock'}
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
            <DatabaseBackup size={14} /> Restore from a backup instead
          </button>
        )}
      </div>
    </div>
  )
}
