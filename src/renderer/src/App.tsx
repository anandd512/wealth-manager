import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  ShieldCheck,
  IdCard,
  CreditCard as CreditCardIcon,
  KeyRound,
  Settings as SettingsIcon,
  LockKeyhole
} from 'lucide-react'
import type { AuthStatus } from '../../shared/types'
import AuthGate from './pages/AuthGate'
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
  { to: '/insurance', label: 'Insurance', icon: ShieldCheck, end: false },
  { to: '/ids', label: 'IDs', icon: IdCard, end: false },
  { to: '/cards', label: 'Credit Cards', icon: CreditCardIcon, end: false },
  { to: '/vault', label: 'Logins & Passwords', icon: KeyRound, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false }
]

export default function App(): JSX.Element {
  const [status, setStatus] = useState<AuthStatus | null>(null)

  const refreshStatus = async (): Promise<void> => {
    const s = await window.api.auth.status()
    setStatus(s)
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  if (!status) return <div className="gate">Loading…</div>

  if (!status.unlocked) {
    return <AuthGate initialized={status.initialized} onUnlocked={refreshStatus} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">W</span>
          Wealth Manager
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
          <button
            className="lock-btn"
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
      <main className="main">
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
    </div>
  )
}
