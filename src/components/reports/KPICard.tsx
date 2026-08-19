// src/components/reports/KPICard.tsx
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}

const variantStyles = {
  default: {
    container: 'bg-card border-border',
    icon: 'bg-muted text-muted-foreground',
    value: 'text-foreground',
  },
  success: {
    container: 'bg-card border-green-200 dark:border-green-900',
    icon: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400',
    value: 'text-green-700 dark:text-green-400',
  },
  warning: {
    container: 'bg-card border-amber-200 dark:border-amber-900',
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
    value: 'text-amber-700 dark:text-amber-400',
  },
  danger: {
    container: 'bg-card border-red-200 dark:border-red-900',
    icon: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400',
    value: 'text-red-700 dark:text-red-400',
  },
  info: {
    container: 'bg-card border-blue-200 dark:border-blue-900',
    icon: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    value: 'text-blue-700 dark:text-blue-400',
  },
}

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  className,
}: KPICardProps) {
  const styles = variantStyles[variant]

  return (
    <div className={cn(
      'relative rounded-xl border p-5 transition-shadow hover:shadow-sm report-card',
      styles.container,
      className,
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
            {title}
          </p>
          <p className={cn('mt-1.5 text-2xl font-bold leading-none tabular-nums', styles.value)}>
            {value}
          </p>
          {subtitle && (
            <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'mt-2 text-xs font-medium',
              trend.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
            )}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn('flex-shrink-0 rounded-lg p-2.5', styles.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
