import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { formatCurrency, formatDate } from '../lib/format'

interface Props {
  data: { date: string; value: number }[]
  height?: number
  label?: string
}

// Shared proportional-time line chart: X axis is a real numeric time scale (not
// Recharts' default evenly-spaced category axis), so gaps between dates are drawn
// to scale.
export default function TrendChart({ data, height = 220, label = 'Value' }: Props): JSX.Element {
  const chartData = data.map((d) => ({ date: new Date(d.date).getTime(), value: d.value }))

  if (chartData.length < 2) {
    return (
      <div className="muted" style={{ padding: '30px 0' }}>
        Not enough data points yet for a trend line.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <CartesianGrid stroke="#2a3450" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          type="number"
          domain={['dataMin', 'dataMax']}
          stroke="#93a0bd"
          fontSize={11}
          tickFormatter={(d) => formatDate(new Date(d).toISOString())}
        />
        <YAxis
          stroke="#93a0bd"
          fontSize={11}
          tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`}
          width={40}
        />
        <Tooltip
          contentStyle={{ background: '#1b2436', border: '1px solid #2a3450', borderRadius: 8 }}
          labelStyle={{ color: '#93a0bd' }}
          itemStyle={{ color: '#e8ecf5' }}
          labelFormatter={(d) => formatDate(new Date(d as number).toISOString())}
          formatter={(v: number) => [formatCurrency(v), label]}
        />
        <Line type="monotone" dataKey="value" stroke="#5b8def" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
