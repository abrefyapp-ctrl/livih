// src/components/reports/AgentPerformanceTable.tsx
import { cn } from '@/lib/utils'
import { formatMinutes } from '@/lib/reports/exportReport'
import type { AgentPerformance } from '@/types/reports'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

interface AgentPerformanceTableProps {
  data: AgentPerformance[]
  isLoading?: boolean
}

function SlaBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>
  const color =
    pct >= 90 ? 'bg-green-500' :
    pct >= 70 ? 'bg-amber-500' :
               'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums font-medium w-9 text-right">{pct}%</span>
    </div>
  )
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

export function AgentPerformanceTable({ data, isLoading }: AgentPerformanceTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhum agente com chamados no período.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">Agente</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">Total</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">Resolvidos</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">Taxa res.</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">1ª resposta</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">Resolução</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-40">SLA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map(agent => (
            <tr key={agent.agentId} className="hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-7 w-7 flex-shrink-0">
                    <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                      {initials(agent.agentName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium truncate text-sm">{agent.agentName}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums font-semibold">{agent.total}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-green-600 dark:text-green-400 font-semibold">
                {agent.resolved}
              </td>
              <td className="px-3 py-2.5 text-center">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs tabular-nums font-semibold',
                    agent.resolutionRate >= 80 ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400' :
                    agent.resolutionRate >= 60 ? 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400' :
                                                 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400',
                  )}
                >
                  {agent.resolutionRate}%
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-center text-xs tabular-nums">
                {formatMinutes(agent.avgFirstResponseMinutes)}
              </td>
              <td className="px-3 py-2.5 text-center text-xs tabular-nums">
                {formatMinutes(agent.avgResolutionMinutes)}
              </td>
              <td className="px-3 py-2.5 w-40">
                <SlaBar pct={agent.slaCompliancePct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
