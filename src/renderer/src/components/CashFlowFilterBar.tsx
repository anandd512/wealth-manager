import type { CashFlowCategory, CashFlowTrackedAccount } from '../../../shared/types'
import { categoriesFor } from '../lib/cashFlowCategories'

export interface CashFlowFilters {
  search: string
  category: CashFlowCategory | 'uncategorized' | ''
  accountSyncId: string
  source: 'all' | 'ai_extracted' | 'manual'
}

interface Props {
  filters: CashFlowFilters
  onChange: (f: CashFlowFilters) => void
  trackedAccounts: CashFlowTrackedAccount[]
}

const ALL_CATEGORIES = [...categoriesFor('income', 'short'), ...categoriesFor('expense', 'short')].filter(
  (c, i, arr) => arr.findIndex((x) => x.value === c.value) === i
)

export default function CashFlowFilterBar({ filters, onChange, trackedAccounts }: Props): JSX.Element {
  const set = (patch: Partial<CashFlowFilters>): void => onChange({ ...filters, ...patch })
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      <input
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
        placeholder="Search description…"
        style={{ minWidth: 180 }}
        aria-label="Search transactions"
      />
      <select value={filters.category} onChange={(e) => set({ category: e.target.value as CashFlowFilters['category'] })} aria-label="Filter by category">
        <option value="">All categories</option>
        <option value="uncategorized">Uncategorized</option>
        {ALL_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <select value={filters.accountSyncId} onChange={(e) => set({ accountSyncId: e.target.value })} aria-label="Filter by account">
        <option value="">All accounts</option>
        {trackedAccounts.map((a) => (
          <option key={a.sync_id} value={a.sync_id}>
            {a.name}
          </option>
        ))}
      </select>
      <select value={filters.source} onChange={(e) => set({ source: e.target.value as CashFlowFilters['source'] })} aria-label="Filter by source">
        <option value="all">Manual & AI</option>
        <option value="ai_extracted">AI only</option>
        <option value="manual">Manual only</option>
      </select>
      {(filters.search || filters.category || filters.accountSyncId || filters.source !== 'all') && (
        <button
          type="button"
          className="btn secondary small"
          onClick={() => onChange({ search: '', category: '', accountSyncId: '', source: 'all' })}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

export function matchesFilters(
  t: { description: string; category: string | null; account_sync_id: string | null; entry_method: string },
  filters: CashFlowFilters
): boolean {
  if (filters.search && !t.description.toLowerCase().includes(filters.search.trim().toLowerCase())) return false
  if (filters.category === 'uncategorized' && t.category) return false
  if (filters.category && filters.category !== 'uncategorized' && t.category !== filters.category) return false
  if (filters.accountSyncId && t.account_sync_id !== filters.accountSyncId) return false
  if (filters.source !== 'all' && t.entry_method !== filters.source) return false
  return true
}

export const DEFAULT_FILTERS: CashFlowFilters = { search: '', category: '', accountSyncId: '', source: 'all' }
