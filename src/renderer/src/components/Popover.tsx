import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  trigger: ReactNode
  triggerClassName?: string
  triggerTitle?: string
  ariaLabel?: string
  align?: 'left' | 'right'
  // Receives `close` so a choice inside can dismiss the popover.
  children: (close: () => void) => ReactNode
}

// A small anchored panel (filters, pickers). ActionMenu covers plain lists of
// actions; this is for anything with its own controls or a custom layout.
// Closes on outside click and Escape, returning focus to the trigger.
export default function Popover({ trigger, triggerClassName, triggerTitle, ariaLabel, align = 'left', children }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    // Focus the first focusable control so keyboard users land inside the panel.
    panelRef.current?.querySelector<HTMLElement>('button, select, input')?.focus()
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = (): void => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        className={triggerClassName}
        title={triggerTitle}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`popover-panel ${align}`}
          ref={panelRef}
          role="dialog"
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
          // Enter belongs to the popover's own controls — it must not reach a
          // surrounding modal that saves on Enter. (Escape still bubbles to close.)
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.stopPropagation()
          }}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}
