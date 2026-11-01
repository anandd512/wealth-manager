import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { CashFlowCategory, CashFlowDirection, CashFlowTrackedAccount } from '../../../shared/types'
import { categoriesFor } from '../lib/cashFlowCategories'
import Popover from './Popover'

export interface CashFlowFilters {
  search: string
  direction: CashFlowDirection | 'all'
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

const SOURCE_LABEL: Record<CashFlowFilters['source'], string> = {
  all: 'Anyone',
  ai_extracted: 'From a statement',
  manual: 'Added by me'
}

export const DEFAULT_FILTERS: CashFlowFilters = { search: '', direction: 'all', category: '', accountSyncId: '', source: 'all' }

export function hasActiveFilters(f: CashFlowFilters): boolean {
  return f.search.trim() !== '' || f.direction !== 'all' || f.category !== '' || f.accountSyncId !== '' || f.source !== 'all'
}

// Search, an In/Out switch and a Filters popover; whatever's active shows as a
// removable chip so it's obvious why rows are missing.
export default function CashFlowFilterBar({ filters, onChange, trackedAccounts }: Props): JSX.Element {
  const set = (patch: Partial<CashFlowFilters>): void => onChange({ ...filters, ...patch })
  const categoryText =
    filters.category === 'uncategorized' ? 'Uncategorized' : ALL_CATEGORIES.find((c) => c.value === filters.category)?.label
  const accountText = trackedAccounts.find((a) => a.sync_id === filters.accountSyncId)?.name ?? '(account closed)'
  const panelCount = [filters.category !== '', filters.accountSyncId !== '', filters.source !== 'all'].filter(Boolean).length

  return (
    <div className="cf-filterbar">
      <div className="cf-filterbar-row">
        <div className="cf-search">
          <Search aria-hidden />
          <input
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search description or amount (e.g. 540, >5000)"
            aria-label="Search transactions"
          />
          {filters.search && (
            <button type="button" className="icon-btn" onClick={() => set({ search: '' })} aria-label="Clear search" title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="segmented" role="group" aria-label="Money in or out">
          {(
            [
              ['all', 'All'],
              ['income', 'In'],
              ['expense', 'Out']
            ] as [CashFlowFilters['direction'], string][]
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filters.direction === value} onClick={() => set({ direction: value })}>
              {label}
            </button>
          ))}
        </div>
        <Popover
          ariaLabel="Filters"
          align="right"
          triggerClassName={`btn secondary small ${panelCount > 0 ? 'cf-filter-active' : ''}`}
          trigger={
            <>
              <SlidersHorizontal size={13} /> Filters{panelCount > 0 ? ` · ${panelCount}` : ''}
            </>
          }
        >
          {() => (
            <div className="cf-filter-panel">
              <label>
                Category
                <select value={filters.category} onChange={(e) => set({ category: e.target.value as CashFlowFilters['category'] })}>
                  <option value="">Any category</option>
                  <option value="uncategorized">Uncategorized</option>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Account
                <select value={filters.accountSyncId} onChange={(e) => set({ accountSyncId: e.target.value })}>
                  <option value="">Any account</option>
                  {trackedAccounts.map((a) => (
                    <option key={a.sync_id} value={a.sync_id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Added
                <select value={filters.source} onChange={(e) => set({ source: e.target.value as CashFlowFilters['source'] })}>
                  {(Object.keys(SOURCE_LABEL) as CashFlowFilters['source'][]).map((s) => (
                    <option key={s} value={s}>
                      {s === 'all' ? 'Any way' : SOURCE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </Popover>
      </div>

      {panelCount > 0 && (
        <div className="cf-filter-chips">
          {filters.category && (
            <FilterChip label={`Category: ${categoryText}`} onRemove={() => set({ category: '' })} />
          )}
          {filters.accountSyncId && <FilterChip label={`Account: ${accountText}`} onRemove={() => set({ accountSyncId: '' })} />}
          {filters.source !== 'all' && <FilterChip label={SOURCE_LABEL[filters.source]} onRemove={() => set({ source: 'all' })} />}
          {panelCount > 1 && (
            <button type="button" className="cf-link-btn" onClick={() => set({ category: '', accountSyncId: '', source: 'all' })}>
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }): JSX.Element {
  return (
    <button type="button" className="chip accent" onClick={onRemove} title="Remove filter" aria-label={`Remove filter ${label}`}>
      {label}
      <X />
    </button>
  )
}

// Amount search: "540" or "1,250" matches amounts containing those digits; ">5000",
// "<=200" etc. compare. Anything else searches the description (and notes).
function matchesSearch(t: { description: string; amount: number; notes?: string | null }, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  const cmp = q.match(/^(>=|<=|>|<)\s*₹?\s*([\d,]+(?:\.\d+)?)$/)
  if (cmp) {
    const n = Number(cmp[2].replace(/,/g, ''))
    if (cmp[1] === '>') return t.amount > n
    if (cmp[1] === '<') return t.amount < n
    if (cmp[1] === '>=') return t.amount >= n
    return t.amount <= n
  }
  if (/^₹?\s*[\d,]+(\.\d+)?$/.test(q)) {
    const digits = q.replace(/[₹,\s]/g, '')
    if (String(t.amount).includes(digits)) return true
  }
  return t.description.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q)
}

export function matchesFilters(
  t: {
    description: string
    amount: number
    notes?: string | null
    direction: CashFlowDirection
    category: string | null
    account_sync_id: string | null
    entry_method: string
  },
  filters: CashFlowFilters
): boolean {
  if (!matchesSearch(t, filters.search)) return false
  if (filters.direction !== 'all' && t.direction !== filters.direction) return false
  if (filters.category === 'uncategorized' && t.category) return false
  if (filters.category && filters.category !== 'uncategorized' && t.category !== filters.category) return false
  if (filters.accountSyncId && t.account_sync_id !== filters.accountSyncId) return false
  if (filters.source !== 'all' && t.entry_method !== filters.source) return false
  return true
}
