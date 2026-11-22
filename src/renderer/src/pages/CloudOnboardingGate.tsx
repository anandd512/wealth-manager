import { useEffect, useState } from 'react'
import { HardDrive } from 'lucide-react'
import logo from '../assets/logo.png'
import type { CloudStatus } from '../../../shared/types'
import CloudSignIn from '../components/CloudSignIn'
import CloudKeyStep from '../components/CloudKeyStep'

interface Props {
  onDone: () => void
  onUseLocal: () => void
}

/** First run, after choosing "Cloud sync" on StorageChoiceGate: sign in (Google,
 * Microsoft or an emailed code — no password), then get this computer the account's
 * encryption key. Next comes AuthGate's device password, which only protects the copy
 * on this computer. Re-shown on the next launch if the app is closed part-way. */
export default function CloudOnboardingGate({ onDone, onUseLocal }: Props): JSX.Element {
  const [status, setStatus] = useState<CloudStatus | null>(null)

  useEffect(() => {
    window.api.cloud.status().then((s) => (s.stage === 'ready' ? onDone() : setStatus(s)))
  }, [onDone])

  const advance = (next: CloudStatus): void => {
    if (next.stage === 'ready') onDone()
    else setStatus(next)
  }

  const useLocal = async (): Promise<void> => {
    await window.api.cloud.signOut()
    await window.api.storageMode.set('local')
    onUseLocal()
  }

  if (!status) return <div className="gate">Loading…</div>

  const signingIn = status.stage === 'signedOut'
  return (
    <div className="gate">
      <div className="gate-card" style={{ width: 440 }}>
        <div className="gate-icon">
          <img src={logo} alt="Artha" style={{ width: 56, height: 56, objectFit: 'contain' }} />
        </div>
        <h1>{signingIn ? 'Sign in to Artha' : 'Set up encryption'}</h1>
        <p>
          {signingIn
            ? 'Your account keeps your data in sync between this computer and your phone.'
            : 'One last step before your data can sync.'}
        </p>

        {signingIn ? (
          <CloudSignIn onSignedIn={advance} />
        ) : (
          <CloudKeyStep status={status} onReady={advance} onSignOut={async () => setStatus(await window.api.cloud.signOut())} />
        )}

        <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: 20, paddingTop: 14, textAlign: 'center' }}>
          <button type="button" className="link-btn" style={{ fontSize: 12.5 }} onClick={useLocal}>
            <HardDrive size={12} /> Keep my data on this device only instead
          </button>
        </div>
      </div>
    </div>
  )
}
