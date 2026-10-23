import { useEffect, useRef, useState } from 'react'
import splashMp4 from './assets/splash.mp4'
import logo from './assets/logo.png'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  ShieldCheck,
  IdCard,
  CreditCard as CreditCardIcon,
  KeyRound,
  Settings as SettingsIcon,
  LockKeyhole,
  Sun,
  Moon
} from 'lucide-react'
import type { AuthStatus } from '../../shared/types'
import AuthGate from './pages/AuthGate'
import StorageChoiceGate from './pages/StorageChoiceGate'
import TourMode from './components/TourMode'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Insurance from './pages/Insurance'
import IdentityDocuments from './pages/IdentityDocuments'
import CreditCards from './pages/CreditCards'
import Vault from './pages/Vault'
import Settings from './pages/Settings'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'Accounts', icon: Wallet, end: false },
  { to: '/cards', label: 'Credit Cards', icon: CreditCardIcon, end: false },
  { to: '/insurance', label: 'Insurance', icon: ShieldCheck, end: false },
  { to: '/ids', label: 'IDs', icon: IdCard, end: false },
  { to: '/vault', label: 'Vault', icon: KeyRound, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false }
]

export default function App(): JSX.Element {
  // Item 52 — show splash only on first launch
  const [showSplash, setShowSplash] = useState(() => {
    const seen = localStorage.getItem('artha_splash_seen')
    return !seen
  })
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [tourMode, setTourMode] = useState(false)

  // Reset scroll to the top of the page on every route change — otherwise a tab
  // switch can land mid-scroll, wherever the previous tab happened to be.
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  // null = not loaded yet; 'local' | 'cloud' = already answered (possibly just now);
  // 'unanswered' = genuinely fresh install, show the choice screen before AuthGate.
  const [storageMode, setStorageModeState] = useState<'local' | 'cloud' | 'unanswered' | null>(null)
  useEffect(() => {
    window.api.storageMode.status().then((r) => setStorageModeState(r.mode ?? 'unanswered'))
  }, [])

  // Item 47 — theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('artha_theme') as 'dark' | 'light') ?? 'dark'
  )

  // Item 53 — first-run empty state
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null)

  // Item 55 — auto-lock warning state
  const [autoLockWarning, setAutoLockWarning] = useState(false)

  const refreshStatus = async (): Promise<void> => {
    const s = await window.api.auth.status()
    setStatus(s)
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  // Item 53 — check if user has accounts after unlock
  useEffect(() => {
    if (!status?.unlocked) return
    window.api.accounts.list().then((list) => setHasAccounts(list.length > 0))
  }, [status?.unlocked])

  // Auto-lock after configurable period of inactivity (stored in localStorage, default 5 min)
  // Item 55 — warn 60s before lock
  useEffect(() => {
    if (!status?.unlocked) return

    const stored = localStorage.getItem('artha_autolock_minutes')
    const minutes = stored === 'never' ? null : Number(stored ?? '5')
    if (!minutes) return
    const TIMEOUT_MS = minutes * 60_000
    let timer: ReturnType<typeof setTimeout>
    let warnTimer: ReturnType<typeof setTimeout>

    const resetTimers = (): void => {
      clearTimeout(timer)
      clearTimeout(warnTimer)
      setAutoLockWarning(false)
      // warn 60s before lock
      if (TIMEOUT_MS > 60_000) {
        warnTimer = setTimeout(() => setAutoLockWarning(true), TIMEOUT_MS - 60_000)
      }
      timer = setTimeout(async () => {
        setAutoLockWarning(false)
        await window.api.auth.lock()
        refreshStatus()
      }, TIMEOUT_MS)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, resetTimers, { passive: true }))
    resetTimers()

    return () => {
      clearTimeout(timer)
      clearTimeout(warnTimer)
      events.forEach((e) => window.removeEventListener(e, resetTimers))
    }
  }, [status?.unlocked])

  useEffect(() => {
    const handler = (): void => setTourMode(true)
    window.addEventListener('artha:start-tour', handler)
    return () => window.removeEventListener('artha:start-tour', handler)
  }, [])

  // Apply saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('artha_theme') ?? 'dark'
    if (savedTheme === 'light') document.body.classList.add('light-mode')
    else document.body.classList.remove('light-mode')
  }, [])

  // Item 47 — theme toggle function
  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('artha_theme', next)
    if (next === 'light') document.body.classList.add('light-mode')
    else document.body.classList.remove('light-mode')
  }

  // Item 48 — global keyboard shortcuts
  useEffect(() => {
    if (!status?.unlocked) return
    const handler = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'l') { e.preventDefault(); window.api.auth.lock().then(refreshStatus) }
      if (mod && e.key === '1') { e.preventDefault(); window.location.hash = '#/' }
      if (mod && e.key === '2') { e.preventDefault(); window.location.hash = '#/accounts' }
      if (mod && e.key === '3') { e.preventDefault(); window.location.hash = '#/cards' }
      if (mod && e.key === '4') { e.preventDefault(); window.location.hash = '#/insurance' }
      if (mod && e.key === '5') { e.preventDefault(); window.location.hash = '#/ids' }
      if (mod && e.key === '6') { e.preventDefault(); window.location.hash = '#/vault' }
      if (mod && e.key === '7') { e.preventDefault(); window.location.hash = '#/settings' }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [status?.unlocked])

  if (showSplash) {
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
        <video
          src={splashMp4}
          autoPlay
          muted
          playsInline
          onEnded={() => { localStorage.setItem('artha_splash_seen', '1'); setShowSplash(false) }}
          onError={() => { localStorage.setItem('artha_splash_seen', '1'); setShowSplash(false) }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    )
  }

  if (!status || storageMode === null) return <div className="gate">Loading…</div>

  if (tourMode) {
    return <TourMode onExit={() => setTourMode(false)} isLoggedIn={status.unlocked} />
  }

  if (!status.unlocked) {
    // Only a genuinely fresh install (never initialized, never answered) sees this —
    // see ipc.ts's storageModeStatus handler. Choosing "local" leads straight into
    // the exact same master-password setup as always; cloud sync can be turned on
    // from Settings any time regardless of what's picked here.
    if (!status.initialized && storageMode === 'unanswered') {
      return <StorageChoiceGate onChosen={(mode) => setStorageModeState(mode)} />
    }
    return (
      <AuthGate
        initialized={status.initialized}
        onUnlocked={() => {
          // A first-time cloud choice lands on Cloud Sync so there's something to do
          // next; everyone else (including every "local" choice) goes to the
          // dashboard exactly as before.
          window.location.hash = !status.initialized && storageMode === 'cloud' ? '#/settings?tab=sync' : '#/'
          refreshStatus()
        }}
        onTakeTour={() => setTourMode(true)}
      />
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logo} alt="Artha" style={{ width: 120, height: 48, objectFit: 'contain' }} />
        </div>
        <nav>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              end={end}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {/* Item 47 — theme toggle */}
          <button
            className="lock-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ marginBottom: 6 }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          {/* Item 51 — lock button with tooltip */}
          <button
            className="lock-btn"
            title="Lock Artha and return to password screen (Ctrl+L)"
            onClick={async () => {
              await window.api.auth.lock()
              refreshStatus()
            }}
          >
            <LockKeyhole size={14} />
            Lock app
          </button>
        </div>
      </aside>
      <main className="main" ref={mainRef}>
        {/* Item 53 — first-run banner */}
        {hasAccounts === false && (
          <div style={{ background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Welcome to Artha!</div>
              <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>Start by adding your first account to see your net worth.</div>
            </div>
            <a href="#/accounts" style={{ color: '#fff', fontWeight: 600, fontSize: 13, textDecoration: 'none', background: 'rgba(255,255,255,0.2)', padding: '7px 14px', borderRadius: 6 }}>Add account →</a>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/insurance" element={<Insurance />} />
          <Route path="/ids" element={<IdentityDocuments />} />
          <Route path="/cards" element={<CreditCards />} />
          <Route path="/vault" element={<Vault />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {/* Item 55 — auto-lock warning toast */}
      {autoLockWarning && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 20px', fontSize: 13, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)' }}>Locking in 1 minute due to inactivity</span>
          <button className="btn secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => { setAutoLockWarning(false); window.dispatchEvent(new MouseEvent('mousemove')) }}>Stay logged in</button>
        </div>
      )}
    </div>
  )
}
