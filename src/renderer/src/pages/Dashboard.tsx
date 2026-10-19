import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, AreaChart, Area, XAxis, YAxis } from 'recharts'
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Landmark, Check, X, ShieldCheck, CreditCard as CreditCardIcon, KeyRound, IdCard, Plus, AlertTriangle } from 'lucide-react'
import type { NetWorthSnapshot, UpcomingItem, InsurancePolicy } from '../../../shared/types'
import { formatCurrency, formatDate } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/categories'
import { getUpcomingTypeIcon } from '../lib/typeIcons'
import TrendChart from '../components/TrendChart'

const PIE_COLORS = ['#5b8def', '#3ecf8e', '#e8b14f', '#ef5b5b', '#9d7bd8', '#4fd0e8']

// Extends CATEGORY_LABELS with breakdown-only groupings (fixed deposits are split
// out of 'bank' server-side so they don't get lumped in with everyday savings).
const BREAKDOWN_LABELS: Record<string, string> = {
  ...CATEGORY_LABELS,
  fixed_deposits: 'Fixed Deposits'
}

function computeDelta(history: NetWorthSnapshot[], range: '1M' | '3M' | '6M' | '1Y' | 'All'): { diff: number; pct: number; label: string } | null {
  if (history.length < 2) return null
  const latest = history[history.length - 1]
  const latestTime = new Date(latest.snapshot_date).getTime()
  const rangeDays: Record<string, number> = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }
  const rangeLabels: Record<string, string> = { '1M': '30 days', '3M': '3 months', '6M': '6 months', '1Y': '1 year', 'All': 'all time' }
  let baseline = history[0]
  if (range !== 'All') {
    const targetTime = latestTime - rangeDays[range] * 24 * 60 * 60 * 1000
    for (const h of history) {
      if (new Date(h.snapshot_date).getTime() <= targetTime) baseline = h
    }
  }
  if (baseline.snapshot_date === latest.snapshot_date) return null
  const diff = latest.net_worth - baseline.net_worth
  const pct = baseline.net_worth !== 0 ? (diff / Math.abs(baseline.net_worth)) * 100 : 0
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
  const [chartRange, setChartRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'All'>('All')

  const load = async (): Promise<void> => {
    const [t, h, b, u, ins] = await Promise.all([
      api().netWorth.summary(),
      api().netWorth.history(),
      api().netWorth.breakdown(),
      api().dashboard.upcoming(),
      api().insurance.list()
    ])
    setTotals(t)
    setHistory(h)
    setBreakdown(b)
    setUpcoming(u)
    setInsurancePolicies(ins)
  }

  useEffect(() => {
    load()
  }, [])

  const resolveUpcoming = async (item: UpcomingItem, status: 'paid' | 'dismissed'): Promise<void> => {
    setUpcoming((prev) => prev.filter((i) => i !== item))
    await api().dashboard.dismiss(item.itemType, item.itemId, item.dueDate, status)
  }

  if (!totals) return <div className="muted">Loading…</div>

  const chartData = history.map((h) => ({ date: h.snapshot_date, value: h.net_worth }))

  const filteredChartData = (() => {
    if (chartRange === 'All') return chartData
    const cutoff = Date.now() - RANGE_DAYS[chartRange] * 24 * 60 * 60 * 1000
    return chartData.filter((d) => new Date(d.date).getTime() >= cutoff)
  })()

  const delta = computeDelta(history, chartRange)
  const isEmpty = totals.totalAssets === 0 && totals.totalLiabilities === 0

  // Financial health score
  const debtRatio = totals.totalAssets > 0 ? totals.totalLiabilities / totals.totalAssets : 0
  const hasInsurance = insurancePolicies.length > 0
  const healthScore = [debtRatio < 0.4, hasInsurance, totals.netWorth > 0].filter(Boolean).length
  const healthLabel = healthScore === 3 ? 'Healthy' : healthScore === 2 ? 'On track' : 'Room to grow'
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
                  {formatCurrency(delta.diff)} ({delta.pct >= 0 ? '+' : ''}
                  {delta.pct.toFixed(1)}%) vs. {delta.label}
                </div>
              )}
              {totals.totalAssets > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: healthColor, flexShrink: 0 }} />
                  <span style={{ color: healthColor, fontWeight: 600 }}>{healthLabel}</span>
                  <span className="muted">· {healthScore}/3 health indicators</span>
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
                  <div style={{ marginTop: 10, padding: '7px 10px', background: 'var(--amber-soft)', borderRadius: 7, fontSize: 12, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={13} />
                    {soonExpiring.length} polic{soonExpiring.length === 1 ? 'y' : 'ies'} renewing within 90 days — <Link to="/insurance" style={{ color: 'var(--amber)', textDecoration: 'underline' }}>see your insurance →</Link>
                  </div>
                )}
              </div>
            )
          })()}

          <div className="grid cols-2 section">
            <div className="card">
              <div className="section-header">
                <h2>Net worth over time</h2>
                <div style={{ display: 'flex', gap: 4 }}>
                  {RANGE_BUTTONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setChartRange(r)}
                      style={{
                        background: chartRange === r ? 'var(--accent)' : 'transparent',
                        color: chartRange === r ? '#fff' : 'var(--text-faint)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: 11,
                        cursor: 'pointer'
                      }}
                    >
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
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="value"
                      nameKey="category"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {breakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#141a26', border: '1px solid #232c3f', borderRadius: 10 }}
                      labelStyle={{ color: '#8b96ad' }}
                      itemStyle={{ color: '#edf1f9' }}
                      formatter={(v: number, _n, entry) => [
                        formatCurrency(v),
                        BREAKDOWN_LABELS[entry.payload.category as string] ?? entry.payload.category
                      ]}
                    />
                    <Legend
                      formatter={(value) => BREAKDOWN_LABELS[value as string] ?? value}
                      wrapperStyle={{ fontSize: 12, color: '#8b96ad' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
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
                        <stop offset="5%" stopColor="#3ecf8e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3ecf8e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="liabGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef5b5b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef5b5b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: '#141a26', border: '1px solid #232c3f', borderRadius: 10 }}
                      itemStyle={{ color: '#edf1f9' }}
                      formatter={(v: number, name: string) => [formatCurrency(v), name === 'assets' ? 'Assets' : 'Liabilities']}
                      labelFormatter={(l: string) => new Date(l).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    />
                    <Area type="monotone" dataKey="assets" stroke="#3ecf8e" fill="url(#assetsGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="liabilities" stroke="#ef5b5b" fill="url(#liabGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card section">
            <div className="section-header">
              <h2>Upcoming actions</h2>
            </div>
            {upcoming.length === 0 ? (
              <div className="muted">You're all caught up! ✓</div>
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
                          <span className={`badge ${item.daysLeft <= 15 ? 'danger' : 'warn'}`}>
                            {item.daysLeft} days
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {(item.itemType === 'credit_card' || item.itemType === 'check_in') && (
                            <button
                              className="icon-btn"
                              style={{ marginRight: 6 }}
                              title={item.actionLabel}
                              onClick={() => resolveUpcoming(item, 'paid')}
                            >
                              <Check size={15} />
                            </button>
                          )}
                          <button
                            className="icon-btn"
                            title={item.itemType === 'credit_card' ? 'Ignore' : 'Dismiss'}
                            onClick={() => resolveUpcoming(item, 'dismissed')}
                          >
                            <X size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
