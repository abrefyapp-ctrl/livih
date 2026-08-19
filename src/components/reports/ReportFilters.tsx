// src/components/reports/ReportFilters.tsx
import { useState } from 'react'
import { CalendarIcon, FilterIcon, RotateCcwIcon } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { DatePreset } from '@/types/reports'

interface Agent    { id: string; name: string }
interface Category { id: string; name: string }

interface ReportFiltersProps {
  preset: DatePreset
  dateFrom: Date
  dateTo: Date
  agentId: string | null
  categoryId: string | null
  status: string | null
  agents?: Agent[]
  categories?: Category[]
  showAgentFilter?: boolean
  onPreset: (p: DatePreset) => void
  onCustomFrom: (d: Date | undefined) => void
  onCustomTo: (d: Date | undefined) => void
  onAgent: (id: string | null) => void
  onCategory: (id: string | null) => void
  onStatus: (s: string | null) => void
  onReset: () => void
}

// Sentinela para "todos" — Radix não aceita value=""
const ALL = '__all__'

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: '7d',     label: 'Últimos 7 dias' },
  { value: '30d',    label: 'Últimos 30 dias' },
  { value: '90d',    label: 'Últimos 90 dias' },
  { value: 'custom', label: 'Personalizado' },
]

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Aberto' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'pending',     label: 'Pendente' },
  { value: 'resolved',    label: 'Resolvido' },
  { value: 'closed',      label: 'Fechado' },
]

export function ReportFilters({
  preset, dateFrom, dateTo,
  agentId, categoryId, status,
  agents = [], categories = [],
  showAgentFilter = true,
  onPreset, onCustomFrom, onCustomTo,
  onAgent, onCategory, onStatus, onReset,
}: ReportFiltersProps) {
  const [customFromOpen, setCustomFromOpen] = useState(false)
  const [customToOpen,   setCustomToOpen]   = useState(false)

  const hasFilters = agentId || categoryId || status

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Período */}
      <div className="flex items-center rounded-lg border bg-background overflow-hidden">
        {PRESETS.map(p => (
          <button
            key={p.value}
            onClick={() => onPreset(p.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              preset === p.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date pickers para período personalizado */}
      {preset === 'custom' && (
        <>
          <Popover open={customFromOpen} onOpenChange={setCustomFromOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(dateFrom, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={d => { onCustomFrom(d); setCustomFromOpen(false) }}
                locale={ptBR}
                toDate={dateTo}
              />
            </PopoverContent>
          </Popover>

          <span className="text-xs text-muted-foreground">até</span>

          <Popover open={customToOpen} onOpenChange={setCustomToOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(dateTo, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={d => { onCustomTo(d); setCustomToOpen(false) }}
                locale={ptBR}
                fromDate={dateFrom}
              />
            </PopoverContent>
          </Popover>
        </>
      )}

      <div className="flex items-center gap-2 ml-1">
        <FilterIcon className="h-3.5 w-3.5 text-muted-foreground" />

        {/* Agente */}
        {showAgentFilter && agents.length > 0 && (
          <Select
            value={agentId ?? ALL}
            onValueChange={v => onAgent(v === ALL ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="Todos os agentes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os agentes</SelectItem>
              {agents.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Categoria */}
        {categories.length > 0 && (
          <Select
            value={categoryId ?? ALL}
            onValueChange={v => onCategory(v === ALL ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as categorias</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Status */}
        <Select
          value={status ?? ALL}
          onValueChange={v => onStatus(v === ALL ? null : v)}
        >
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Reset */}
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={onReset}>
            <RotateCcwIcon className="h-3 w-3" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  )
}
