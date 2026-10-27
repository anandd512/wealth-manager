import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { MoreVertical } from 'lucide-react'

export interface ActionMenuItem {
  label: string
  icon?: LucideIcon
  onClick: () => void
  danger?: boolean
}

interface Props {
  items: ActionMenuItem[]
}

export default function ActionMenu({ items }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Focuses the first item as soon as the popover opens, so arrow keys work
  // immediately without an extra Tab press — matches native menu button behavior.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  const close = (returnFocus: boolean): void => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const onItemKeyDown = (e: React.KeyboardEvent, index: number): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      itemRefs.current[(index + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      itemRefs.current[(index - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      itemRefs.current[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      itemRefs.current[items.length - 1]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div className="action-menu" ref={ref}>
      <button
        type="button"
        className="action-menu-trigger"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="action-menu-popover" role="menu">
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                className={`action-menu-item${item.danger ? ' danger' : ''}`}
                onClick={() => {
                  close(false)
                  item.onClick()
                }}
                onKeyDown={(e) => onItemKeyDown(e, i)}
              >
                {Icon && <Icon size={15} />}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
