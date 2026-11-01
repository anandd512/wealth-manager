import { useState } from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import type { CashFlowCategory, CashFlowDirection } from '../../../shared/types'
import {
  CATEGORY_GROUP_TITLE,
  EVERYDAY_CATEGORIES,
  categoriesFor,
  categoryColor,
  categoryLabel,
  countsTowardPnl,
  defaultCategoryFor
} from '../lib/cashFlowCategories'
import Popover from './Popover'

export interface CategoryValue {
  category: CashFlowCategory | null
  subcategory: string | null
}

interface Props {
  direction: CashFlowDirection
  value: CategoryValue
  onChange: (next: CategoryValue) => void
  // 'chip' — compact, for list rows. 'field' — looks like a form input, for the
  // entry modal. 'button' — "Set category" with no current value, for bulk actions.
  variant?: 'chip' | 'field' | 'button'
}

// The category people pick is the everyday name ("Groceries"); the broader
// category it counts toward ("Everyday spending") follows from it automatically.
// The "Counts as" row at the bottom lets an expert override that for one
// transaction without leaving the picker.
export default function CashFlowCategoryPicker({ direction, value, onChange, variant = 'chip' }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const name = value.subcategory?.trim() || null
  const bucketLabel = categoryLabel(value.category, direction, 'short')
  const color = categoryColor(value.category, direction)
  const counted = countsTowardPnl(value.category)
  const display = name ?? bucketLabel

  const q = query.trim().toLowerCase()
  const options = EVERYDAY_CATEGORIES[direction].filter((o) => !q || o.name.toLowerCase().includes(q))
  const exact = EVERYDAY_CATEGORIES[direction].some((o) => o.name.toLowerCase() === q)
  const groups = categoriesFor(direction, 'short')
    .map((c) => ({ category: c.value, title: CATEGORY_GROUP_TITLE[direction][c.value] ?? c.label, items: options.filter((o) => o.category === c.value) }))
    .filter((g) => g.items.length > 0)

  const trigger =
    variant === 'button' ? (
      'Set category'
    ) : display ? (
      <>
        {color && <span className="chip-dot" style={{ background: color }} />}
        <span className="cf-picker-name">{display}</span>
        {!counted && <span className="cf-chip-note">· not counted</span>}
        {variant === 'field' && <ChevronDown className="cf-picker-caret" />}
      </>
    ) : variant === 'field' ? (
      <>
        <span className="muted">Choose a category…</span>
        <ChevronDown className="cf-picker-caret" />
      </>
    ) : (
      <>
        <Plus /> Categorize
      </>
    )

  const triggerClass =
    variant === 'button' ? 'btn secondary small' : variant === 'field' ? 'cf-picker-field' : `chip ${display ? '' : 'empty'}`

  return (
    <Popover
      ariaLabel={`Category${display ? `: ${display}` : ''}`}
      triggerTitle={
        display && name && bucketLabel ? `${name} — counts as ${bucketLabel}${counted ? '' : ' (not counted in totals)'}` : undefined
      }
      triggerClassName={triggerClass}
      trigger={trigger}
    >
      {(close) => {
        const pick = (next: CategoryValue): void => {
          close()
          setQuery('')
          if (next.category !== value.category || (next.subcategory ?? null) !== (value.subcategory ?? null)) onChange(next)
        }
        return (
          <div className="cf-picker">
            <div className="cf-picker-search">
              <Search aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search or type a new one"
                aria-label="Search categories"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Never let Enter reach a surrounding form/modal (it would save it).
                    e.preventDefault()
                    e.stopPropagation()
                    if (options.length === 1) pick({ category: options[0].category, subcategory: options[0].name })
                    else if (q && !exact) pick({ category: defaultCategoryFor(query, direction), subcategory: query.trim() })
                  }
                }}
              />
            </div>
            <div className="cf-picker-list" role="menu">
              {groups.map((g) => (
                <div key={g.category} role="group" aria-label={g.title}>
                  <div className="cf-picker-group">{g.title}</div>
                  {g.items.map((o) => {
                    const selected = name?.toLowerCase() === o.name.toLowerCase()
                    const dot = categoryColor(o.category, direction)
                    return (
                      <button
                        key={o.name}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className="action-menu-item"
                        onClick={() => pick({ category: o.category, subcategory: o.name })}
                      >
                        <span className="chip-dot" style={dot ? { background: dot } : { border: '1px dashed var(--text-faint)' }} />
                        {o.name}
                        {selected && <Check className="cf-category-check" />}
                      </button>
                    )
                  })}
                </div>
              ))}
              {q && !exact && (
                <button
                  type="button"
                  className="action-menu-item"
                  onClick={() => pick({ category: defaultCategoryFor(query, direction), subcategory: query.trim() })}
                >
                  <Plus />
                  <span className="action-menu-item-text">
                    Use “{query.trim()}”
                    <span className="action-menu-item-hint">New category, counted as everyday {direction === 'income' ? 'income' : 'spending'}</span>
                  </span>
                </button>
              )}
              {!q && (
                <button type="button" className="action-menu-item" onClick={() => pick({ category: null, subcategory: null })}>
                  <span className="chip-dot" style={{ background: 'var(--cf-uncategorized)' }} />
                  <span className="action-menu-item-text">
                    Uncategorized
                    <span className="action-menu-item-hint">Still counted — decide later</span>
                  </span>
                  {variant !== 'button' && !value.category && !name && <Check className="cf-category-check" />}
                </button>
              )}
            </div>
            {/* Expert override: keep the name, change what it counts toward. */}
            {variant !== 'button' && name && (
              <label className="cf-picker-counts">
                Counts as
                <select
                  value={value.category ?? ''}
                  onChange={(e) => pick({ category: (e.target.value || null) as CashFlowCategory | null, subcategory: name })}
                >
                  <option value="">Uncategorized</option>
                  {categoriesFor(direction, 'long').map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )
      }}
    </Popover>
  )
}
