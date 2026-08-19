// src/components/reports/charts/VolumeChart.tsx
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DailyVolume } from '@/types/reports'

interface VolumeChartProps {
  data: DailyVolume[]
  height?: number
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-foreground mb-1">
        {label}
      </p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="tabular-nums">
          {p.name === 'opened' ? 'Abertos' : 'Resolvidos'}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export function VolumeChart({ data, height = 260 }: VolumeChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
        Sem dados para o período selecionado
      </div>
    )
  }

  const formatted = data
    .filter(d => d.day && !isNaN(new Date(d.day).getTime()))
    .map(d => ({
      ...d,
      dayLabel: format(parseISO(d.day), 'dd/MM'),
    }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.15} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="dayLabel"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => value === 'opened' ? 'Abertos' : 'Resolvidos'}
        />
        <Area
          type="monotone"
          dataKey="opened"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#gradOpened)"
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="resolved"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#gradResolved)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
