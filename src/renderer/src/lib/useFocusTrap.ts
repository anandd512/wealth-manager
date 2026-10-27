import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

// Traps Tab/Shift+Tab inside the modal while it's open, and returns focus to
// whatever was focused before it opened once it closes — a plain modal otherwise
// lets Tab walk out into the page behind it, and closing one drops focus back to
// <body>, both bad for anyone navigating by keyboard. Scoped to the cash-flow
// modals for now rather than every modal in the app — see the project plan.
export function useFocusTrap(active: boolean): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    previouslyFocused.current = document.activeElement as HTMLElement | null

    const container = containerRef.current
    const focusFirst = (): void => {
      const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE)
      focusable?.[0]?.focus()
    }
    focusFirst()

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !container) return
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus()
    }
  }, [active])

  return containerRef
}
