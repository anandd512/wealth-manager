import { useState, type ReactNode } from 'react'
import { Info, X } from 'lucide-react'

interface Props {
  // localStorage key remembering the dismissal, e.g. 'artha_tip_vault'.
  storageKey: string
  children: ReactNode
}

function wasDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

// A one-time explainer: shown until the user dismisses it, then never again. Used
// for the "how this tab works" paragraphs that used to sit permanently at the top
// of a page, pushing the actual content down on every visit.
export default function Tip({ storageKey, children }: Props): JSX.Element | null {
  const [dismissed, setDismissed] = useState(() => wasDismissed(storageKey))
  if (dismissed) return null
  return (
    <div className="notice info section">
      <Info />
      <div className="notice-body">{children}</div>
      <button
        className="icon-btn"
        title="Got it — hide this"
        aria-label="Dismiss tip"
        onClick={() => {
          setDismissed(true)
          try {
            localStorage.setItem(storageKey, '1')
          } catch {
            // private mode etc. — just hide it for this session
          }
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
