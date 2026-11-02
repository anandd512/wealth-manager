import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'artha_theme'
const CHANGED_EVENT = 'artha:theme-changed'

export function getTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

// Applies + persists the theme and tells every useTheme() hook about it. The
// sidebar toggle and Settings → Appearance used to keep separate copies of this
// state, so switching in one left the other showing the old theme.
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // still apply it for this session
  }
  document.body.classList.toggle('light-mode', theme === 'light')
  window.dispatchEvent(new CustomEvent<Theme>(CHANGED_EVENT, { detail: theme }))
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setLocal] = useState<Theme>(getTheme)
  useEffect(() => {
    const onChange = (e: Event): void => setLocal((e as CustomEvent<Theme>).detail)
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CHANGED_EVENT, onChange)
  }, [])
  return [theme, setTheme]
}
