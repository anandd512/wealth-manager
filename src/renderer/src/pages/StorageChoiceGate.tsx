import { useState } from 'react'
import { HardDrive, Cloud, Check } from 'lucide-react'
import logo from '../assets/logo.png'

interface Props {
  onChosen: (mode: 'local' | 'cloud') => void
}

const OPTIONS: {
  mode: 'local' | 'cloud'
  icon: typeof HardDrive
  title: string
  tagline: string
  points: string[]
}[] = [
  {
    mode: 'local',
    icon: HardDrive,
    title: 'This device only',
    tagline: 'Everything stays on this computer.',
    points: [
      'Nothing ever leaves this device — no account, no internet dependency',
      'Fastest, works fully offline',
      "Not accessible from your phone or another computer, and there's no automatic off-device backup"
    ]
  },
  {
    mode: 'cloud',
    icon: Cloud,
    title: 'Cloud sync',
    tagline: 'Access the same data from your phone too.',
    points: [
      'Encrypted on this device before anything is sent — the server never sees a usable copy',
      'Available from the Artha mobile app and any other device you add',
      'Requires creating an account and a one-time setup step'
    ]
  }
]

/** Shown once, only on a genuinely fresh install (see ipc.ts's storageModeStatus
 * handler — an existing install is auto-treated as "local" and never sees this).
 * Choosing "local" changes nothing about what happens next: the very next screen is
 * the same master-password setup this app has always had. Cloud sync is additive —
 * it can be turned on later from Settings → Cloud Sync regardless of what's picked
 * here. */
export default function StorageChoiceGate({ onChosen }: Props): JSX.Element {
  const [selected, setSelected] = useState<'local' | 'cloud' | null>(null)
  const [busy, setBusy] = useState(false)

  const confirm = async (): Promise<void> => {
    if (!selected) return
    setBusy(true)
    await window.api.storageMode.set(selected)
    onChosen(selected)
  }

  return (
    <div className="gate">
      <div className="gate-card" style={{ width: 640 }}>
        <div className="gate-icon">
          <img src={logo} alt="Artha" style={{ width: 56, height: 56, objectFit: 'contain' }} />
        </div>
        <h1>Where should your data live?</h1>
        <p>You can change this later in Settings — this just decides how to start.</p>

        <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
          {OPTIONS.map(({ mode, icon: Icon, title, tagline, points }) => {
            const isSelected = selected === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSelected(mode)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  background: isSelected ? 'var(--accent-soft)' : 'var(--bg-card)',
                  border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border-soft)'}`,
                  borderRadius: 'var(--radius)',
                  padding: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  color: 'var(--text)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={16} color={isSelected ? 'var(--accent)' : 'var(--text-dim)'} />
                    <strong style={{ fontSize: 14 }}>{title}</strong>
                  </div>
                  {isSelected && <Check size={15} color="var(--accent)" />}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tagline}</span>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  {points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </button>
            )
          })}
        </div>

        <button className="btn" style={{ width: '100%' }} onClick={confirm} disabled={!selected || busy}>
          {busy ? 'Setting up…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
