import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'

const UNDO_MS = 8000

interface Pending {
  key: number
  label: string
  undo: () => Promise<void>
}

// "Deleted X · Undo" for any tab. Every delete in this app is a soft delete, so
// undoing is just a restore call; the toast offers it for 8 seconds (the countdown
// bar shows how long is left), the same as Cash Flow's.
export function useUndoToast(): {
  offerUndo: (label: string, undo: () => Promise<void>) => void
  undoToast: JSX.Element
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const offerUndo = (label: string, undo: () => Promise<void>): void => {
    if (timer.current) clearTimeout(timer.current)
    const entry = { key: Date.now(), label, undo }
    setPending(entry)
    timer.current = setTimeout(() => setPending((cur) => (cur === entry ? null : cur)), UNDO_MS)
  }

  const runUndo = async (): Promise<void> => {
    if (!pending) return
    if (timer.current) clearTimeout(timer.current)
    const { undo } = pending
    setPending(null)
    await undo()
  }

  const undoToast = (
    <div className="toast-region" aria-live="polite">
      {pending && (
        // keyed so the countdown restarts when a second delete replaces the first
        <div className="toast" key={pending.key}>
          <Trash2 />
          <div className="toast-body">Deleted {pending.label}</div>
          <button className="btn secondary small" onClick={() => void runUndo()}>
            Undo
          </button>
          <div className="toast-countdown" style={{ ['--toast-ms' as string]: `${UNDO_MS}ms` }} />
        </div>
      )}
    </div>
  )

  return { offerUndo, undoToast }
}
