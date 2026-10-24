/**
 * TourMode — an interactive walkthrough of the actual Artha product experience.
 *
 * Architecture:
 *  1. On mount we swap window.api with a mock that returns Dev Sharma's demo data.
 *  2. The real product pages (Dashboard, Accounts, etc.) are rendered inside a
 *     MemoryRouter so users see the exact same UI they will use every day.
 *  3. A floating guide panel gives context and navigation for each step.
 *  4. For "add" demos a full-screen overlay modal replicates the real modal with
 *     animated typing (manual fields) or instant population (AI extraction).
 *  5. On unmount the original window.api is restored.
 */

import { useEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  ShieldCheck,
  IdCard,
  CreditCard as CreditCardIcon,
  KeyRound,
  Settings as SettingsIcon,
  LockKeyhole,
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Star,
  Bot,
  FileText,
  Loader2,
  Check,
  Eye,
  EyeOff,
  Bell,
  Upload,
  Cloud,
} from 'lucide-react'
import logo from '../assets/logo.png'
import Dashboard from '../pages/Dashboard'
import Accounts from '../pages/Accounts'
import Insurance from '../pages/Insurance'
import IdentityDocuments from '../pages/IdentityDocuments'
import CreditCards from '../pages/CreditCards'
import Vault from '../pages/Vault'
import { createTourApi } from '../lib/tourApi'
import { setMockApi, clearMockApi } from '../lib/api'

// ─── Tour step definitions ────────────────────────────────────────────────────

interface TourStep {
  key: string
  nav: string
  route: string | null   // null = show a full-screen overlay instead of real page
  icon: React.ComponentType<{ size?: number }>
  title: string
  desc: string
  tip?: string
  // If set, a "Watch demo" button appears in the guide panel that launches this demo
  demoKey?: 'account' | 'ai' | 'ai_insurance' | 'ai_identity' | 'card' | 'vault'
}

const STEPS: TourStep[] = [
  {
    key: 'welcome', nav: 'Welcome', route: null, icon: Sparkles,
    title: 'Welcome to Artha',
    desc: 'Your personal finance command center — accounts, insurance, identity documents, credit cards, and passwords, all encrypted locally on your device.',
    tip: 'Local-first by default — nothing leaves your device unless you turn on cloud sync, which is entirely your choice.',
  },
  {
    key: 'dashboard', nav: 'Dashboard', route: '/', icon: LayoutDashboard,
    title: 'Net worth at a glance',
    desc: 'See your complete financial picture the moment you open the app — total assets, liabilities, and net worth trend at a glance. No spreadsheets, no manual totalling.',
    tip: 'The chart updates every time you log a new value. The more data you add, the more useful it becomes.',
  },
  {
    key: 'upcoming', nav: 'Upcoming', route: '/', icon: Bell,
    title: 'Never miss a deadline',
    desc: 'Stop worrying about due dates. Artha automatically calculates upcoming insurance renewals, card payment dates, and more — and can email you before anything slips.',
    tip: 'You\'ll never pay a late fee or let a policy lapse again.',
  },
  {
    key: 'accounts', nav: 'Accounts', route: '/accounts', icon: Wallet,
    title: 'All your financial accounts',
    desc: 'Add everything that makes up your wealth — bank accounts, mutual funds, FDs, real estate, and loans. Your net worth updates instantly. Tap any row to log a new value or view its history.',
    tip: 'Add your main bank account first — it\'s the fastest way to see your net worth come to life.',
    demoKey: 'account',
  },
  {
    key: 'ai', nav: 'AI Extraction', route: '/accounts', icon: Bot,
    title: 'AI does the heavy lifting',
    desc: 'Got a loan statement or insurance PDF? Upload it and AI reads the document and fills every field instantly — lender, rate, tenure, outstanding balance. No typing required. Add your API key in Settings → AI & Extraction to enable this.',
    tip: 'Your chosen AI provider reads the document, and the details are saved privately on your device.',
    demoKey: 'ai',
  },
  {
    key: 'cards', nav: 'Credit Cards', route: '/cards', icon: CreditCardIcon,
    title: 'Stay on top of bills',
    desc: 'Add your credit cards and Artha tracks payment due dates for you. It can even email you a reminder before the due date so you never pay a late fee or interest again.',
    tip: 'Add your statement date and Artha will remind you before the payment due date — no late fees, ever.',
    demoKey: 'card',
  },
  {
    key: 'insurance', nav: 'Insurance', route: '/insurance', icon: ShieldCheck,
    title: 'Never miss a renewal',
    desc: 'One place for all your policies — life, health, vehicle. Artha tells you exactly when each one is up for renewal so nothing ever lapses. Upload the PDF and AI fills the details automatically. Requires an API key in Settings → AI & Extraction.',
    tip: 'Upload your policy PDF and AI reads your cover amount, premium, and renewal date. Your chosen AI provider reads the document, and the details are saved privately on your device.',
    demoKey: 'ai_insurance',
  },
  {
    key: 'ids', nav: 'Identity Docs', route: '/ids', icon: IdCard,
    title: 'All your IDs, organised',
    desc: 'Stop hunting for your Aadhaar number or passport details. Keep all your IDs in one encrypted place, with document images stored securely on your device.',
    tip: 'Upload a photo or scan and AI reads the number, name, and expiry. Your chosen AI provider reads the document, and the details are saved privately on your device.',
    demoKey: 'ai_identity',
  },
  {
    key: 'vault', nav: 'Passwords', route: '/vault', icon: KeyRound,
    title: 'Secure password vault',
    desc: 'A secure home for all your logins — encrypted alongside your financial data. No LastPass subscription, no third-party breach risk — and if you turn on cloud sync, your passwords sync the same end-to-end encrypted way everything else does.',
    tip: 'All your logins encrypted alongside your financial data — no separate password manager needed.',
    demoKey: 'vault',
  },
  {
    key: 'security', nav: 'Security', route: null, icon: LockKeyhole,
    title: 'Bank-grade encryption',
    desc: 'Your data is encrypted before it ever touches your disk. Even if someone stole your laptop, they\'d see nothing without your master password. We use the same encryption as your bank.',
    tip: 'Enable Windows Hello to unlock with your face or fingerprint instead of typing your password.',
  },
  {
    key: 'cloudsync', nav: 'Cloud Sync', route: null, icon: Cloud,
    title: 'Access it from your phone too',
    desc: 'Artha stays local-only by default, but you can turn on cloud sync any time from Settings → Cloud Sync — sign in with email, Google, or Microsoft, and the same data becomes available on the Artha mobile app. Your device encrypts everything before it ever leaves — the cloud side never sees a usable copy.',
    tip: 'Choose local-only or cloud sync when you first set up Artha. Either way, you can switch to cloud sync later from Settings without losing anything.',
  },
  {
    key: 'done', nav: 'Get started', route: null, icon: Star,
    title: "You're ready!",
    desc: "First, choose whether your data stays on this device or syncs to the cloud too — then set a master password to create your encrypted vault. Back up anytime with the built-in export.",
    tip: undefined,
  },
]

// ─── Shared button-click coach mark ──────────────────────────────────────────

function DemoButtonClick({ label, subText, buttonText }: { label: string; subText: string; buttonText?: string }): JSX.Element {
  const [step, setStep] = useState(0)
  const [btnRect, setBtnRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  // step 0: tooltip only; 1: cursor at tooltip; 2: cursor moves to button; 3: click fires

  useEffect(() => {
    const measureBtn = (): void => {
      const allBtns = Array.from(document.querySelectorAll('button'))
      // Find by buttonText prop first, otherwise fall back to the last .btn in the toolbar
      const target = buttonText
        ? allBtns.find(b => b.textContent?.includes(buttonText))
        : allBtns.filter(b => b.classList.contains('btn') && !b.classList.contains('secondary')).slice(-1)[0]
      if (target) {
        const r = target.getBoundingClientRect()
        setBtnRect({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height })
      }
    }
    const measure = setTimeout(measureBtn, 50)
    const t1 = setTimeout(() => setStep(1), 300)
    const t2 = setTimeout(() => setStep(2), 900)
    const t3 = setTimeout(() => setStep(3), 1300)
    const t4 = setTimeout(() => setStep(2), 1700)
    return () => { clearTimeout(measure); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [buttonText])

  const btnX = btnRect?.x ?? (window.innerWidth - 90)
  const btnY = btnRect?.y ?? 28
  const startX = btnX - 70
  const startY = btnY + 90

  const cursorX = step <= 1 ? startX : btnX
  const cursorY = step <= 1 ? startY : btnY

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none' }}>
      {/* Tooltip below the real button */}
      <div style={{ position: 'absolute', top: (btnRect?.y ?? 28) + (btnRect?.h ?? 12) / 2 + 8, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', pointerEvents: 'none' }}>
        <div style={{ width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '8px solid var(--accent)', marginRight: 20 }} />
        <div style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 500, lineHeight: 1.5, maxWidth: 240, boxShadow: '0 8px 24px rgba(91,141,239,0.4)' }}>
          {label}
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 3 }}>{subText}</div>
        </div>
      </div>
      {/* Highlight ring around the real button */}
      {btnRect && (
        <div style={{
          position: 'fixed',
          left: btnRect.x - btnRect.w / 2 - 4,
          top: btnRect.y - btnRect.h / 2 - 4,
          width: btnRect.w + 8,
          height: btnRect.h + 8,
          borderRadius: 8,
          border: '2px solid rgba(91,141,239,0.85)',
          background: 'rgba(91,141,239,0.1)',
          pointerEvents: 'none',
          zIndex: 201,
          boxShadow: '0 0 0 3px rgba(91,141,239,0.15)',
        }} />
      )}
      {step > 0 && (
        <>
          <div style={{
            position: 'fixed', left: cursorX, top: cursorY,
            width: 16, height: 16, borderRadius: '50%',
            background: 'rgba(91,141,239,0.9)', border: '2.5px solid #fff',
            transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 202,
            boxShadow: '0 2px 10px rgba(91,141,239,0.55)',
            transition: 'left 600ms cubic-bezier(0.4,0,0.2,1), top 600ms cubic-bezier(0.4,0,0.2,1)',
          }} />
          {step === 3 && (
            <div style={{
              position: 'fixed', left: btnX, top: btnY,
              width: 44, height: 44, borderRadius: '50%',
              border: '2px solid rgba(91,141,239,0.65)',
              transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 200,
              animation: 'wt-click-ripple 400ms ease-out forwards',
            }} />
          )}
        </>
      )}
    </div>
  )
}

// ─── Demo modal: Manual account entry ────────────────────────────────────────

// Only the typed text fields — selects (Category, Type) are shown as pre-filled statics
const ACC_DEMO_TEXT = [
  { label: 'Name',              value: 'SBI Savings Account' },
  { label: 'Institution',       value: 'State Bank of India' },
  { label: 'Current value (₹)', value: '1,75,000' },
]

function DemoAccountModal({ onDone }: { onDone: () => void }): JSX.Element {
  const [formReady, setFormReady] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'typing' | 'done'>('idle')
  const [fi, setFi] = useState(0)
  const [typed, setTyped] = useState(ACC_DEMO_TEXT.map(() => ''))

  useEffect(() => {
    const t = setTimeout(() => setFormReady(true), 1800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!formReady) return
    const t = setTimeout(() => setPhase('typing'), 500)
    return () => clearTimeout(t)
  }, [formReady])

  useEffect(() => {
    if (phase !== 'typing') return
    let charIdx = 0
    let fieldIdx = fi

    const tick = (): void => {
      charIdx++
      setTyped((prev) => {
        const next = [...prev]
        next[fieldIdx] = ACC_DEMO_TEXT[fieldIdx].value.slice(0, charIdx)
        return next
      })
      if (charIdx < ACC_DEMO_TEXT[fieldIdx].value.length) {
        setTimeout(tick, 38)
      } else {
        const nextFi = fieldIdx + 1
        if (nextFi < ACC_DEMO_TEXT.length) {
          setTimeout(() => {
            setFi(nextFi)
            fieldIdx = nextFi
            charIdx = 0
            setTimeout(tick, 80)
          }, 350)
        } else {
          setTimeout(() => setPhase('done'), 600)
        }
      }
    }
    setTimeout(tick, 120)
  }, [phase])

  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(onDone, 1500)
    return () => clearTimeout(t)
  }, [phase])

  const activeStyle = (idx: number) => ({
    borderColor: fi === idx && phase === 'typing' ? 'var(--accent)' : undefined,
    boxShadow: fi === idx && phase === 'typing' ? '0 0 0 3px var(--accent-soft)' : undefined,
  })

  if (!formReady) {
    return <DemoButtonClick label='Click "Add account" to start tracking' subText="Banks, investments, loans, FDs — all in one place." buttonText="Add account" />
  }

  return (
    <div className="modal-backdrop tour-demo-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Add account</h2>
          {phase === 'done' && <span className="badge ok"><Check size={11} /> Saved!</span>}
        </div>

        {/* Row 1: Category + Type — both pre-filled selects, matching real modal */}
        <div className="form-row">
          <div className="field">
            <label>Category</label>
            <select defaultValue="bank">
              <option value="bank">Bank Accounts</option>
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select defaultValue="savings">
              <option value="savings">Savings</option>
            </select>
          </div>
        </div>

        {/* Name — full width, matching real modal */}
        <div className="field">
          <label>Name</label>
          <input readOnly value={typed[0]} placeholder="e.g. HDFC Savings"
            className={fi === 0 && phase === 'typing' ? 'tour-typing-cursor' : ''}
            style={activeStyle(0)} />
        </div>

        {/* Row 2: Institution + Current value — matching real modal */}
        <div className="form-row">
          <div className="field">
            <label>Institution</label>
            <input readOnly value={typed[1]} placeholder="e.g. HDFC Bank"
              className={fi === 1 && phase === 'typing' ? 'tour-typing-cursor' : ''}
              style={activeStyle(1)} />
          </div>
          <div className="field">
            <label>Current value (₹)</label>
            <input readOnly value={typed[2]}
              className={fi === 2 && phase === 'typing' ? 'tour-typing-cursor' : ''}
              style={activeStyle(2)} />
          </div>
        </div>

        <div className="modal-actions">
          {phase === 'done' ? (
            <button className="btn" style={{ background: 'var(--green)', boxShadow: '0 4px 14px rgba(62,207,142,0.35)', pointerEvents: 'none' }}>
              <Check size={14} /> Saved!
            </button>
          ) : (
            <>
              <button className="btn secondary" disabled>Cancel</button>
              <button className="btn" disabled>Save</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared AI demo modal (accounts loan schedule + insurance policy) ─────────

type AIPhase = 'button' | 'form_nav' | 'picker' | 'file_selected' | 'extracting' | 'done'

// Fictional demo files for the Windows-style file picker
const LOAN_PICKER_FILES = [
  { name: 'Loan_Schedule_HDFC_2024.pdf',    date: 'Today, 7:12 AM',      type: 'PDF' },
  { name: 'Car_Insurance_Policy.pdf',        date: 'Today, 6:55 AM',      type: 'PDF' },
  { name: 'Bank_Statement_Q3_2026.pdf',      date: 'Yesterday, 11:30 PM', type: 'PDF' },
  { name: 'Salary_Slip_Sep_2026.pdf',        date: 'Yesterday, 10:05 PM', type: 'PDF' },
  { name: 'Home_Loan_Statement.pdf',         date: '18 Oct 2026, 5:26 AM',type: 'PDF' },
  { name: 'Tax_Returns_FY2025.pdf',          date: '18 Oct 2026, 4:19 AM',type: 'PDF' },
]

const INSURANCE_PICKER_FILES = [
  { name: 'Motor_Policy_Bajaj_2026.pdf',     date: 'Today, 7:12 AM',      type: 'PDF' },
  { name: 'Health_Policy_HDFC_ERGO.pdf',     date: 'Today, 6:55 AM',      type: 'PDF' },
  { name: 'Loan_Schedule_2024.pdf',          date: 'Yesterday, 11:30 PM', type: 'PDF' },
  { name: 'Salary_Slip_Oct_2026.pdf',        date: 'Yesterday, 10:05 PM', type: 'PDF' },
  { name: 'Bank_Statement_Sep.pdf',          date: '18 Oct 2026, 5:26 AM',type: 'PDF' },
  { name: 'Term_Life_Policy.pdf',            date: '18 Oct 2026, 4:19 AM',type: 'PDF' },
]

interface AIModalProps {
  title: string
  fileName: string
  pickerTitle: string
  pickerFiles: { name: string; date: string; type: string }[]
  fields: Record<string, string>
  onDone: () => void
  buttonLabel: string
  buttonHint: string
  FormNav?: React.ComponentType  // NEW — component rendered during form_nav phase
}

function DemoAIModalBase({ title, fileName, pickerTitle, pickerFiles, fields, onDone, buttonLabel, buttonHint, FormNav }: AIModalProps): JSX.Element {
  const [phase, setPhase] = useState<AIPhase>('button')
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null)

  useEffect(() => {
    // 'button' runs the shared coach mark (cursor reaches the button and clicks at ~1.5s).
    // Demos without an intermediate form go straight from the click to the file picker.
    const navMs = FormNav ? 2700 : 0
    const t0 = setTimeout(() => setPhase(FormNav ? 'form_nav' : 'picker'), 1900)
    const t1 = setTimeout(() => setPhase('picker'), 1900 + navMs)
    const t2 = setTimeout(() => setHighlightedFile(fileName), 2900 + navMs)
    const t3 = setTimeout(() => { setPhase('file_selected'); setHighlightedFile(null) }, 3800 + navMs)
    const t4 = setTimeout(() => setPhase('extracting'), 4100 + navMs)
    const t5 = setTimeout(() => setPhase('done'), 6300 + navMs)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5) }
  }, [])

  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(onDone, 1800)
    return () => clearTimeout(t)
  }, [phase])

  // Windows 11 dark-mode file dialog colours (hardcoded, not app theme)
  const W = {
    bg:        '#202020',
    sidebar:   '#1c1c1c',
    toolbar:   '#2a2a2a',
    border:    '#3a3a3a',
    text:      '#e8e8e8',
    muted:     '#999999',
    highlight: '#0067c0',
    hover:     '#2e2e2e',
    btnBg:     '#3a3a3a',
    btnText:   '#e8e8e8',
  }

  if (phase === 'button') {
    return (
      <DemoButtonClick
        label={buttonHint}
        subText="AI reads the PDF and fills every field instantly."
        buttonText={buttonLabel}
      />
    )
  }

  if (phase === 'form_nav') {
    const Nav = FormNav
    return Nav ? <Nav /> : null
  }

  return (
    <div className="modal-backdrop tour-demo-backdrop" onClick={(e) => e.stopPropagation()}>
      {/* Windows 11-style file open dialog */}
      {phase === 'picker' && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
          <div style={{
            background: W.bg, border: `1px solid ${W.border}`, borderRadius: 8,
            width: 560, boxShadow: '0 32px 80px rgba(0,0,0,0.7)', overflow: 'hidden',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
          }}>
            {/* Window title bar */}
            <div style={{ background: W.toolbar, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${W.border}` }}>
              <span style={{ fontSize: 12, color: W.text }}>{pickerTitle}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {['─', '□', '✕'].map(s => (
                  <div key={s} style={{ width: 28, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: W.muted, cursor: 'default' }}>{s}</div>
                ))}
              </div>
            </div>
            {/* Navigation toolbar */}
            <div style={{ background: W.toolbar, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${W.border}` }}>
              <div style={{ display: 'flex', gap: 2 }}>
                {['←', '→', '↑'].map(a => (
                  <div key={a} style={{ width: 24, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: W.muted, cursor: 'default' }}>{a}</div>
                ))}
              </div>
              <div style={{ flex: 1, background: W.hover, border: `1px solid ${W.border}`, borderRadius: 4, padding: '3px 8px', fontSize: 12, color: W.text }}>
                Downloads &rsaquo;
              </div>
              <div style={{ width: 120, background: W.hover, border: `1px solid ${W.border}`, borderRadius: 4, padding: '3px 8px', fontSize: 12, color: W.muted }}>
                Search
              </div>
            </div>
            {/* Action toolbar */}
            <div style={{ background: W.toolbar, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${W.border}` }}>
              {['Organize ▾', 'New folder'].map(l => (
                <div key={l} style={{ fontSize: 11, color: W.text, cursor: 'default', padding: '2px 6px' }}>{l}</div>
              ))}
            </div>
            {/* Body: sidebar + file list */}
            <div style={{ display: 'flex' }}>
              {/* Sidebar */}
              <div style={{ width: 130, background: W.sidebar, borderRight: `1px solid ${W.border}`, padding: '8px 0', flexShrink: 0 }}>
                {['Home', 'Desktop', 'Downloads', 'Documents', 'Pictures', 'Music'].map(l => (
                  <div key={l} style={{
                    padding: '5px 14px', fontSize: 12, color: l === 'Downloads' ? W.text : W.muted,
                    background: l === 'Downloads' ? W.hover : 'transparent', cursor: 'default',
                  }}>{l}</div>
                ))}
              </div>
              {/* File list */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 60px', padding: '4px 10px', borderBottom: `1px solid ${W.border}`, background: W.toolbar }}>
                  {['Name', 'Date modified', 'Type'].map(h => (
                    <div key={h} style={{ fontSize: 11, color: W.muted }}>{h}</div>
                  ))}
                </div>
                {/* Files */}
                <div style={{ maxHeight: 180, overflowY: 'auto', background: W.bg }}>
                  {pickerFiles.map((f) => {
                    const isHighlighted = highlightedFile === f.name
                    return (
                      <div key={f.name} style={{
                        display: 'grid', gridTemplateColumns: '1fr 140px 60px',
                        padding: '5px 10px', cursor: 'default',
                        background: isHighlighted ? W.highlight : 'transparent',
                        color: isHighlighted ? '#ffffff' : W.text,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, overflow: 'hidden' }}>
                          <FileText size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        </div>
                        <div style={{ fontSize: 11, color: isHighlighted ? '#cce4ff' : W.muted, display: 'flex', alignItems: 'center' }}>{f.date}</div>
                        <div style={{ fontSize: 11, color: isHighlighted ? '#cce4ff' : W.muted, display: 'flex', alignItems: 'center' }}>{f.type}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            {/* Footer */}
            <div style={{ background: W.toolbar, padding: '10px 12px', borderTop: `1px solid ${W.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: W.muted, flexShrink: 0 }}>File name:</span>
                <div style={{ flex: 1, background: '#ffffff', border: `1px solid ${W.border}`, borderRadius: 3, padding: '3px 6px', fontSize: 12, color: '#000000' }}>
                  {highlightedFile ?? ''}
                </div>
                <div style={{ fontSize: 11, color: W.muted, background: W.btnBg, border: `1px solid ${W.border}`, borderRadius: 3, padding: '3px 8px', flexShrink: 0 }}>
                  Documents (*.pdf;*.png;*.jpg) ▾
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <div style={{ padding: '5px 20px', fontSize: 12, background: highlightedFile ? W.highlight : W.btnBg, color: highlightedFile ? '#fff' : W.btnText, border: `1px solid ${W.border}`, borderRadius: 3, cursor: 'default' }}>
                  Open
                </div>
                <div style={{ padding: '5px 20px', fontSize: 12, background: W.btnBg, color: W.btnText, border: `1px solid ${W.border}`, borderRadius: 3, cursor: 'default' }}>
                  Cancel
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main form modal */}
      {phase !== 'picker' && phase !== 'button' && (
        <div className="modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
            {phase === 'done' && (
              <span className="badge ok" style={{ gap: 5 }}>
                <Bot size={11} /> AI extracted {Object.keys(fields).length} fields
              </span>
            )}
          </div>

          {/* File row */}
          <div className="card" style={{ marginBottom: 14, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fileName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
                  {phase === 'file_selected' && <span style={{ color: 'var(--accent)' }}>File selected — reading…</span>}
                  {phase === 'extracting' && (
                    <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Loader2 size={11} className="spin" /> AI is reading the document…
                    </span>
                  )}
                  {phase === 'done' && <span style={{ color: 'var(--green)' }}>✓ All fields extracted successfully</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            {phase === 'done'
              ? Object.entries(fields).map(([label, value]) => (
                  <div className="field" key={label} style={{ animation: 'modal-in 250ms var(--ease)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {label} <span style={{ color: 'var(--green)', fontSize: 10 }}>● AI</span>
                    </label>
                    <input readOnly value={value} style={{ borderColor: 'var(--green)', fontSize: 12 }} />
                  </div>
                ))
              : Object.keys(fields).map((label) => (
                  <div className="field" key={label}>
                    <label>{label}</label>
                    <input readOnly value="" placeholder="—" style={{ opacity: 0.4 }} />
                  </div>
                ))
            }
          </div>

          <div className="modal-actions">
            {phase === 'done' ? (
              <button className="btn" style={{ background: 'var(--green)', pointerEvents: 'none' }}>
                <Check size={14} /> Saved!
              </button>
            ) : (
              <button className="btn" disabled>Save</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── LoanFormNav: shows Add Account form with cursor clicking Upload button ───

function LoanFormNav(): JSX.Element {
  const [navStep, setNavStep] = useState(0)
  // navStep 0: form appears; 1: cursor at form center; 2: cursor moves to upload btn; 3: click

  useEffect(() => {
    const t1 = setTimeout(() => setNavStep(1), 400)
    const t2 = setTimeout(() => setNavStep(2), 1000)
    const t3 = setTimeout(() => setNavStep(3), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  // Upload button is roughly in the middle of the modal, about 55% down viewport
  const uploadBtnX = window.innerWidth / 2
  const uploadBtnY = Math.round(window.innerHeight * 0.55)
  const startX = Math.round(window.innerWidth / 2)
  const startY = Math.round(window.innerHeight * 0.38)

  const cursorX = navStep <= 1 ? startX : uploadBtnX
  const cursorY = navStep <= 1 ? startY : uploadBtnY

  return (
    <div className="modal-backdrop tour-demo-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="modal">
        <h2 style={{ margin: '0 0 16px' }}>Add account</h2>
        <div className="form-row">
          <div className="field">
            <label>Category</label>
            <select defaultValue="loans" disabled>
              <option value="loans">Loans</option>
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select defaultValue="home_loan" disabled>
              <option value="home_loan">Home Loan</option>
            </select>
          </div>
        </div>
        <div style={{
          border: `2px solid ${navStep >= 2 ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          marginTop: 12,
          display: 'flex', alignItems: 'center', gap: 10,
          background: navStep >= 2 ? 'rgba(91,141,239,0.08)' : 'transparent',
          transition: 'all 300ms',
          cursor: 'default',
        }}>
          <Upload size={15} style={{ color: navStep >= 2 ? 'var(--accent)' : 'var(--text-faint)', flexShrink: 0, transition: 'color 300ms' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: navStep >= 2 ? 'var(--accent)' : 'var(--text-dim)', transition: 'color 300ms' }}>
              Upload loan schedule PDF
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
              AI reads the document and fills every field instantly
            </div>
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn secondary" disabled>Cancel</button>
          <button className="btn" disabled>Save manually</button>
        </div>
      </div>
      {navStep > 0 && (
        <>
          <div style={{
            position: 'fixed', left: cursorX, top: cursorY,
            width: 16, height: 16, borderRadius: '50%',
            background: 'rgba(91,141,239,0.9)', border: '2.5px solid #fff',
            transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 350,
            boxShadow: '0 2px 10px rgba(91,141,239,0.55)',
            transition: 'left 600ms cubic-bezier(0.4,0,0.2,1), top 600ms cubic-bezier(0.4,0,0.2,1)',
          }} />
          {navStep === 3 && (
            <div style={{
              position: 'fixed', left: uploadBtnX, top: uploadBtnY,
              width: 44, height: 44, borderRadius: '50%',
              border: '2px solid rgba(91,141,239,0.65)',
              transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 349,
              animation: 'wt-click-ripple 400ms ease-out forwards',
            }} />
          )}
        </>
      )}
    </div>
  )
}

// Accounts page — loan schedule AI extraction demo
const AI_LOAN_FIELDS = {
  'Account name':      'HDFC Car Loan',
  'Institution':       'HDFC Bank',
  'Principal amount':  '₹8,00,000',
  'Interest rate':     '9.25%',
  'Tenure':            '60 months',
  'EMI amount':        '₹16,620 / month',
  'Start date':        '01 March 2024',
  'Outstanding':       '₹6,82,000',
}
function DemoAIModal({ onDone }: { onDone: () => void }): JSX.Element {
  return (
    <DemoAIModalBase
      title="Add Account — Loan Schedule"
      fileName="Loan_Schedule_HDFC_2024.pdf"
      pickerTitle="Select loan repayment schedule"
      pickerFiles={LOAN_PICKER_FILES}
      fields={AI_LOAN_FIELDS}
      onDone={onDone}
      buttonLabel="Add account"
      buttonHint="On the Accounts page, click Add account — then choose 'Upload loan schedule' to let AI read your PDF"
      FormNav={LoanFormNav}
    />
  )
}

// Insurance page — motor policy AI extraction demo
const AI_INSURANCE_FIELDS = {
  'Policy type':    'Motor — Comprehensive',
  'Insurer':        'Bajaj Allianz General Insurance',
  'Policy number':  'OG-24-9876-5432-00000002',
  'Insured name':   'Dev Sharma',
  'Vehicle number': 'KA 01 AB 5678',
  'Sum insured':    '₹6,00,000',
  'Premium':        '₹8,750 / year',
  'Expiry date':    '22 March 2027',
}
function DemoInsuranceAIModal({ onDone }: { onDone: () => void }): JSX.Element {
  return (
    <DemoAIModalBase
      title="Add Insurance Policy"
      fileName="Motor_Policy_Bajaj_2026.pdf"
      pickerTitle="Select insurance policy document"
      pickerFiles={INSURANCE_PICKER_FILES}
      fields={AI_INSURANCE_FIELDS}
      onDone={onDone}
      buttonLabel="Add via PDF (AI)"
      buttonHint="In the Insurance page toolbar, click 'Add via PDF (AI)' to extract a policy"
    />
  )
}

// Identity docs page — passport scan AI extraction demo
const IDENTITY_PICKER_FILES = [
  { name: 'Passport_Scan_DevSharma.pdf',     date: 'Today, 7:12 AM',      type: 'PDF' },
  { name: 'Aadhaar_Front_Back.pdf',          date: 'Today, 6:55 AM',      type: 'PDF' },
  { name: 'Motor_Policy_Bajaj_2026.pdf',     date: 'Yesterday, 11:30 PM', type: 'PDF' },
  { name: 'Salary_Slip_Oct_2026.pdf',        date: 'Yesterday, 10:05 PM', type: 'PDF' },
  { name: 'PAN_Card_Scan.pdf',               date: '18 Oct 2026, 5:26 AM',type: 'PDF' },
  { name: 'Driving_Licence_Scan.pdf',        date: '18 Oct 2026, 4:19 AM',type: 'PDF' },
]

const AI_IDENTITY_FIELDS = {
  'Document type': 'Passport',
  'ID number':     'P7654321',
  'Full name':     'Dev Sharma',
  'Date of birth': '14 Jul 1990',
  'Issued date':   '21 May 2020',
  'Expiry date':   '20 May 2030',
}
function DemoIdentityAIModal({ onDone }: { onDone: () => void }): JSX.Element {
  return (
    <DemoAIModalBase
      title="Add identity document"
      fileName="Passport_Scan_DevSharma.pdf"
      pickerTitle="Select ID document"
      pickerFiles={IDENTITY_PICKER_FILES}
      fields={AI_IDENTITY_FIELDS}
      onDone={onDone}
      buttonLabel="Add via photo/scan (AI)"
      buttonHint="On the Identity page, click 'Add via photo/scan (AI)' to read an ID automatically"
    />
  )
}

// ─── Demo modal: Credit card manual entry ─────────────────────────────────────

const CARD_DEMO = [
  { label: 'Label',                    value: 'ICICI Coral' },
  { label: 'Issuer',                   value: 'ICICI Bank' },
  { label: 'Card number',              value: '4111 1111 1111 7723' },
  { label: 'Name on card',             value: 'DEV SHARMA' },
  { label: 'Network',                  value: 'Visa' },
  { label: 'Expiry (MM / YY)',         value: '08 / 27' },
  { label: 'Credit limit (₹)',         value: '2,00,000' },
  { label: 'Statement date',           value: '10' },
]

function DemoCreditCardModal({ onDone }: { onDone: () => void }): JSX.Element {
  const [formReady, setFormReady] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'typing' | 'done'>('idle')
  const [fi, setFi] = useState(0)
  const [typed, setTyped] = useState(CARD_DEMO.map(() => ''))

  useEffect(() => {
    const t = setTimeout(() => setFormReady(true), 1800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!formReady) return
    const t = setTimeout(() => setPhase('typing'), 500)
    return () => clearTimeout(t)
  }, [formReady])

  useEffect(() => {
    if (phase !== 'typing') return
    let charIdx = 0
    let fieldIdx = fi
    const tick = (): void => {
      charIdx++
      setTyped((prev) => {
        const next = [...prev]
        next[fieldIdx] = CARD_DEMO[fieldIdx].value.slice(0, charIdx)
        return next
      })
      if (charIdx < CARD_DEMO[fieldIdx].value.length) {
        setTimeout(tick, 45)
      } else {
        const nextFi = fieldIdx + 1
        if (nextFi < CARD_DEMO.length) {
          setTimeout(() => { setFi(nextFi); fieldIdx = nextFi; charIdx = 0; setTimeout(tick, 80) }, 300)
        } else {
          setTimeout(() => setPhase('done'), 500)
        }
      }
    }
    setTimeout(tick, 120)
  }, [phase])

  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(onDone, 1500)
    return () => clearTimeout(t)
  }, [phase])

  if (!formReady) {
    return <DemoButtonClick label='Click "Add card" to track a credit card' subText="Artha reminds you before the due date so you never pay a late fee." buttonText="Add card" />
  }

  return (
    <div className="modal-backdrop tour-demo-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Add credit card</h2>
          {phase === 'done' && <span className="badge ok"><Check size={11} /> Saved!</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
          {CARD_DEMO.map((f, i) => (
            <div className="field" key={f.label}>
              <label>{f.label}</label>
              <input
                readOnly
                value={typed[i]}
                className={fi === i && phase === 'typing' ? 'tour-typing-cursor' : ''}
                style={{
                  borderColor: fi === i && phase === 'typing' ? 'var(--accent)' : undefined,
                  boxShadow: fi === i && phase === 'typing' ? '0 0 0 3px var(--accent-soft)' : undefined,
                }}
              />
            </div>
          ))}
        </div>
        <div className="modal-actions">
          {phase === 'done' ? (
            <button className="btn" style={{ background: 'var(--green)', boxShadow: '0 4px 14px rgba(62,207,142,0.35)', pointerEvents: 'none' }}>
              <Check size={14} /> Saved!
            </button>
          ) : (
            <>
              <button className="btn secondary" disabled>Cancel</button>
              <button className="btn" disabled>Save</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Demo modal: Vault entry ──────────────────────────────────────────────────

const VAULT_DEMO = [
  { label: 'Service / account name', key: 's', value: 'Paytm' },
  { label: 'Category',               key: 'c', value: 'Finance & Banking' },
  { label: 'Website URL (optional)', key: 'u', value: 'paytm.com' },
  { label: 'Username',               key: 'n', value: 'dev.sharma@gmail.com' },
  { label: 'Password',               key: 'p', value: 'P@ytm#Dev2024' },
  { label: 'Notes',                  key: 'x', value: 'Primary payments wallet' },
]

function DemoVaultModal({ onDone }: { onDone: () => void }): JSX.Element {
  const [formReady, setFormReady] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'typing' | 'done'>('idle')
  const [fi, setFi] = useState(0)
  const [typed, setTyped] = useState(VAULT_DEMO.map(() => ''))
  const [showPass, setShowPass] = useState(false)

  // Show button coach mark for 1800ms, then open form
  useEffect(() => {
    const t = setTimeout(() => setFormReady(true), 1800)
    return () => clearTimeout(t)
  }, [])

  // Start typing 500ms after form appears
  useEffect(() => {
    if (!formReady) return
    const t = setTimeout(() => setPhase('typing'), 500)
    return () => clearTimeout(t)
  }, [formReady])

  useEffect(() => {
    if (phase !== 'typing') return
    let charIdx = 0
    let fieldIdx = fi

    const tick = (): void => {
      charIdx++
      setTyped((prev) => {
        const next = [...prev]
        next[fieldIdx] = VAULT_DEMO[fieldIdx].value.slice(0, charIdx)
        return next
      })
      if (charIdx < VAULT_DEMO[fieldIdx].value.length) {
        setTimeout(tick, fieldIdx === 4 ? 60 : 38)
      } else {
        const nextFi = fieldIdx + 1
        if (nextFi < VAULT_DEMO.length) {
          setTimeout(() => {
            setFi(nextFi)
            if (nextFi === 4) setTimeout(() => setShowPass(true), 200)
            fieldIdx = nextFi
            charIdx = 0
            setTimeout(tick, 80)
          }, 320)
        } else {
          setTimeout(() => setPhase('done'), 600)
        }
      }
    }
    setTimeout(tick, 120)
  }, [phase])

  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(onDone, 1500)
    return () => clearTimeout(t)
  }, [phase])

  // Track password strength for the demo
  const pwStr = typed[4] // index 4 is 'p'
  const pwScore = (() => {
    if (!pwStr) return 0
    let s = 0
    if (pwStr.length >= 8) s++
    if (pwStr.length >= 12) s++
    if (/[A-Z]/.test(pwStr) && /[a-z]/.test(pwStr)) s++
    if (/[0-9]/.test(pwStr)) s++
    if (/[^A-Za-z0-9]/.test(pwStr)) s++
    return s
  })()
  const pwColors = ['transparent', 'var(--red)', 'var(--amber)', 'var(--amber)', 'var(--green)', 'var(--green)']
  const pwLabels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong']
  const pwColor = pwColors[pwScore] ?? 'var(--green)'

  const isTyping = (key: string, idx: number): boolean => fi === idx && phase === 'typing'
  const activeStyle = (idx: number) => ({
    borderColor: fi === idx && phase === 'typing' ? 'var(--accent)' : undefined,
    boxShadow: fi === idx && phase === 'typing' ? '0 0 0 3px var(--accent-soft)' : undefined,
  })

  if (!formReady) {
    return <DemoButtonClick label='Click "Add login" to save a password' subText="Encrypted on your device before anything syncs anywhere." buttonText="Add login" />
  }

  return (
    <div className="modal-backdrop tour-demo-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Add entry</h2>
          {phase === 'done' && <span className="badge ok"><Check size={11} /> Saved!</span>}
        </div>

        {/* Row 1: Service name + Category */}
        <div className="form-row">
          <div className="field">
            <label>Service / account name</label>
            <input readOnly value={typed[0]} placeholder="e.g. Zerodha, Gmail"
              className={isTyping('s', 0) ? 'tour-typing-cursor' : ''}
              style={activeStyle(0)} />
          </div>
          <div className="field">
            <label>Category</label>
            <select readOnly value={typed[1] || ''} style={activeStyle(1)}>
              <option value="">— Select category —</option>
              {typed[1] && <option value={typed[1]}>{typed[1]}</option>}
            </select>
          </div>
        </div>

        {/* Row 2: Website (full width) */}
        <div className="form-row">
          <div className="field">
            <label>Website (optional)</label>
            <input readOnly value={typed[2]} placeholder="e.g. kite.zerodha.com"
              className={isTyping('u', 2) ? 'tour-typing-cursor' : ''}
              style={activeStyle(2)} />
          </div>
        </div>

        {/* Row 3: Username + Password */}
        <div className="form-row">
          <div className="field">
            <label>Username</label>
            <input readOnly value={typed[3]}
              className={isTyping('n', 3) ? 'tour-typing-cursor' : ''}
              style={activeStyle(3)} />
          </div>
          <div className="field">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                readOnly
                type={!showPass ? 'password' : 'text'}
                value={typed[4]}
                className={isTyping('p', 4) ? 'tour-typing-cursor' : ''}
                style={{ ...activeStyle(4), paddingRight: 36 }}
              />
              <button className="icon-btn" onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28 }}>
                {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            {typed[4].length > 0 && (
              <>
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= pwScore ? pwColor : 'var(--border)' }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: pwColor }}>{pwLabels[pwScore]}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>Length: 16</span>
                  <input type="range" readOnly min={8} max={32} value={16} style={{ width: 70 }} />
                  <button className="btn secondary" style={{ padding: '3px 10px', fontSize: 11, marginLeft: 'auto' }} disabled>Generate</button>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
                  {['A–Z', 'a–z', '0–9', '!@#'].map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)', cursor: 'default' }}>
                      <input type="checkbox" readOnly checked style={{ pointerEvents: 'none', width: 12, height: 12 }} />
                      {opt}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="field">
          <label>Notes</label>
          <textarea readOnly value={typed[5]}
            rows={2} placeholder="e.g. Recovery codes, WiFi passwords, PINs, security questions…"
            className={isTyping('x', 5) ? 'tour-typing-cursor' : ''}
            style={{ resize: 'none', ...(fi === 5 && phase === 'typing' ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' } : {}) }}
          />
        </div>

        <div className="modal-actions">
          {phase === 'done' ? (
            <button className="btn" style={{ background: 'var(--green)', boxShadow: '0 4px 14px rgba(62,207,142,0.35)', pointerEvents: 'none' }}>
              <Check size={14} /> Saved!
            </button>
          ) : (
            <>
              <button className="btn secondary" disabled>Cancel</button>
              <button className="btn" disabled>Save</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Fullscreen overlays (welcome / security / done) ─────────────────────────

function OverlayWelcome({ onNext }: { onNext: () => void }): JSX.Element {
  return (
    <div className="tour-fullscreen-overlay">
      <div className="tour-overlay-card">
        <div className="tour-overlay-icon" style={{ background: 'linear-gradient(135deg, var(--accent), #8b6ff0)', color: '#fff', boxShadow: '0 8px 24px rgba(91,141,239,0.4)' }}>
          <img src={logo} alt="Artha" style={{ width: 40, height: 40, objectFit: 'contain' }} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.02em' }}>Welcome to Artha</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.65, marginBottom: 28, maxWidth: 380, textAlign: 'center' }}>
          Your personal finance command center — accounts, insurance, identity documents, credit cards, and passwords, all encrypted locally on your device.
        </p>
        <div className="tour-welcome-features">
          {[
            { icon: Wallet, label: 'Accounts & Net Worth' },
            { icon: ShieldCheck, label: 'Insurance Tracker' },
            { icon: IdCard, label: 'Identity Documents' },
            { icon: CreditCardIcon, label: 'Credit Cards' },
            { icon: KeyRound, label: 'Password Vault' },
            { icon: LockKeyhole, label: 'AES-256 Encrypted' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="tour-welcome-feature">
              <Icon size={14} />
              {label}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 28, width: '100%', maxWidth: 440 }}>
          <button
            className="btn"
            style={{ flex: 1, padding: '12px 20px', fontSize: 14, justifyContent: 'center' }}
            onClick={onNext}
          >
            Start the tour <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// Shared header for the two-part "from Settings" mini-section (Security, then Cloud
// Sync) — these used to read as two random standalone interstitials with a vague
// "One more step" button; this eyebrow + 2-dot progress ties them together as one
// walkthrough of the Settings page's own Security and Cloud Sync sections, the same
// way the floating guide panel's dots tie together the regular page-by-page steps.
function SettingsStepHeader({ part }: { part: 1 | 2 }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--bg-inset)', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <SettingsIcon size={12} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        From Settings
      </span>
      <div style={{ display: 'flex', gap: 3, marginLeft: 2 }}>
        {([1, 2] as const).map((p) => (
          <div
            key={p}
            style={{
              width: p === part ? 16 : 6,
              height: 6,
              borderRadius: 999,
              background: p === part ? 'var(--accent)' : p < part ? 'var(--text-faint)' : 'var(--border)',
              transition: 'all 200ms var(--ease)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function OverlaySecurity({ onNext }: { onNext: () => void }): JSX.Element {
  const items = [
    { label: 'Encryption', value: 'AES-256-GCM', color: 'var(--accent)' },
    { label: 'Key derivation', value: 'scrypt — brute force resistant', color: 'var(--green)' },
    { label: 'Storage', value: 'Local-first — cloud sync optional', color: 'var(--green)' },
    { label: 'Auto-lock', value: '5 minutes of inactivity', color: 'var(--text-dim)' },
    { label: 'Biometrics', value: 'Windows Hello supported', color: 'var(--text-dim)' },
    { label: 'Backup', value: 'Encrypted .wmbackup export', color: 'var(--text-dim)' },
  ]
  return (
    <div className="tour-fullscreen-overlay">
      <div className="tour-overlay-card">
        <SettingsStepHeader part={1} />
        <div className="tour-overlay-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <LockKeyhole size={28} />
        </div>
        <div style={{ background: 'var(--green-soft)', color: 'var(--green)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '3px 12px', borderRadius: 999, marginBottom: 14 }}>
          Zero-knowledge encryption
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.015em' }}>Your data is truly private</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 20, maxWidth: 360, textAlign: 'center' }}>
          Artha never sees your master password. Everything is encrypted before being written to disk — all configurable from Settings → Security.
        </p>
        <div style={{ width: '100%', maxWidth: 380, background: 'var(--bg-inset)', border: '1px solid var(--border-soft)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
          {items.map((item, i) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < items.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
              <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{item.label}</span>
              <span style={{ color: item.color, fontWeight: 600, fontSize: 12 }}>{item.value}</span>
            </div>
          ))}
        </div>
        <button className="btn" style={{ minWidth: 200, padding: '11px 28px', fontSize: 14 }} onClick={onNext}>
          Next: Cloud Sync <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

function OverlayCloudSync({ onNext }: { onNext: () => void }): JSX.Element {
  const items = [
    { label: 'Default', value: 'Local-only — your choice at setup', color: 'var(--text-dim)' },
    { label: 'Turn on anytime', value: 'Settings → Cloud Sync', color: 'var(--accent)' },
    { label: 'Sign in with', value: 'Email, Google, or Microsoft', color: 'var(--text-dim)' },
    { label: 'What the cloud sees', value: 'Ciphertext only — never your data', color: 'var(--green)' },
    { label: 'Also works on', value: 'The Artha mobile app', color: 'var(--text-dim)' },
  ]
  return (
    <div className="tour-fullscreen-overlay">
      <div className="tour-overlay-card">
        <SettingsStepHeader part={2} />
        <div className="tour-overlay-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Cloud size={28} />
        </div>
        <div style={{ background: 'var(--green-soft)', color: 'var(--green)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '3px 12px', borderRadius: 999, marginBottom: 14 }}>
          Optional, end-to-end encrypted
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.015em' }}>Access it from your phone too</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 20, maxWidth: 360, textAlign: 'center' }}>
          Your device encrypts everything before it leaves — the cloud never sees a usable copy, only you can decrypt it. Turn it on anytime from Settings → Cloud Sync.
        </p>
        <div style={{ width: '100%', maxWidth: 380, background: 'var(--bg-inset)', border: '1px solid var(--border-soft)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
          {items.map((item, i) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < items.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
              <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{item.label}</span>
              <span style={{ color: item.color, fontWeight: 600, fontSize: 12 }}>{item.value}</span>
            </div>
          ))}
        </div>
        <button className="btn" style={{ minWidth: 200, padding: '11px 28px', fontSize: 14 }} onClick={onNext}>
          Continue <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

function OverlayDone({ onExit, isLoggedIn }: { onExit: () => void; isLoggedIn?: boolean }): JSX.Element {
  return (
    <div className="tour-fullscreen-overlay">
      <div className="tour-overlay-card">
        <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 16, animation: 'celebration-pop 600ms var(--ease)' }}>✨</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.02em' }}>You're ready!</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.65, marginBottom: 8, maxWidth: 380, textAlign: 'center' }}>
          {isLoggedIn
            ? "You've seen everything Artha has to offer. Let's head to your Dashboard."
            : 'Set a master password to create your encrypted vault and start tracking everything that matters.'}
        </p>
        <p style={{ color: 'var(--text-faint)', fontSize: 12, marginBottom: 28 }}>
          {isLoggedIn ? 'Your data is encrypted and stays on this device.' : 'Your data stays on this device. Export a backup anytime.'}
        </p>
        {isLoggedIn ? (
          <button className="btn" style={{ minWidth: 220, padding: '11px 28px', fontSize: 14 }} onClick={() => { window.location.hash = '#/'; onExit() }}>
            Go to Dashboard <ChevronRight size={16} />
          </button>
        ) : (
          <>
            <button className="btn" style={{ minWidth: 220, padding: '12px 28px', fontSize: 14 }} onClick={() => { window.location.hash = '#/'; onExit() }}>
              Create my vault →
            </button>
            <button
              className="btn secondary"
              style={{ minWidth: 220, padding: '11px 28px', fontSize: 13, marginTop: 10 }}
              onClick={() => { window.location.hash = '#/'; onExit() }}
            >
              Back to login
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Floating guide panel ─────────────────────────────────────────────────────

interface GuidePanelProps {
  step: number
  total: number
  onNext: () => void
  onPrev: () => void
  onExit: () => void
  onWatchDemo: () => void
}

function GuidePanel({ step, total, onNext, onPrev, onExit, onWatchDemo }: GuidePanelProps): JSX.Element {
  const current = STEPS[step]
  const Icon = current.icon
  const isFirst = step === 0
  const isLast = step === total - 1
  const nonOverlaySteps = STEPS.filter(s => s.route !== null)
  const nonOverlayIndex = nonOverlaySteps.findIndex(s => s === current)

  return (
    <div className="tour-guide-panel">
      <div className="tour-guide-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={15} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Step {nonOverlayIndex + 1} of {nonOverlaySteps.length}</div>
            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>{current.title}</div>
          </div>
        </div>
        <button className="tour-exit-btn" onClick={() => { window.location.hash = '#/'; onExit() }} style={{ padding: '4px 8px', fontSize: 11 }}>
          <X size={13} /> Exit
        </button>
      </div>

      <p style={{ margin: '8px 0', fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        {current.desc}
      </p>

      {(current.demoKey === 'ai' || current.demoKey === 'ai_insurance' || current.demoKey === 'ai_identity') && (
        <div style={{ background: 'rgba(232,177,79,0.1)', border: '1px solid rgba(232,177,79,0.4)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--amber, #e8b14f)', marginTop: 8 }}>
          ⚙ Requires an API key — configure it in Settings → AI Document Reading before using this feature.
        </div>
      )}

      {current.tip && (
        <div className="tour-tip" style={{ marginBottom: 10, padding: '8px 10px', fontSize: 11.5 }}>
          <span className="tour-tip-dot" />
          {current.tip}
        </div>
      )}

      {current.demoKey && (
        <button
          className="btn small tour-pulse-btn"
          style={{ width: '100%', marginBottom: 10 }}
          onClick={onWatchDemo}
        >
          <Bot size={12} /> {
            current.demoKey === 'ai' || current.demoKey === 'ai_insurance' || current.demoKey === 'ai_identity'
              ? 'Watch AI extraction demo'
              : 'Watch the demo'
          }
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          className="btn secondary"
          style={{ padding: '7px 12px', fontSize: 12, gap: 5 }}
          onClick={onPrev}
          disabled={isFirst}
        >
          <ChevronLeft size={13} /> Back
        </button>
        <div style={{ flex: 1, display: 'flex', gap: 3, justifyContent: 'center' }}>
          {nonOverlaySteps.map((s, i) => (
            <div
              key={s.key}
              style={{
                width: i === nonOverlayIndex ? 16 : 6,
                height: 6,
                borderRadius: 999,
                background: i === nonOverlayIndex ? 'var(--accent)' : i < nonOverlayIndex ? 'var(--text-faint)' : 'var(--border)',
                transition: 'all 200ms var(--ease)',
              }}
            />
          ))}
        </div>
        <button
          className="btn"
          style={{ padding: '7px 12px', fontSize: 12, gap: 5 }}
          onClick={isLast ? () => { window.location.hash = '#/'; onExit() } : onNext}
        >
          {isLast ? 'Finish' : 'Next'} <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Sidebar nav (mirrors the real App.tsx sidebar) ───────────────────────────

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'Accounts', icon: Wallet, end: false },
  { to: '/cards', label: 'Credit Cards', icon: CreditCardIcon, end: false },
  { to: '/insurance', label: 'Insurance', icon: ShieldCheck, end: false },
  { to: '/ids', label: 'Identity', icon: IdCard, end: false },
  { to: '/vault', label: 'Vault', icon: KeyRound, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false },
]

// ─── Inner app (must be inside MemoryRouter to use useNavigate) ───────────────

type DemoKey = 'account' | 'ai' | 'ai_insurance' | 'ai_identity' | 'card' | 'vault' | null

interface InnerProps {
  step: number
  onNext: () => void
  onPrev: () => void
  onExit: () => void
  isLoggedIn?: boolean
}

function TourInnerApp({ step, onNext, onPrev, onExit, isLoggedIn }: InnerProps): JSX.Element {
  const navigate = useNavigate()
  const current = STEPS[step]
  const [activeDemo, setActiveDemo] = useState<DemoKey>(null)

  // Navigate to the route for the current step
  useEffect(() => {
    if (current.route) {
      navigate(current.route)
      if (current.key === 'upcoming') {
        const t = setTimeout(() => {
          document.querySelector('.main')?.scrollTo({ top: 750, behavior: 'smooth' })
        }, 400)
        return () => clearTimeout(t)
      } else {
        const t = setTimeout(() => {
          document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' })
        }, 100)
        return () => clearTimeout(t)
      }
    }
    return undefined
  }, [step, current.route])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (activeDemo !== null) return
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeDemo, onPrev, onNext])

  const handleWatchDemo = (): void => {
    setActiveDemo(current.demoKey ?? null)
  }

  const handleDemoAccountDone = (): void => setActiveDemo(null)
  const handleDemoAIDone = (): void => setActiveDemo(null)
  const handleDemoInsuranceAIDone = (): void => setActiveDemo(null)
  const handleDemoIdentityAIDone = (): void => setActiveDemo(null)
  const handleDemoCardDone = (): void => setActiveDemo(null)
  const handleDemoVaultDone = (): void => setActiveDemo(null)

  const isOverlayStep = current.route === null

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {/* Real app shell — always rendered, dimmed when showing fullscreen overlay */}
      <div
        className="app-shell"
        style={{
          opacity: isOverlayStep ? 0.18 : 1,
          pointerEvents: 'none',
          transition: 'opacity 300ms var(--ease)',
        }}
      >
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
            <button className="lock-btn" onClick={() => {}}>
              <LockKeyhole size={14} /> Lock app
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
            <Route path="/settings" element={<div className="muted" style={{ padding: 40 }}>Settings are not available in the tour.</div>} />
          </Routes>
        </main>
      </div>

      {/* Fullscreen overlays for welcome / security / done */}
      {current.key === 'welcome'   && <OverlayWelcome onNext={onNext} />}
      {current.key === 'security'  && <OverlaySecurity onNext={onNext} />}
      {current.key === 'cloudsync' && <OverlayCloudSync onNext={onNext} />}
      {current.key === 'done'      && <OverlayDone onExit={onExit} isLoggedIn={isLoggedIn} />}

      {/* Demo modals */}
      {activeDemo === 'account'      && <DemoAccountModal      onDone={handleDemoAccountDone} />}
      {activeDemo === 'ai'           && <DemoAIModal           onDone={handleDemoAIDone} />}
      {activeDemo === 'ai_insurance' && <DemoInsuranceAIModal  onDone={handleDemoInsuranceAIDone} />}
      {activeDemo === 'ai_identity'  && <DemoIdentityAIModal   onDone={handleDemoIdentityAIDone} />}
      {activeDemo === 'card'         && <DemoCreditCardModal   onDone={handleDemoCardDone} />}
      {activeDemo === 'vault'        && <DemoVaultModal        onDone={handleDemoVaultDone} />}

      {/* Floating guide panel — only on regular (non-overlay) steps and not during demos */}
      {!isOverlayStep && !activeDemo && (
        <GuidePanel
          step={step}
          total={STEPS.length}
          onNext={onNext}
          onPrev={onPrev}
          onExit={onExit}
          onWatchDemo={handleWatchDemo}
        />
      )}
    </div>
  )
}

// ─── Main TourMode component ──────────────────────────────────────────────────

interface Props {
  onExit: () => void
  isLoggedIn?: boolean
}

export default function TourMode({ onExit, isLoggedIn }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  // One stable tour API instance (persists across re-renders so in-memory store survives)
  const tourApiRef = useRef<ReturnType<typeof createTourApi> | null>(null)
  if (tourApiRef.current === null) {
    tourApiRef.current = createTourApi()
  }

  // Install mock synchronously in the render body — before any child renders.
  // window.api is read-only (contextBridge), so we use a module-level proxy instead.
  setMockApi(tourApiRef.current)

  useEffect(() => {
    return () => {
      clearMockApi()
      tourApiRef.current = null
    }
  }, [])

  const goNext = (): void => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const goPrev = (): void => setStep((s) => Math.max(s - 1, 0))

  return <TourInnerApp step={step} onNext={goNext} onPrev={goPrev} onExit={onExit} isLoggedIn={isLoggedIn} />
}
