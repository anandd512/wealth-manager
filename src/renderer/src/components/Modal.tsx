import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useFocusTrap } from '../lib/useFocusTrap'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  title: ReactNode
  onClose: () => void
  // Render-prop form gets `requestClose`, for the form's own Cancel button — it goes
  // through the same unsaved-changes check as Escape and an outside click.
  children: ReactNode | ((requestClose: () => void) => ReactNode)
  width?: number
  // Whether there are unsaved edits. Leave undefined to let the modal track it
  // itself: any typing/selection inside marks it dirty. Pass a value when the form
  // can tell more precisely (e.g. edits that were undone back to the original).
  dirty?: boolean
  discardMessage?: string
}

// The one modal shell every form uses. Before this, each form wired its own
// backdrop/Escape handling and closed on any outside click or Escape — throwing
// away a half-filled 20-field form with no warning — and only the cash-flow
// modals trapped focus. Here:
//  - Escape, an outside click and Cancel all ask before discarding edits;
//  - an outside click must start AND end on the backdrop, so a text-selection drag
//    that ends outside the dialog doesn't close it;
//  - focus is trapped inside and returned on close; role="dialog" + aria-modal.
export default function Modal({ title, onClose, children, width, dirty, discardMessage }: Props): JSX.Element {
  const [touched, setTouched] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const isDirty = dirty ?? touched
  const containerRef = useFocusTrap(true)
  const titleId = useId()
  const pressStartedOnBackdrop = useRef(false)

  const requestClose = (): void => {
    if (isDirty) setConfirmingDiscard(true)
    else onClose()
  }

  // Latest requestClose for the document-level Escape listener without re-binding
  // it (and re-running the focus logic) on every keystroke.
  const requestCloseRef = useRef(requestClose)
  requestCloseRef.current = requestClose
  const confirmingRef = useRef(confirmingDiscard)
  confirmingRef.current = confirmingDiscard

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      // Escape on the "Discard?" prompt backs out of the prompt, not the form.
      if (confirmingRef.current) setConfirmingDiscard(false)
      else requestCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (pressStartedOnBackdrop.current && e.target === e.currentTarget) requestClose()
        pressStartedOnBackdrop.current = false
      }}
    >
      <div
        className="modal"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={width ? { width, maxWidth: `min(${width}px, calc(100vw - 32px))` } : undefined}
        onInputCapture={() => setTouched(true)}
      >
        <h2 id={titleId}>{title}</h2>
        {typeof children === 'function' ? children(requestClose) : children}
      </div>

      <ConfirmDialog
        open={confirmingDiscard}
        title="Discard changes?"
        message={discardMessage ?? "You have unsaved changes. If you close now, they'll be lost."}
        confirmLabel="Discard"
        onConfirm={() => {
          setConfirmingDiscard(false)
          onClose()
        }}
        onCancel={() => setConfirmingDiscard(false)}
      />
    </div>
  )
}
