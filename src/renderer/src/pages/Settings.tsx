import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  HelpCircle,
  Moon,
  Sun,
  Cloud,
  CloudCheck,
  RefreshCw,
  LogOut
} from 'lucide-react'
import { formatDate } from '../lib/format'
import type {
  AppSettings,
  CheckInScheduleSettings,
  ExtractionProvider,
  NotifyStatus,
  ReminderSettings,
  UpdateStatus
} from '../../../shared/types'

type TabId = 'data' | 'appearance' | 'security' | 'sync' | 'notifications' | 'ai' | 'help'

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'data',          label: 'Data',          icon: DatabaseBackup },
  { id: 'appearance',    label: 'Appearance',    icon: Moon },
  { id: 'security',      label: 'Security',      icon: Lock },
  { id: 'sync',          label: 'Cloud Sync',    icon: Cloud },
  { id: 'notifications', label: 'Notifications', icon: BellRing },
  { id: 'ai',            label: 'AI',            icon: Sparkles },
  { id: 'help',          label: 'Help',          icon: HelpCircle }
]

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const OCCURRENCES: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' }
]

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export default function Settings(): JSX.Element {
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : 'data'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  // Settings' tabs are local state, not routes, so App.tsx's route-change scroll
  // reset never fires for them — switching tabs would otherwise leave the page
  // scrolled wherever the previous tab happened to be.
  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0)
  }, [activeTab])

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

  // Email reminders (notify)
  const [notifyStatus, setNotifyStatus] = useState<NotifyStatus | null>(null)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [notifyVerificationSentTo, setNotifyVerificationSentTo] = useState<string | null>(null)
  const [notifyCode, setNotifyCode] = useState('')
  const [notifyBusy, setNotifyBusy] = useState(false)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null)
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

  // Cloud sync
  const [syncStatus, setSyncStatus] = useState<{ connected: boolean; email: string | null } | null>(null)
  const [syncMode, setSyncMode] = useState<'login' | 'register'>('login')
  const [syncEmail, setSyncEmail] = useState('')
  const [syncPassword, setSyncPassword] = useState('')
  const [syncPasswordConfirm, setSyncPasswordConfirm] = useState('')
  // Register mode only: null until a code's been emailed, then holds the address it
  // was sent to (so a later email edit doesn't silently verify the wrong address).
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  // Appearance
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('artha_theme') as 'dark' | 'light') ?? 'dark'
  )

  const toggleTheme = (next: 'dark' | 'light'): void => {
    setTheme(next)
    localStorage.setItem('artha_theme', next)
    if (next === 'light') document.body.classList.add('light-mode')
    else document.body.classList.remove('light-mode')
  }

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

  // Updates
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)

  const toggleAutoUpdate = async (enabled: boolean): Promise<void> => {
    setUpdateStatus(await api().updates.setAutoCheck(enabled))
  }

  const checkForUpdates = async (): Promise<void> => {
    setUpdateBusy(true)
    setUpdateMsg(null)
    try {
      const result = await api().updates.checkNow()
      if (result.status === 'up-to-date') setUpdateMsg("You're on the latest version.")
      else if (result.status === 'downloading')
        setUpdateMsg(`Version ${result.version} is downloading — you'll be asked to restart when it's ready.`)
      else if (result.status === 'error') setUpdateMsg(`Couldn't check for updates: ${result.message}`)
      else setUpdateMsg('Updates are only available in the installed app.')
    } finally {
      setUpdateBusy(false)
    }
  }

  const load = async (): Promise<void> => {
    const s: AppSettings = await api().settings.get()
    setSettings(s)
    setDaysBefore(s.reminders.daysBefore)
    setDesktopNotifications(s.reminders.desktopNotifications)
    setEmailNotifications(s.reminders.emailNotifications)
    setCheckInSchedule(s.checkInSchedule)
    setProvider(s.extractionProvider)
    setOpenAiBaseUrl(s.openAiBaseUrl)
    setOpenAiModel(s.openAiModel)
  }

  const loadSyncStatus = async (): Promise<void> => {
    setSyncStatus(await api().sync.status())
  }

  const loadNotifyStatus = async (): Promise<void> => {
    setNotifyStatus(await api().notify.status())
  }

  useEffect(() => {
    load()
    loadSyncStatus()
    loadNotifyStatus()
    api().updates.status().then(setUpdateStatus)
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

  const testAiKey = async (): Promise<void> => {
    setKeyMsg('Testing…')
    try {
      await api().settings.setAnthropicKey(anthropicKey)
      setKeyMsg('Key is valid')
    } catch (e) {
      setKeyMsg((e as Error).message ?? 'Key test failed')
    }
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

  const requestNotifyCode = async (): Promise<void> => {
    setNotifyError(null)
    setNotifyMsg(null)
    setNotifyBusy(true)
    try {
      const email = notifyEmail.trim().toLowerCase()
      const result = await api().notify.requestVerification(email)
      if (!result.ok) {
        setNotifyError(result.error ?? 'Could not send verification code')
        return
      }
      setNotifyVerificationSentTo(email)
      setNotifyMsg(`Sent a code to ${email}.`)
    } finally {
      setNotifyBusy(false)
    }
  }

  const confirmNotifyCode = async (): Promise<void> => {
    if (!notifyVerificationSentTo) return
    setNotifyError(null)
    setNotifyMsg(null)
    setNotifyBusy(true)
    try {
      const result = await api().notify.confirmVerification(notifyVerificationSentTo, notifyCode)
      if (!result.ok) {
        setNotifyError(result.error ?? 'Incorrect or expired code')
        return
      }
      setNotifyEmail('')
      setNotifyVerificationSentTo(null)
      setNotifyCode('')
      await loadNotifyStatus()
    } finally {
      setNotifyBusy(false)
    }
  }

  const cancelNotifyVerification = (): void => {
    setNotifyVerificationSentTo(null)
    setNotifyCode('')
    setNotifyError(null)
    setNotifyMsg(null)
  }

  const disconnectNotify = async (): Promise<void> => {
    setNotifyBusy(true)
    try {
      await api().notify.disconnect()
      await loadNotifyStatus()
      setNotifyMsg(null)
      setNotifyError(null)
    } finally {
      setNotifyBusy(false)
    }
  }

  const testEmail = async (): Promise<void> => {
    setTestBusy(true)
    setNotifyMsg(null)
    setNotifyError(null)
    try {
      const result = await api().settings.testEmail()
      if (!result.ok) {
        setNotifyError(`Failed: ${result.error ?? 'unknown error'}`)
        return
      }
      setNotifyMsg('Test email sent — check your inbox.')
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

  // Login mode: straight to sync.login. Register mode: just sends the verification
  // code — the account isn't created until confirmSyncRegistration() below.
  const submitSyncEmailPassword = async (): Promise<void> => {
    setSyncError(null)
    setSyncMsg(null)

    if (syncMode === 'register' && syncPassword !== syncPasswordConfirm) {
      setSyncError("Passwords don't match.")
      return
    }

    setSyncBusy(true)
    try {
      const email = syncEmail.trim().toLowerCase()
      if (syncMode === 'login') {
        const result = await api().sync.login(email, syncPassword)
        if (!result.ok) {
          setSyncError(result.error ?? 'Could not connect')
          return
        }
        setSyncEmail('')
        setSyncPassword('')
        await loadSyncStatus()
      } else {
        const result = await api().sync.requestEmailVerification(email)
        if (!result.ok) {
          setSyncError(result.error ?? 'Could not send verification code')
          return
        }
        setVerificationSentTo(email)
        setSyncMsg(`Sent a code to ${email}.`)
      }
    } finally {
      setSyncBusy(false)
    }
  }

  const confirmSyncRegistration = async (): Promise<void> => {
    if (!verificationSentTo) return
    setSyncError(null)
    setSyncMsg(null)
    setSyncBusy(true)
    try {
      const confirmResult = await api().sync.confirmEmailVerification(verificationSentTo, verificationCode)
      if (!confirmResult.ok || !confirmResult.verificationToken) {
        setSyncError(confirmResult.error ?? 'Incorrect or expired code')
        return
      }
      const registerResult = await api().sync.register(verificationSentTo, syncPassword, confirmResult.verificationToken)
      if (!registerResult.ok) {
        setSyncError(registerResult.error ?? 'Could not create account')
        return
      }
      setSyncEmail('')
      setSyncPassword('')
      setSyncPasswordConfirm('')
      setVerificationSentTo(null)
      setVerificationCode('')
      await loadSyncStatus()
    } finally {
      setSyncBusy(false)
    }
  }

  const cancelSyncVerification = (): void => {
    setVerificationSentTo(null)
    setVerificationCode('')
    setSyncError(null)
    setSyncMsg(null)
  }

  const triggerSyncNow = async (): Promise<void> => {
    setSyncError(null)
    setSyncMsg(null)
    setSyncBusy(true)
    try {
      const result = await api().sync.now()
      setSyncMsg(result.ok ? 'Synced.' : null)
      if (!result.ok) setSyncError(result.error ?? 'Sync failed')
    } finally {
      setSyncBusy(false)
    }
  }

  const disconnectSync = async (): Promise<void> => {
    setSyncBusy(true)
    try {
      await api().sync.logout()
      await loadSyncStatus()
      setSyncMsg(null)
      setSyncError(null)
    } finally {
      setSyncBusy(false)
    }
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

  const scheduleType = checkInSchedule.scheduleType ?? 'weekday'
  const dayOfMonth = checkInSchedule.dayOfMonth ?? 1

  const checkInPreview = scheduleType === 'day_of_month'
    ? `Artha will remind you on the ${ordinal(dayOfMonth)} of every month.`
    : `Artha will remind you on the ${OCCURRENCES.find(o => o.value === checkInSchedule.occurrence)?.label ?? ''} ${WEEKDAYS[checkInSchedule.weekday]} of every month.`

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
              color: activeTab === t.id ? 'var(--accent)' : 'var(--text-faint)',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: -1
            }}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── DATA ─────────────────────────────────────────────────────── */}
      {activeTab === 'data' && (
        <>
          {dataSummary && (
            <div className="card section" style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Your data at a glance</div>
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
              same master password, so only you can open it. (API keys and your email reminder
              verification are stored via Windows' own credential store and generally won't carry
              over to a different device or Windows account — you'll just re-verify those.)
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
                  {importSummary.hasSecrets ? ', including saved API keys and email reminder setup' : ''}.
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
        </>
      )}

      {/* ── APPEARANCE ───────────────────────────────────────────────── */}
      {activeTab === 'appearance' && (
        <div className="card section">
          <div className="section-header">
            <h2>Theme</h2>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Choose between dark and light mode. Default is dark.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn ${theme === 'dark' ? '' : 'secondary'}`}
              onClick={() => toggleTheme('dark')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Moon size={13} /> Dark
            </button>
            <button
              className={`btn ${theme === 'light' ? '' : 'secondary'}`}
              onClick={() => toggleTheme('light')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Sun size={13} /> Light
            </button>
          </div>
        </div>
      )}

      {/* ── SECURITY ─────────────────────────────────────────────────── */}
      {activeTab === 'security' && (
        <>
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
            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8 }}>
              Forgot your current password?{' '}
              <a
                href="#"
                style={{ color: 'var(--accent)' }}
                onClick={async (e) => {
                  e.preventDefault()
                  await window.api.auth.lock()
                  window.location.hash = '#/'
                }}
              >
                Go to lock screen →
              </a>
            </p>
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
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '4px 0 0' }}>
                This setting is stored locally and persists across sessions.
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── CLOUD SYNC ───────────────────────────────────────────────── */}
      {activeTab === 'sync' && syncStatus && (
        <>
          {!syncStatus.connected && !verificationSentTo && (
            <div className="card section" style={{ borderColor: 'var(--accent-dim)' }}>
              <div className="section-header">
                <h2>
                  <Cloud size={14} /> Connect to cloud sync
                </h2>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                Keeps your data encrypted on this device before anything is sent — the server
                never sees a usable copy. The same account works from the Artha mobile app.
              </p>

              <div className="form-row">
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={syncEmail} onChange={(e) => setSyncEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input type="password" value={syncPassword} onChange={(e) => setSyncPassword(e.target.value)} />
                </div>
              </div>
              {syncMode === 'register' && (
                <div className="field" style={{ maxWidth: '50%' }}>
                  <label>Confirm password</label>
                  <input
                    type="password"
                    value={syncPasswordConfirm}
                    onChange={(e) => setSyncPasswordConfirm(e.target.value)}
                  />
                </div>
              )}
              {syncError && <div className="error-text">{syncError}</div>}
              {syncMsg && <div className="success-text">{syncMsg}</div>}
              <button
                className="btn"
                onClick={submitSyncEmailPassword}
                disabled={
                  syncBusy ||
                  !syncEmail ||
                  !syncPassword ||
                  (syncMode === 'register' && !syncPasswordConfirm)
                }
              >
                {syncMode === 'register' ? 'Send verification code' : 'Log in'}
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8 }}>
                {syncMode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
                <a
                  href="#"
                  style={{ color: 'var(--accent)' }}
                  onClick={(e) => {
                    e.preventDefault()
                    setSyncMode(syncMode === 'register' ? 'login' : 'register')
                    setSyncError(null)
                  }}
                >
                  {syncMode === 'register' ? 'Log in' : 'Create one'}
                </a>
              </p>
            </div>
          )}

          {!syncStatus.connected && verificationSentTo && (
            <div className="card section" style={{ borderColor: 'var(--accent-dim)' }}>
              <div className="section-header">
                <h2>
                  <Lock size={14} /> Enter your verification code
                </h2>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                We sent a 6-digit code to {verificationSentTo}. It expires in 15 minutes.
              </p>
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
              {syncError && <div className="error-text">{syncError}</div>}
              <button
                className="btn"
                onClick={confirmSyncRegistration}
                disabled={syncBusy || verificationCode.length !== 6}
              >
                Verify &amp; create account
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8 }}>
                <a
                  href="#"
                  style={{ color: 'var(--accent)' }}
                  onClick={(e) => {
                    e.preventDefault()
                    cancelSyncVerification()
                  }}
                >
                  Use a different email
                </a>
              </p>
            </div>
          )}

          {syncStatus.connected && (
            <div className="card section">
              <div className="section-header">
                <h2>
                  <CloudCheck size={14} /> Connected
                </h2>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                Signed in as {syncStatus.email}. Syncs your accounts to the cloud, encrypted on
                this device first.
              </p>
              {syncError && <div className="error-text">{syncError}</div>}
              {syncMsg && <div className="success-text">{syncMsg}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={triggerSyncNow} disabled={syncBusy}>
                  <RefreshCw size={14} /> Sync now
                </button>
                <button className="btn secondary" onClick={disconnectSync} disabled={syncBusy}>
                  <LogOut size={14} /> Disconnect
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── NOTIFICATIONS ────────────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <>
          <div className="card section">
            <div className="section-header">
              <h2>
                <BellRing size={14} /> Expiry reminders
              </h2>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Remind me this many days before</label>
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
                Email notifications (requires a verified email below)
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
              <>
                <div className="form-row" style={{ maxWidth: 420 }}>
                  <div className="field">
                    <label>Schedule type</label>
                    <select
                      value={scheduleType}
                      onChange={(e) =>
                        setCheckInSchedule({
                          ...checkInSchedule,
                          scheduleType: e.target.value as 'weekday' | 'day_of_month'
                        })
                      }
                    >
                      <option value="weekday">Nth weekday (e.g. First Saturday)</option>
                      <option value="day_of_month">Specific day of month (e.g. 15th)</option>
                    </select>
                  </div>
                </div>

                {scheduleType === 'weekday' && (
                  <div className="form-row" style={{ maxWidth: 420 }}>
                    <div className="field">
                      <label>Occurrence</label>
                      <select
                        value={checkInSchedule.occurrence}
                        onChange={(e) =>
                          setCheckInSchedule({
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
                          setCheckInSchedule({
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

                {scheduleType === 'day_of_month' && (
                  <div className="form-row" style={{ maxWidth: 420 }}>
                    <div className="field">
                      <label>Day of month</label>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={dayOfMonth}
                        onChange={(e) =>
                          setCheckInSchedule({
                            ...checkInSchedule,
                            dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value)))
                          })
                        }
                      />
                    </div>
                  </div>
                )}

                <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '6px 0 8px' }}>
                  {checkInPreview}
                </p>
                <button className="btn" onClick={() => saveCheckInSchedule(checkInSchedule)}>
                  Save
                </button>
              </>
            )}
            {checkInSaved && <span className="success-text" style={{ marginLeft: 10 }}>Saved</span>}
          </div>

          {notifyStatus && !notifyStatus.verified && !notifyVerificationSentTo && (
            <div className="card section">
              <div className="section-header">
                <h2>
                  <Mail size={14} /> Email reminders
                </h2>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                Verify an email address to receive reminders. We'll send a 6-digit code to confirm
                it's yours — no password or SMTP setup needed.
              </p>
              <div className="field" style={{ maxWidth: '50%' }}>
                <label>Email</label>
                <input type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />
              </div>
              {notifyError && <div className="error-text">{notifyError}</div>}
              {notifyMsg && <div className="success-text">{notifyMsg}</div>}
              <button className="btn" onClick={requestNotifyCode} disabled={notifyBusy || !notifyEmail}>
                Send code
              </button>
            </div>
          )}

          {notifyStatus && !notifyStatus.verified && notifyVerificationSentTo && (
            <div className="card section">
              <div className="section-header">
                <h2>
                  <Lock size={14} /> Enter your verification code
                </h2>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                We sent a 6-digit code to {notifyVerificationSentTo}. It expires in 15 minutes.
              </p>
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={notifyCode}
                  onChange={(e) => setNotifyCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
              {notifyError && <div className="error-text">{notifyError}</div>}
              <button className="btn" onClick={confirmNotifyCode} disabled={notifyBusy || notifyCode.length !== 6}>
                Verify email
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8 }}>
                <a
                  href="#"
                  style={{ color: 'var(--accent)' }}
                  onClick={(e) => {
                    e.preventDefault()
                    cancelNotifyVerification()
                  }}
                >
                  Use a different email
                </a>
              </p>
            </div>
          )}

          {notifyStatus && notifyStatus.verified && (
            <div className="card section">
              <div className="section-header">
                <h2>
                  <Mail size={14} /> Email reminders
                </h2>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                Reminders will be sent to <strong>{notifyStatus.email}</strong>.
              </p>
              {notifyError && <div className="error-text">{notifyError}</div>}
              {notifyMsg && <div className="success-text">{notifyMsg}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn secondary" onClick={testEmail} disabled={testBusy}>
                  {testBusy ? 'Sending…' : 'Send test email'}
                </button>
                <button className="btn secondary" onClick={disconnectNotify} disabled={notifyBusy}>
                  <LogOut size={14} /> Use a different email
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── AI ───────────────────────────────────────────────────────── */}
      {activeTab === 'ai' && (
        <div className="card section">
          <div className="section-header">
            <h2>
              <Sparkles size={14} /> Auto-fill from documents
            </h2>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Artha can read your policy PDFs, loan schedules and identity documents and fill in the fields automatically.
            Your chosen AI provider reads each document you upload, and the details are saved privately on your device.
            Requires an API key from that provider.
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
              <button
                className="btn secondary"
                style={{ fontSize: 12, padding: '6px 14px', marginLeft: 8 }}
                onClick={testAiKey}
                disabled={!anthropicKey}
              >
                Test key
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
      )}

      {/* ── HELP ─────────────────────────────────────────────────────── */}
      {activeTab === 'help' && updateStatus && (
        <div className="card section">
          <div className="section-header">
            <h2>Updates</h2>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            {updateStatus.version ? `You're running Artha ${updateStatus.version}. ` : ''}
            Checking for updates contacts GitHub (github.com) to see if a newer version is
            available. Nothing about you or your data is sent.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={updateStatus.autoCheck}
              onChange={(e) => toggleAutoUpdate(e.target.checked)}
            />
            Check for updates automatically
          </label>
          <button className="btn secondary" onClick={checkForUpdates} disabled={updateBusy}>
            {updateBusy ? 'Checking…' : 'Check now'}
          </button>
          {updateMsg && <div className="success-text">{updateMsg}</div>}
        </div>
      )}

      {activeTab === 'help' && (
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
        </div>
      )}
    </div>
  )
}
