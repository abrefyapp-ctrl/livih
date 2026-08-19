// src/components/reports/charts/CategoryBarChart.tsx
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { CategoryStat } from '@/types/reports'

interface CategoryBarChartProps {
  data: CategoryStat[]
  maxItems?: number
  height?: number
}

const COLORS = [
  'hsl(var(--primary))',
  '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f59e0b', '#10b981', '#3b82f6', '#f97316', '#84cc16',
]

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as CategoryStat
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-foreground mb-0.5">{d.categoryName}</p>
      <p className="text-muted-foreground">Total: <span className="font-semibold text-foreground tabular-nums">{d.total}</span></p>
      <p className="text-muted-foreground">Resolvidos: <span className="font-semibold text-green-600 tabular-nums">{d.resolved}</span></p>
      <p className="text-muted-foreground">Participação: <span className="font-semibold text-foreground tabular-nums">{d.pct}%</span></p>
    </div>
  )
}

export function CategoryBarChart({ data, maxItems = 8, height = 260 }: CategoryBarChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
        Sem dados de categoria no período
      </div>
    )
  }

  const sliced = data.slice(0, maxItems).map(d => ({
    ...d,
    // Trunca nomes longos para caber no eixo
    shortName: d.categoryName.length > 20
      ? d.categoryName.slice(0, 18) + '…'
      : d.categoryName,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={sliced}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="shortName"
          width={120}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {sliced.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
