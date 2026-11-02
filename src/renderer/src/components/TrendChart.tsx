import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { formatCurrency, formatDate, formatDateShort } from '../lib/format'
import { TOOLTIP_STYLE } from '../lib/chartStyle'

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
        <CartesianGrid stroke="var(--border-soft)" vertical={false} />
        <XAxis
          dataKey="date"
          type="number"
          domain={['dataMin', 'dataMax']}
          stroke="var(--text-faint)"
          fontSize={11}
          tickFormatter={(d) => formatDateShort(new Date(d).toISOString())}
        />
        <YAxis
          stroke="var(--text-faint)"
          fontSize={11}
          tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`}
          width={40}
        />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(d) => formatDate(new Date(d as number).toISOString())}
          formatter={(v) => [formatCurrency(Number(v)), label]}
        />
        <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
