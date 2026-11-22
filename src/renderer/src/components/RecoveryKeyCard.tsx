import { useState } from 'react'
import { Copy, Download, KeyRound, Check } from 'lucide-react'

interface Props {
  recoveryKey: string
  onDone: () => void
  doneLabel?: string
}

/** Shows a freshly minted Recovery Key exactly once. It's never stored on this device
 * or readable by the server, so the user has to confirm they saved it before moving on. */
export default function RecoveryKeyCard({ recoveryKey, onDone, doneLabel = 'Continue' }: Props): JSX.Element {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    // Clears the clipboard again after 2 minutes — long enough to paste it into a
    // password manager, short enough not to linger.
    await window.api.clipboard.writeSecret(recoveryKey, 120_000)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = (): void => {
    const text = [
      'Artha recovery key',
      '',
      recoveryKey,
      '',
      'Use this to give a new device access to your encrypted Artha data when no',
      'signed-in device is available to approve it. Artha cannot recover it for you.',
      'Keep it somewhere safe and private (a password manager is ideal).',
      ''
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'Artha recovery key.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="recovery-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <KeyRound size={15} color="var(--accent)" />
        <strong style={{ fontSize: 14 }}>Your recovery key</strong>
      </div>
      <p className="help-text" style={{ marginTop: 0 }}>
        Your data is encrypted with a key only your devices hold — not even Artha's servers can read it. This recovery
        key is the backup: you'll need it to set up a new device if no signed-in device is around to approve it.
        <strong> It's shown only once and can't be recovered.</strong>
      </p>
      <div className="recovery-key" aria-label="Recovery key">
        {recoveryKey}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" className="btn secondary" onClick={copy} style={{ flex: 1 }}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn secondary" onClick={download} style={{ flex: 1 }}>
          <Download size={14} /> Save as file
        </button>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I've saved my recovery key somewhere safe
      </label>
      <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={!saved} onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  )
}
