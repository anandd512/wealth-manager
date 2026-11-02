import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis } from 'recharts'
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Landmark, Check, ShieldCheck, CreditCard as CreditCardIcon, KeyRound, IdCard, Plus, AlertTriangle, Receipt } from 'lucide-react'
import type { Account, NetWorthSnapshot, UpcomingItem, InsurancePolicy, CashFlowMonthSummary } from '../../../shared/types'
import { formatCurrency, formatDate, todayLocalDateString, daysUntil } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/categories'
import { getUpcomingTypeIcon } from '../lib/typeIcons'
import TrendChart from '../components/TrendChart'
import IncomeExpenseTrendChart from '../components/IncomeExpenseTrendChart'
import { TOOLTIP_STYLE } from '../lib/chartStyle'


// Extends CATEGORY_LABELS with breakdown-only groupings (fixed deposits are split
// out of 'bank' server-side so they don't get lumped in with everyday savings).
const BREAKDOWN_LABELS: Record<string, string> = {
  ...CATEGORY_LABELS,
  fixed_deposits: 'Fixed Deposits'
}

function computeDelta(history: NetWorthSnapshot[], range: '1M' | '3M' | '6M' | '1Y' | 'All'): { diff: number; pct: number | null; label: string } | null {
  // 'All' has no real reference point to compare against — it would fall back to the
  // very first snapshot ever recorded, which is often a small/unrepresentative
  // starting balance (e.g. day one, before most accounts were added). Unlike the
  // bounded ranges (a real "N days ago" net worth), there's no sensible "vs. X" to
  // show here at all, not just a meaningless percentage — so skip the comparison
  // entirely rather than label it misleadingly.
  if (range === 'All') return null
  if (history.length < 2) return null
  const latest = history[history.length - 1]
  const latestTime = new Date(latest.snapshot_date).getTime()
  const rangeDays: Record<string, number> = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }
  const rangeLabels: Record<string, string> = { '1M': '30 days', '3M': '3 months', '6M': '6 months', '1Y': '1 year' }
  let baseline = history[0]
  const targetTime = latestTime - rangeDays[range] * 24 * 60 * 60 * 1000
  for (const h of history) {
    if (new Date(h.snapshot_date).getTime() <= targetTime) baseline = h
  }
  if (baseline.snapshot_date === latest.snapshot_date) return null
  const diff = latest.net_worth - baseline.net_worth
  const pct = baseline.net_worth !== 0 ? (diff / Math.abs(baseline.net_worth)) * 100 : null
  return { diff, pct, label: rangeLabels[range] }
}

const RANGE_DAYS: Record<string, number> = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }

export default function Dashboard(): JSX.Element {
  const [totals, setTotals] = useState<{ totalAssets: number; totalLiabilities: number; netWorth: number } | null>(
    null
  )
  const [history, setHistory] = useState<NetWorthSnapshot[]>([])
  const [breakdown, setBreakdown] = useState<{ category: string; value: number }[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([])
  const [insurancePolicies, setInsurancePolicies] = useState<InsurancePolicy[]>([])
  const [cashFlowSummary, setCashFlowSummary] = useState<CashFlowMonthSummary[]>([])
  // Bank accounts the user imports statements for that have none for last month —
  // the same check Cash Flow uses (it used to list every account, loans included).
  const [missingStatements, setMissingStatements] = useState<string[]>([])
  const [chartRange, setChartRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'All'>('All')
  // Accounts whose value is older than ~6 weeks — same rule as the Accounts tab.
  const [staleAccounts, setStaleAccounts] = useState(0)

  const lastMonth = (() => {
    // Day 1 first: on the 29th–31st, setMonth(-1) overflows into the current month
    // (31 Mar → "31 Feb" → 3 Mar) and the check silently looked at the wrong month.
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  const load = async (): Promise<void> => {
    const [t, h, b, u, ins, cf, missing, accts] = await Promise.all([
      api().netWorth.summary(),
      api().netWorth.history(),
      api().netWorth.breakdown(),
      api().dashboard.upcoming(),
      api().insurance.list(),
      api().cashFlow.summary(),
      api().cashFlow.missingStatements(lastMonth),
      api().accounts.list()
    ])
    setStaleAccounts(
      (accts as Account[]).filter((a) => {
        const d = daysUntil(a.last_updated?.slice(0, 10))
        return d !== null && -d > 45
      }).length
    )
    setTotals(t)
    setHistory(h)
    setBreakdown(b)
    setUpcoming(u)
    setInsurancePolicies(ins)
    setCashFlowSummary(cf)
    setMissingStatements(missing)
  }

  useEffect(() => {
    load()
  }, [])

  const resolveUpcoming = async (item: UpcomingItem, status: 'paid' | 'dismissed'): Promise<void> => {
    setUpcoming((prev) => prev.filter((i) => i !== item))
    await api().dashboard.dismiss(item.itemType, item.itemId, item.dueDate, status)
  }

  if (!totals) {
    // Placeholder cards rather than a bare "Loading…".
    return (
      <div>
        <h1 className="page-title">Dashboard</h1>
        <div className="cf-kpis section" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card stat-card">
              <div className="skeleton" style={{ width: '45%', height: 12 }} />
              <div className="skeleton" style={{ width: '70%', height: 28 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const chartData = history.map((h) => ({ date: h.snapshot_date, value: h.net_worth }))

  // Ranges count back from the latest snapshot, not from today — if the last
  // check-in was two months ago, "1M" used to show an empty chart.
  const filteredChartData = (() => {
    if (chartRange === 'All' || chartData.length === 0) return chartData
    const latest = new Date(chartData[chartData.length - 1].date).getTime()
    const cutoff = latest - RANGE_DAYS[chartRange] * 24 * 60 * 60 * 1000
    return chartData.filter((d) => new Date(d.date).getTime() >= cutoff)
  })()

  // The card always compares with ~30 days earlier; the chart's range picker (in a
  // different card) used to change it silently.
  const delta = computeDelta(history, '1M')
  const isEmpty = totals.totalAssets === 0 && totals.totalLiabilities === 0
  const noChartData = totals.netWorth === 0 && history.length === 0
  const lastUpdated = history.length > 0 ? history[history.length - 1].snapshot_date : null

  // Financial health score
  const debtRatio = totals.totalAssets > 0 ? totals.totalLiabilities / totals.totalAssets : 0
  // Only a policy that's still in force counts — an expired one used to pass this.
  const today = todayLocalDateString()
  const hasInsurance = insurancePolicies.some((p) => !p.expiry_date || p.expiry_date.slice(0, 10) >= today)
  const healthChecks = [
    { label: 'Debt below 40% of assets', pass: debtRatio < 0.4 },
    { label: 'At least one active insurance policy', pass: hasInsurance },
    { label: 'Net worth is positive', pass: totals.netWorth > 0 }
  ]
  const healthScore = healthChecks.filter((c) => c.pass).length
  // Three yes/no checks can't call anyone "healthy" — say what they actually show.
  const healthLabel = healthScore === 3 ? 'Basics covered' : healthScore === 2 ? 'On track' : 'Room to grow'
  const healthColor = healthScore === 3 ? 'var(--green)' : healthScore === 2 ? 'var(--amber)' : 'var(--red)'

  const RANGE_BUTTONS: Array<'1M' | '3M' | '6M' | '1Y' | 'All'> = ['1M', '3M', '6M', '1Y', 'All']

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      {isEmpty ? (
        <div className="setup-checklist">
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <Landmark size={36} style={{ color: 'var(--accent)', marginBottom: 12 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Welcome to Artha</h2>
            <p className="muted" style={{ margin: 0 }}>Add your first account — a bank balance, investment, or loan — and your net worth will appear here.</p>
          </div>
          <div className="setup-checklist-grid">
            <Link to="/accounts" className="setup-checklist-item" style={{ outline: '2px solid var(--accent)', outlineOffset: -2 }}>
              <Wallet size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <div style={{ fontWeight: 600 }}>Add accounts <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 4, marginLeft: 6, fontWeight: 700 }}>Start here</span></div>
                <div className="muted" style={{ fontSize: 12 }}>Bank, investments, real estate, loans</div>
              </div>
              <Plus size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
            </Link>
            <Link to="/cashflow" className="setup-checklist-item">
              <Receipt size={20} style={{ color: 'var(--green)' }} />
              <div>
                <div style={{ fontWeight: 600 }}>Track income & spending</div>
                <div className="muted" style={{ fontSize: 12 }}>Upload a bank statement — AI reads every transaction</div>
              </div>
              <Plus size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
            </Link>
            <Link to="/cards" className="setup-checklist-item">
              <CreditCardIcon size={20} style={{ color: 'var(--amber)' }} />
              <div>
                <div style={{ fontWeight: 600 }}>Add credit cards</div>
                <div className="muted" style={{ fontSize: 12 }}>Track statement dates and due dates</div>
              </div>
              <Plus size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
            </Link>
            <Link to="/insurance" className="setup-checklist-item">
              <ShieldCheck size={20} style={{ color: 'var(--green)' }} />
              <div>
                <div style={{ fontWeight: 600 }}>Add insurance</div>
                <div className="muted" style={{ fontSize: 12 }}>Life, health, vehicle — never miss a renewal</div>
              </div>
              <Plus size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
            </Link>
            <Link to="/ids" className="setup-checklist-item">
              <IdCard size={20} style={{ color: 'var(--text-dim)' }} />
              <div>
                <div style={{ fontWeight: 600 }}>Store identity documents</div>
                <div className="muted" style={{ fontSize: 12 }}>Aadhaar, PAN, Passport, Driving Licence</div>
              </div>
              <Plus size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
            </Link>
            <Link to="/vault" className="setup-checklist-item">
              <KeyRound size={20} style={{ color: 'var(--text-dim)' }} />
              <div>
                <div style={{ fontWeight: 600 }}>Save passwords</div>
                <div className="muted" style={{ fontSize: 12 }}>Encrypted vault for logins and credentials</div>
              </div>
              <Plus size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid cols-3 section">
            <div className="card stat-card">
              <div className="label">
                <Wallet size={15} /> Net worth
              </div>
              <div className={`value ${totals.netWorth >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(totals.netWorth)}
              </div>
              {delta && (
                <div className={`stat-delta ${delta.diff >= 0 ? 'positive' : 'negative'}`}>
                  {delta.diff >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {delta.diff >= 0 ? '+' : ''}
                  {formatCurrency(delta.diff)}
                  {delta.pct !== null && ` (${delta.pct >= 0 ? '+' : ''}${delta.pct.toFixed(1)}%)`} vs. {delta.label}
                </div>
              )}
              {!delta && history.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                  A comparison appears once there&apos;s a month of history
                </div>
              )}
              {totals.totalAssets > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: healthColor, flexShrink: 0 }} />
                  <span style={{ color: healthColor, fontWeight: 600 }}>{healthLabel}</span>
                  <span
                    className="muted"
                    title={`Basic checks (${healthScore}/3 passed):\n${healthChecks.map((c) => `${c.pass ? '✓' : '✗'} ${c.label}`).join('\n')}`}
                    style={{ cursor: 'help', borderBottom: '1px dotted var(--text-faint)' }}
                  >
                    · {healthScore}/3 basic checks
                  </span>
                </div>
              )}
            </div>
            <div className="card stat-card">
              <div className="label">
                <TrendingUp size={15} /> Total assets
              </div>
              <div className="value positive">{formatCurrency(totals.totalAssets)}</div>
            </div>
            <div className="card stat-card">
              <div className="label">
                <TrendingDown size={15} /> Total liabilities
              </div>
              <div className="value negative">{formatCurrency(totals.totalLiabilities)}</div>
            </div>
          </div>

          {lastUpdated && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -10, marginBottom: 16 }}>
              Updated {formatDate(lastUpdated)}
            </div>
          )}

          {/* What needs doing, right under the headline numbers — this used to sit at
              the very bottom, below four charts. */}
          <div className="card section">
            <div className="section-header">
              <h2>Needs attention</h2>
            </div>
            {staleAccounts > 0 && (
              <div className="notice warn" style={{ marginBottom: upcoming.length > 0 ? 'var(--space-3)' : 0 }}>
                <AlertTriangle />
                <div className="notice-body">
                  {staleAccounts} account{staleAccounts === 1 ? '' : 's'} not updated in over 6 weeks — your net worth may be
                  out of date.
                </div>
                <div className="notice-actions">
                  <Link to="/accounts" className="btn secondary small">
                    Update
                  </Link>
                </div>
              </div>
            )}
            {upcoming.length === 0 ? (
              staleAccounts === 0 && <div className="muted">You're all caught up ✓</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Item</th>
                    <th>Due</th>
                    <th>Days left</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((item) => {
                    const Icon = getUpcomingTypeIcon(item.itemType)
                    return (
                      <tr key={`${item.itemType}-${item.itemId}-${item.dueDate}`}>
                        <td className="muted">
                          <span className="type-cell">
                            <span className="icon">
                              <Icon />
                            </span>
                            {item.typeLabel}
                          </span>
                        </td>
                        <td>
                          {item.title}
                          {item.subtitle && (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {item.subtitle}
                            </div>
                          )}
                        </td>
                        <td className="muted">{formatDate(item.dueDate)}</td>
                        <td>
                          {/* Only the urgent ones get a badge — every row in red/amber was noise. */}
                          {item.daysLeft <= 7 ? (
                            <span className={`badge ${item.daysLeft <= 3 ? 'danger' : 'warn'}`}>
                              {item.daysLeft <= 0 ? 'Today' : `${item.daysLeft} days`}
                            </span>
                          ) : (
                            <span className="muted">in {item.daysLeft} days</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                            {item.itemType === 'credit_card' && (
                              <button className="btn small" title={item.actionLabel} onClick={() => resolveUpcoming(item, 'paid')}>
                                <Check size={13} /> Mark paid
                              </button>
                            )}
                            {item.itemType === 'check_in' && (
                              <Link to="/accounts" className="btn small" onClick={() => resolveUpcoming(item, 'dismissed')}>
                                Check in
                              </Link>
                            )}
                            <button
                              className="btn secondary small"
                              title={item.itemType === 'credit_card' ? 'Ignore this bill' : 'Dismiss'}
                              onClick={() => resolveUpcoming(item, 'dismissed')}
                            >
                              Dismiss
                            </button>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {cashFlowSummary.length > 0 && (() => {
            // Not just the summary array's last entry — that's the most recent
            // month with ANY data, which is last month, not this one, until the
            // user has logged something for the current month too.
            const thisMonth = cashFlowSummary.find((m) => m.month === todayLocalDateString().slice(0, 7))
            return (
              <div className="card section">
                <div className="section-header">
                  <h2>Income vs expense</h2>
                  <Link to="/cashflow" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
                    View cash flow →
                  </Link>
                </div>
                {thisMonth && (
                  // Same words as the Cash Flow tab (Money in / out / Left over); only
                  // money in is green, and left over turns red only when negative.
                  <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
                    <div>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Money in this month</div>
                      <div className="num" style={{ fontWeight: 600, fontSize: 15, color: 'var(--green)', textAlign: 'left' }}>
                        {formatCurrency(thisMonth.income_total)}
                      </div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Money out</div>
                      <div className="num" style={{ fontWeight: 600, fontSize: 15, textAlign: 'left' }}>
                        {formatCurrency(thisMonth.expense_total)}
                      </div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Left over so far</div>
                      <div
                        className="num"
                        style={{ fontWeight: 600, fontSize: 15, textAlign: 'left', color: thisMonth.net < 0 ? 'var(--red)' : undefined }}
                      >
                        {thisMonth.net < 0 ? '−' : ''}
                        {formatCurrency(Math.abs(thisMonth.net))}
                      </div>
                    </div>
                  </div>
                )}
                <IncomeExpenseTrendChart summary={cashFlowSummary} months={6} />
                {missingStatements.length > 0 && (
                  <div className="notice warn" style={{ marginTop: 'var(--space-3)' }}>
                    <AlertTriangle />
                    <div className="notice-body">No statement imported last month for {missingStatements.join(', ')}.</div>
                    <div className="notice-actions">
                      <Link to="/cashflow" className="btn secondary small">
                        Import
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {insurancePolicies.length > 0 && (() => {
            const lifeCover = insurancePolicies.filter(p => p.policy_type === 'term_life' || p.policy_type === 'life').reduce((s, p) => s + (p.sum_assured ?? 0), 0)
            const healthCover = insurancePolicies.filter(p => p.policy_type === 'health').reduce((s, p) => s + (p.sum_assured ?? 0), 0)
            const vehicleCover = insurancePolicies.filter(p => p.policy_type?.startsWith('vehicle')).reduce((s, p) => s + (p.sum_assured ?? 0), 0)
            const soonExpiring = insurancePolicies.filter(p => {
              if (!p.expiry_date && !p.renewal_date) return false
              const d = new Date(p.renewal_date ?? p.expiry_date!)
              const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000)
              return daysLeft >= 0 && daysLeft <= 90
            })
            return (
              <div className="card section" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <ShieldCheck size={14} style={{ color: 'var(--green)' }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Insurance coverage</span>
                  <span className="muted" style={{ fontSize: 12 }}>{insurancePolicies.length} polic{insurancePolicies.length === 1 ? 'y' : 'ies'}</span>
                </div>
                <div style={{ display: 'flex', gap: 24 }}>
                  {lifeCover > 0 && <div><div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Life cover</div><div style={{ fontWeight: 600, fontSize: 15 }}>{formatCurrency(lifeCover)}</div></div>}
                  {healthCover > 0 && <div><div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Health cover</div><div style={{ fontWeight: 600, fontSize: 15 }}>{formatCurrency(healthCover)}</div></div>}
                  {vehicleCover > 0 && <div><div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>Vehicle cover</div><div style={{ fontWeight: 600, fontSize: 15 }}>{formatCurrency(vehicleCover)}</div></div>}
                </div>
                {soonExpiring.length > 0 && (
                  <div className="notice warn" style={{ marginTop: 'var(--space-3)' }}>
                    <AlertTriangle />
                    <div className="notice-body">
                      {soonExpiring.length} polic{soonExpiring.length === 1 ? 'y' : 'ies'} renewing within 90 days.
                    </div>
                    <div className="notice-actions">
                      <Link to="/insurance" className="btn secondary small">
                        Review
                      </Link>
                    </div>
                  </div>
                )}
                <div>
                  <Link to="/insurance" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', marginTop: 6, display: 'inline-block' }}>→ View all</Link>
                </div>
              </div>
            )
          })()}

          {noChartData && (
            <div className="card section">
              <div className="empty-state">
                <TrendingUp size={32} />
                <p style={{ margin: '8px 0 0', fontSize: 13 }}>Add your accounts to see your net worth trend.</p>
              </div>
            </div>
          )}

          <div className="grid cols-2 section">
            <div className="card">
              <div className="section-header">
                <h2>Net worth over time</h2>
                <div className="segmented small" role="group" aria-label="Time range">
                  {RANGE_BUTTONS.map((r) => (
                    <button key={r} type="button" aria-pressed={chartRange === r} onClick={() => setChartRange(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <TrendChart data={filteredChartData} height={240} label="Net worth" />
            </div>

            <div className="card">
              <div className="section-header">
                <h2>Asset allocation</h2>
                <span className="muted" style={{ fontSize: 11 }}>Assets only</span>
              </div>
              {breakdown.length === 0 ? (
                <div className="muted" style={{ padding: '30px 0' }}>
                  Add some accounts to see your allocation.
                </div>
              ) : (
                // A ranked bar list instead of a donut: lengths compare at a glance,
                // every row shows its ₹ and %, and labels aren't cut to 12 characters.
                (() => {
                  const total = breakdown.reduce((s, b) => s + b.value, 0)
                  const sorted = [...breakdown].sort((a, b) => b.value - a.value)
                  const max = Math.max(1, ...sorted.map((b) => b.value))
                  return (
                    <div className="cf-spend-list">
                      {sorted.map((b) => (
                        <div key={b.category}>
                          <div className="cf-spend-head">
                            <span className="cf-spend-label">{BREAKDOWN_LABELS[b.category] ?? b.category}</span>
                            <span className="num">
                              {formatCurrency(b.value)}
                              <span className="cf-spend-pct">{total > 0 ? `${Math.round((b.value / total) * 100)}%` : ''}</span>
                            </span>
                          </div>
                          <div className="cf-spend-track">
                            <div className="cf-spend-fill" style={{ width: `${(b.value / max) * 100}%`, background: 'var(--chart-1)' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()
              )}
            </div>

            {history.length >= 2 && (
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div className="section-header">
                  <h2>Assets vs liabilities</h2>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={history.map(h => ({ date: h.snapshot_date, assets: h.total_assets, liabilities: h.total_liabilities }))}>
                    <defs>
                      <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="liabGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--red)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--red)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    {/* A light value axis so the areas have a scale (it was hidden). */}
                    <YAxis
                      width={44}
                      axisLine={false}
                      tickLine={false}
                      tickCount={4}
                      tick={{ fontSize: 11, fill: 'var(--text-faint)' }}
                      tickFormatter={(v: number) =>
                        Math.abs(v) >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : `${Math.round(v / 1000)}K`
                      }
                    />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v, name) => [formatCurrency(Number(v)), String(name) === 'assets' ? 'Assets' : 'Liabilities']}
                      labelFormatter={(l) => formatDate(String(l))}
                    />
                    <Area type="monotone" dataKey="assets" stroke="var(--green)" fill="url(#assetsGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="liabilities" stroke="var(--red)" fill="url(#liabGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
