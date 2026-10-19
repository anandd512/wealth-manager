import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import {
  ShieldCheck,
  BellRing,
  Sparkles,
  Mail,
  CalendarCheck,
  DatabaseBackup,
  Upload,
  Download,
  ScanFace,
  Timer,
  Lock,
  HelpCircle
} from 'lucide-react'
import { formatDate } from '../lib/format'
import type {
  AppSettings,
  CheckInScheduleSettings,
  ExtractionProvider,
  ReminderSettings,
  SmtpConfig
} from '../../../shared/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const OCCURRENCES: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' }
]

export default function Settings(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  // Reminders
  const [daysBefore, setDaysBefore] = useState(30)
  const [desktopNotifications, setDesktopNotifications] = useState(true)
  const [emailNotifications, setEmailNotifications] = useState(false)
  const [reminderSaved, setReminderSaved] = useState(false)

  // Monthly check-in reminder
  const [checkInSchedule, setCheckInSchedule] = useState<CheckInScheduleSettings>({
    enabled: true,
    occurrence: 1,
    weekday: 6
  })
  const [checkInSaved, setCheckInSaved] = useState(false)

  // Document extraction provider
  const [provider, setProvider] = useState<ExtractionProvider>('anthropic')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [keyMsg, setKeyMsg] = useState<string | null>(null)
  const [openAiKey, setOpenAiKey] = useState('')
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('')
  const [openAiModel, setOpenAiModel] = useState('')
  const [openAiMsg, setOpenAiMsg] = useState<string | null>(null)

  // SMTP
  const [smtp, setSmtp] = useState<Omit<SmtpConfig, 'user'> & { user: string }>({
    host: '',
    port: 587,
    secure: false,
    user: '',
    fromAddress: '',
    toAddress: ''
  })
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpMsg, setSmtpMsg] = useState<string | null>(null)
  const [testBusy, setTestBusy] = useState(false)

  // Master password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)

  // Windows Hello
  const [helloAvailable, setHelloAvailable] = useState(false)
  const [helloEnabled, setHelloEnabled] = useState(false)
  const [helloBusy, setHelloBusy] = useState(false)
  const [helloMsg, setHelloMsg] = useState<string | null>(null)

  // Auto-lock
  const [autoLockMinutes, setAutoLockMinutes] = useState<string>(
    localStorage.getItem('artha_autolock_minutes') ?? '5'
  )

  // Data summary
  const [dataSummary, setDataSummary] = useState<{ accounts: number; policies: number; identityDocs: number; cards: number; vaultEntries: number } | null>(null)

  // Backup & restore
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [importPath, setImportPath] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<{
    exportedAt: string
    documentCount: number
    hasSecrets: boolean
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  const load = async (): Promise<void> => {
    const s: AppSettings = await api().settings.get()
    setSettings(s)
    setDaysBefore(s.reminders.daysBefore)
    setDesktopNotifications(s.reminders.desktopNotifications)
    setEmailNotifications(s.reminders.emailNotifications)
    setCheckInSchedule(s.checkInSchedule)
    setSmtp(s.smtp)
    setProvider(s.extractionProvider)
    setOpenAiBaseUrl(s.openAiBaseUrl)
    setOpenAiModel(s.openAiModel)
  }

  useEffect(() => {
    load()
    ;(async () => {
      const [available, enabled] = await Promise.all([
        api().auth.windowsHelloAvailable(),
        api().auth.windowsHelloEnabled()
      ])
      setHelloAvailable(available)
      setHelloEnabled(enabled)
    })()
    ;(async () => {
      const [accs, pols, ids, cards, vault] = await Promise.all([
        api().accounts.list(),
        api().insurance.list(),
        api().identityDocs.list(),
        api().creditCards.list(),
        api().vault.list()
      ])
      setDataSummary({
        accounts: accs.length,
        policies: pols.length,
        identityDocs: ids.length,
        cards: cards.length,
        vaultEntries: vault.length
      })
    })()
  }, [])

  const toggleWindowsHello = async (next: boolean): Promise<void> => {
    setHelloMsg(null)
    setHelloBusy(true)
    try {
      if (next) {
        const result = await api().auth.enableWindowsHello()
        if (!result.ok) {
          setHelloMsg('Could not enable Windows Hello on this device.')
          return
        }
      } else {
        await api().auth.disableWindowsHello()
      }
      setHelloEnabled(next)
      setHelloMsg(next ? 'Windows Hello unlock enabled.' : 'Windows Hello unlock disabled.')
    } finally {
      setHelloBusy(false)
    }
  }

  const saveAutoLock = (value: string): void => {
    setAutoLockMinutes(value)
    localStorage.setItem('artha_autolock_minutes', value)
  }

  const saveReminders = async (): Promise<void> => {
    const r: ReminderSettings = { daysBefore, desktopNotifications, emailNotifications }
    await api().settings.setReminders(r)
    setReminderSaved(true)
    setTimeout(() => setReminderSaved(false), 2000)
  }

  const saveCheckInSchedule = async (next: CheckInScheduleSettings): Promise<void> => {
    setCheckInSchedule(next)
    await api().settings.setCheckInSchedule(next)
    setCheckInSaved(true)
    setTimeout(() => setCheckInSaved(false), 2000)
  }

  const changeProvider = async (p: ExtractionProvider): Promise<void> => {
    setProvider(p)
    await api().settings.setExtractionProvider(p)
  }

  const saveKey = async (): Promise<void> => {
    await api().settings.setAnthropicKey(anthropicKey)
    setAnthropicKey('')
    setKeyMsg('Saved and encrypted on this device.')
    load()
  }

  const clearKey = async (): Promise<void> => {
    await api().settings.clearAnthropicKey()
    setKeyMsg('API key removed.')
    load()
  }

  const saveOpenAi = async (): Promise<void> => {
    await api().settings.setOpenAiBaseUrl(openAiBaseUrl)
    await api().settings.setOpenAiModel(openAiModel)
    if (openAiKey) {
      await api().settings.setOpenAiKey(openAiKey)
      setOpenAiKey('')
    }
    setOpenAiMsg('Saved.')
    load()
  }

  const clearOpenAiKey = async (): Promise<void> => {
    await api().settings.clearOpenAiKey()
    setOpenAiMsg('API key removed.')
    load()
  }

  const saveSmtp = async (): Promise<void> => {
    await api().settings.setSmtp(smtp)
    if (smtpPassword) {
      await api().settings.setSmtpPassword(smtpPassword)
      setSmtpPassword('')
    }
    setSmtpMsg('SMTP settings saved.')
    load()
  }

  const testEmail = async (): Promise<void> => {
    setTestBusy(true)
    setSmtpMsg(null)
    try {
      await api().settings.testEmail()
      setSmtpMsg('Test email sent — check your inbox.')
    } catch (e) {
      setSmtpMsg(`Failed: ${(e as Error).message}`)
    } finally {
      setTestBusy(false)
    }
  }

  const changePassword = async (): Promise<void> => {
    setPwError(null)
    setPwMsg(null)
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.')
      return
    }
    const result = await api().auth.changePassword(currentPassword, newPassword)
    if (!result.ok) {
      setPwError(result.error ?? 'Could not change password')
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPwMsg('Master password changed.')
  }

  const exportBackup = async (): Promise<void> => {
    setExportMsg(null)
    setExportBusy(true)
    try {
      const result = await api().backup.export()
      if (!result.ok) {
        setExportBusy(false)
        return
      }
      const mb = (result.sizeBytes / (1024 * 1024)).toFixed(1)
      setExportMsg(
        `Saved to ${result.path} — ${result.documentCount} document(s), ${mb} MB.`
      )
    } finally {
      setExportBusy(false)
    }
  }

  const pickImportFile = async (): Promise<void> => {
    setImportError(null)
    setImportSummary(null)
    const path = await api().backup.pickFile()
    if (!path) return
    try {
      const summary = await api().backup.summary(path)
      setImportPath(path)
      setImportSummary(summary)
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  const confirmImport = async (): Promise<void> => {
    if (!importPath) return
    if (
      !confirm(
        'This replaces ALL current data on this device with the backup and restarts the app. Your current data is moved aside as a .bak file first, just in case. Continue?'
      )
    ) {
      return
    }
    setImportBusy(true)
    try {
      await api().backup.import(importPath)
      // The app relaunches from the main process; this line normally never runs.
    } catch (e) {
      setImportError((e as Error).message)
      setImportBusy(false)
    }
  }

  if (!settings) return <div className="muted">Loading…</div>

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="settings-section-label">
        <Lock size={12} /> Security
      </div>

      <div className="card section" style={{ borderColor: 'var(--accent-dim)' }}>
        <div className="section-header">
          <h2>
            <ShieldCheck size={14} /> Master password
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          This password encrypts your entire database. There is no recovery if forgotten.
        </p>
        <div className="form-row">
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ maxWidth: '50%' }}>
          <label>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {pwError && <div className="error-text">{pwError}</div>}
        {pwMsg && <div className="success-text">{pwMsg}</div>}
        <button className="btn" onClick={changePassword} disabled={!currentPassword || !newPassword}>
          Change password
        </button>
      </div>

      {helloAvailable && (
        <div className="card section">
          <div className="section-header">
            <h2>
              <ScanFace size={14} /> Windows Hello
            </h2>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Unlock with your face, fingerprint, or PIN instead of typing the master password
            every time. This stores an encrypted copy of your database key, protected by
            Windows' own credential store for your user account — disable it any time.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={helloEnabled}
              disabled={helloBusy}
              onChange={(e) => toggleWindowsHello(e.target.checked)}
            />
            Enable Windows Hello unlock
          </label>
          {helloMsg && <div className="success-text">{helloMsg}</div>}
        </div>
      )}

      <div className="card section">
        <div className="section-header">
          <h2>
            <Timer size={14} /> Auto-lock timeout
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Lock the app automatically after a period of inactivity. Takes effect on next unlock.
        </p>
        <div className="field" style={{ maxWidth: 240 }}>
          <label>Lock after</label>
          <select value={autoLockMinutes} onChange={(e) => saveAutoLock(e.target.value)}>
            <option value="0.5">30 seconds</option>
            <option value="1">1 minute</option>
            <option value="5">5 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="never">Never</option>
          </select>
        </div>
      </div>

      <div className="settings-section-label">
        <DatabaseBackup size={12} /> Data Management
      </div>

      {dataSummary && (
        <div className="card section" style={{ padding: '14px 18px' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>What's stored</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Accounts', count: dataSummary.accounts },
              { label: 'Policies', count: dataSummary.policies },
              { label: 'Identity docs', count: dataSummary.identityDocs },
              { label: 'Credit cards', count: dataSummary.cards },
              { label: 'Vault entries', count: dataSummary.vaultEntries },
            ].map(({ label, count }) => (
              <div key={label}>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{count}</div>
                <div className="muted" style={{ fontSize: 11 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card section">
        <div className="section-header">
          <h2>
            <DatabaseBackup size={14} /> Backup &amp; restore
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Export everything — every account, check-in, document, policy, card, login, and
          setting — into one encrypted file you can move to a new device. It's protected by the
          same master password, so only you can open it. (API keys and SMTP passwords are stored
          via Windows' own credential store and generally won't carry over to a different device
          or Windows account — you'll just re-enter those.)
        </p>
        <button className="btn secondary" onClick={exportBackup} disabled={exportBusy}>
          <Download size={14} /> {exportBusy ? 'Exporting…' : 'Export backup'}
        </button>
        {exportMsg && <div className="success-text">{exportMsg}</div>}

        <div className="subsection-label">Restore from a backup</div>
        <button className="btn secondary" onClick={pickImportFile} disabled={importBusy}>
          <Upload size={14} /> Choose backup file…
        </button>
        {importError && <div className="error-text">{importError}</div>}
        {importSummary && (
          <div className="card" style={{ marginTop: 12, borderColor: 'var(--amber)' }}>
            <p style={{ margin: '0 0 8px' }}>
              Backup from {formatDate(importSummary.exportedAt)} — {importSummary.documentCount}{' '}
              document(s)
              {importSummary.hasSecrets ? ', including saved API/SMTP credentials' : ''}.
            </p>
            <p className="error-text" style={{ margin: '0 0 12px' }}>
              Importing replaces ALL data currently on this device and restarts the app. Your
              current data is moved aside as a .bak file first, not deleted.
            </p>
            <button className="btn danger" onClick={confirmImport} disabled={importBusy}>
              {importBusy ? 'Restoring…' : 'Import and restart'}
            </button>
          </div>
        )}
      </div>

      <div className="settings-section-label">
        <BellRing size={12} /> Notifications
      </div>

      <div className="card section">
        <div className="section-header">
          <h2>
            <BellRing size={14} /> Expiry reminders
          </h2>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Remind me this many days before expiry</label>
            <input
              type="number"
              min={1}
              max={180}
              value={daysBefore}
              onChange={(e) => setDaysBefore(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={desktopNotifications}
              onChange={(e) => setDesktopNotifications(e.target.checked)}
            />
            Desktop notifications
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
            />
            Email notifications (requires SMTP setup below)
          </label>
        </div>
        <button className="btn" onClick={saveReminders}>
          Save
        </button>
        {reminderSaved && <span className="success-text" style={{ marginLeft: 10 }}>Saved</span>}
      </div>

      <div className="card section">
        <div className="section-header">
          <h2>
            <CalendarCheck size={14} /> Monthly check-in reminder
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          A recurring nudge on the dashboard to keep account balances and values up to date.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={checkInSchedule.enabled}
            onChange={(e) => saveCheckInSchedule({ ...checkInSchedule, enabled: e.target.checked })}
          />
          Remind me to check in every month
        </label>
        {checkInSchedule.enabled && (
          <div className="form-row" style={{ maxWidth: 420 }}>
            <div className="field">
              <label>Occurrence</label>
              <select
                value={checkInSchedule.occurrence}
                onChange={(e) =>
                  saveCheckInSchedule({
                    ...checkInSchedule,
                    occurrence: Number(e.target.value) as CheckInScheduleSettings['occurrence']
                  })
                }
              >
                {OCCURRENCES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Day of week</label>
              <select
                value={checkInSchedule.weekday}
                onChange={(e) =>
                  saveCheckInSchedule({
                    ...checkInSchedule,
                    weekday: Number(e.target.value) as CheckInScheduleSettings['weekday']
                  })
                }
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {checkInSaved && <span className="success-text">Saved</span>}
      </div>

      <div className="settings-section-label">
        <Sparkles size={12} /> AI & Extraction
      </div>

      <div className="card section">
        <div className="section-header">
          <h2>
            <Sparkles size={14} /> Document extraction
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Artha can read your uploaded policy PDFs and loan documents and fill in the fields automatically. Requires an API key from your chosen provider.
        </p>

        <div className="field" style={{ maxWidth: 360 }}>
          <label>Provider</label>
          <select value={provider} onChange={(e) => changeProvider(e.target.value as ExtractionProvider)}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">Custom AI endpoint (OpenAI-compatible)</option>
          </select>
        </div>

        {provider === 'anthropic' ? (
          <>
            <p className="help-text" style={{ marginBottom: 12 }}>
              Get a key from console.anthropic.com. Stored encrypted via your OS's secure storage,
              never in plain text.
            </p>
            <div className="field">
              <label>
                Anthropic API key{' '}
                {settings.hasAnthropicKey && <span className="badge ok">Configured</span>}
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder={settings.hasAnthropicKey ? '••••••••••••••••' : 'sk-ant-...'}
              />
            </div>
            <button className="btn" onClick={saveKey} disabled={!anthropicKey}>
              Save key
            </button>
            {settings.hasAnthropicKey && (
              <button className="btn secondary" onClick={clearKey} style={{ marginLeft: 8 }}>
                Remove key
              </button>
            )}
            {keyMsg && <div className="success-text">{keyMsg}</div>}
          </>
        ) : (
          <>
            <p className="help-text" style={{ marginBottom: 12 }}>
              For any OpenAI-compatible endpoint — Azure AI Foundry, a local model, or any self-hosted API (URLs ending in
              <code> /openai/v1</code>). Paste the endpoint Foundry gave you — a trailing{' '}
              <code>/responses</code> is stripped automatically — and the deployment name you gave
              the model.
            </p>
            <div className="form-row">
              <div className="field">
                <label>Endpoint base URL</label>
                <input
                  value={openAiBaseUrl}
                  onChange={(e) => setOpenAiBaseUrl(e.target.value)}
                  placeholder="https://your-resource.services.ai.azure.com/openai/v1"
                />
              </div>
              <div className="field">
                <label>Model / deployment name</label>
                <input
                  value={openAiModel}
                  onChange={(e) => setOpenAiModel(e.target.value)}
                  placeholder="e.g. gpt-6-astra"
                />
              </div>
            </div>
            <div className="field">
              <label>
                API key {settings.hasOpenAiKey && <span className="badge ok">Configured</span>}
              </label>
              <input
                type="password"
                value={openAiKey}
                onChange={(e) => setOpenAiKey(e.target.value)}
                placeholder={settings.hasOpenAiKey ? '••••••••••••••••' : ''}
              />
            </div>
            <button className="btn" onClick={saveOpenAi}>
              Save
            </button>
            {settings.hasOpenAiKey && (
              <button className="btn secondary" onClick={clearOpenAiKey} style={{ marginLeft: 8 }}>
                Remove key
              </button>
            )}
            {openAiMsg && <div className="success-text">{openAiMsg}</div>}
          </>
        )}
      </div>

      <div className="card section">
        <div className="section-header">
          <h2>
            <Mail size={14} /> Email reminders (Gmail / Outlook)
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Send yourself reminders via email. Use an app password — not your main account password. For Gmail: Google Account → Security → App passwords → create one for "Artha".
        </p>
        <div className="form-row">
          <div className="field">
            <label>SMTP host</label>
            <input
              value={smtp.host}
              onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
              placeholder="smtp.gmail.com"
            />
          </div>
          <div className="field">
            <label>Port</label>
            <input
              type="number"
              value={smtp.port}
              onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Account email (username)</label>
            <input value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} />
          </div>
          <div className="field">
            <label>
              App password {settings.hasSmtpPassword && <span className="badge ok">Configured</span>}
            </label>
            <input
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder={settings.hasSmtpPassword ? '••••••••••••••••' : ''}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>From address</label>
            <input
              value={smtp.fromAddress}
              onChange={(e) => setSmtp({ ...smtp, fromAddress: e.target.value })}
              placeholder="defaults to account email"
            />
          </div>
          <div className="field">
            <label>Send reminders to</label>
            <input
              value={smtp.toAddress}
              onChange={(e) => setSmtp({ ...smtp, toAddress: e.target.value })}
              placeholder={smtp.user || 'you@example.com'}
            />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={smtp.secure}
            onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })}
          />
          Use TLS (port 465 typically)
        </label>
        <button className="btn" onClick={saveSmtp}>
          Save SMTP settings
        </button>
        <button className="btn secondary" onClick={testEmail} disabled={testBusy} style={{ marginLeft: 8 }}>
          {testBusy ? 'Sending…' : 'Send test email'}
        </button>
        {smtpMsg && <div className="success-text">{smtpMsg}</div>}
      </div>

      <div className="settings-section-label" style={{ marginTop: 32 }}>
        <HelpCircle size={12} /> Help
      </div>

      <div className="card section">
        <div className="section-header">
          <h2>Product tour</h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Revisit the guided walkthrough to explore all of Artha's features with demo data.
        </p>
        <button
          className="btn secondary"
          onClick={() => window.dispatchEvent(new CustomEvent('artha:start-tour'))}
        >
          ✦ Take a tour
        </button>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          Your data is stored locally and encrypted. Nothing is ever sent to Artha servers.
        </p>
      </div>
    </div>
  )
}
