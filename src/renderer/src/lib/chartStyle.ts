// Shared recharts <Tooltip> styling, written against theme variables so tooltips
// follow light/dark mode — the Dashboard's were hardcoded to the dark palette
// (#141a26 etc.) and rendered as dark boxes on the light theme.
export const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--bg-elev)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    boxShadow: 'var(--shadow-md)',
    fontSize: 12
  },
  labelStyle: { color: 'var(--text-faint)' },
  itemStyle: { color: 'var(--text)' }
} as const
