import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Landmark, Check, X } from 'lucide-react'
import type { NetWorthSnapshot, UpcomingItem } from '../../../shared/types'
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

function computeDelta(history: NetWorthSnapshot[]): { diff: number; pct: number } | null {
  if (history.length < 2) return null
  const latest = history[history.length - 1]
  const latestTime = new Date(latest.snapshot_date).getTime()
  const targetTime = latestTime - 30 * 24 * 60 * 60 * 1000
  let baseline = history[0]
  for (const h of history) {
    if (new Date(h.snapshot_date).getTime() <= targetTime) baseline = h
  }
  if (baseline.snapshot_date === latest.snapshot_date) return null
  const diff = latest.net_worth - baseline.net_worth
  const pct = baseline.net_worth !== 0 ? (diff / Math.abs(baseline.net_worth)) * 100 : 0
  return { diff, pct }
}

export default function Dashboard(): JSX.Element {
  const [totals, setTotals] = useState<{ totalAssets: number; totalLiabilities: number; netWorth: number } | null>(
    null
  )
  const [history, setHistory] = useState<NetWorthSnapshot[]>([])
  const [breakdown, setBreakdown] = useState<{ category: string; value: number }[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([])

  const load = async (): Promise<void> => {
    const [t, h, b, u] = await Promise.all([
      window.api.netWorth.summary(),
      window.api.netWorth.history(),
      window.api.netWorth.breakdown(),
      window.api.dashboard.upcoming()
    ])
    setTotals(t)
    setHistory(h)
    setBreakdown(b)
    setUpcoming(u)
  }

  useEffect(() => {
    load()
  }, [])

  const resolveUpcoming = async (item: UpcomingItem, status: 'paid' | 'dismissed'): Promise<void> => {
    setUpcoming((prev) => prev.filter((i) => i !== item))
    await window.api.dashboard.dismiss(item.itemType, item.itemId, item.dueDate, status)
  }

  if (!totals) return <div className="muted">Loading…</div>

  const chartData = history.map((h) => ({ date: h.snapshot_date, value: h.net_worth }))
  const delta = computeDelta(history)
  const isEmpty = totals.totalAssets === 0 && totals.totalLiabilities === 0

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      {isEmpty ? (
        <div className="card empty-state">
          <Landmark size={30} />
          <div style={{ marginBottom: 14 }}>
            Add your bank accounts, investments, real estate, or loans to start tracking your net
            worth.
          </div>
          <Link to="/accounts" className="btn">
            Add your first account
          </Link>
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
                  {delta.pct.toFixed(1)}%) · 30d
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

          <div className="grid cols-2 section">
            <div className="card">
              <div className="section-header">
                <h2>Net worth over time</h2>
              </div>
              <TrendChart data={chartData} height={240} label="Net worth" />
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
          </div>

          <div className="card section">
            <div className="section-header">
              <h2>Upcoming actions</h2>
            </div>
            {upcoming.length === 0 ? (
              <div className="muted">Nothing needs your attention right now.</div>
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
