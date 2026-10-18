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

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="action-menu" ref={ref}>
      <button
        type="button"
        className="action-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="action-menu-popover">
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={i}
                type="button"
                className={`action-menu-item${item.danger ? ' danger' : ''}`}
                onClick={() => {
                  setOpen(false)
                  item.onClick()
                }}
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
