// src/components/reports/charts/SlaDonutChart.tsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface SlaDonutChartProps {
  completed: number
  breached: number
  atRisk: number
  withinSla: number
  height?: number
}

const RADIAN = Math.PI / 180

const renderCustomLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent,
}: any) => {
  if (percent < 0.05) return null
  const r  = innerRadius + (outerRadius - innerRadius) * 0.6
  const x  = cx + r * Math.cos(-midAngle * RADIAN)
  const y  = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 600 }}>
      {`${Math.round(percent * 100)}%`}
    </text>
  )
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium" style={{ color: payload[0].payload.fill }}>{name}</p>
      <p className="tabular-nums font-semibold text-foreground">{value} chamado{value !== 1 ? 's' : ''}</p>
    </div>
  )
}

export function SlaDonutChart({
  completed, breached, atRisk, withinSla, height = 240,
}: SlaDonutChartProps) {
  const data = [
    { name: 'Cumprido',   value: completed, fill: '#22c55e' },
    { name: 'No prazo',   value: withinSla, fill: '#3b82f6' },
    { name: 'Em risco',   value: atRisk,    fill: '#f59e0b' },
    { name: 'Violado',    value: breached,  fill: '#ef4444' },
  ].filter(d => d.value > 0)

  const total = completed + breached + atRisk + withinSla

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">
        Sem dados de SLA no período
      </div>
    )
  }

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="78%"
            paddingAngle={2}
            dataKey="value"
            labelLine={false}
            label={renderCustomLabel}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>

      {/* Texto central */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
        <span className="text-xs text-muted-foreground">total</span>
      </div>
    </div>
  )
}
