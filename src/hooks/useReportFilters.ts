// src/hooks/useReportFilters.ts
// Estado compartilhado de filtros do relatório

import { useState, useCallback, useMemo } from 'react'
import { subDays, startOfDay, endOfDay } from 'date-fns'
import type { DatePreset, ReportFilters } from '@/types/reports'

function buildDates(preset: DatePreset, customFrom?: Date, customTo?: Date) {
  const today = new Date()
  if (preset === '7d')   return { from: startOfDay(subDays(today, 6)), to: endOfDay(today) }
  if (preset === '30d')  return { from: startOfDay(subDays(today, 29)), to: endOfDay(today) }
  if (preset === '90d')  return { from: startOfDay(subDays(today, 89)), to: endOfDay(today) }
  // custom
  return {
    from: customFrom ? startOfDay(customFrom) : startOfDay(subDays(today, 29)),
    to:   customTo   ? endOfDay(customTo)     : endOfDay(today),
  }
}

export function useReportFilters(organizationId: string) {
  const [preset, setPreset] = useState<DatePreset>('30d')
  const [customFrom, setCustomFrom] = useState<Date | undefined>()
  const [customTo,   setCustomTo]   = useState<Date | undefined>()
  const [agentId,    setAgentId]    = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [status,     setStatus]     = useState<string | null>(null)

  const { from: dateFrom, to: dateTo } = useMemo(
    () => buildDates(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  )

  const filters: ReportFilters = useMemo(() => ({
    preset,
    dateFrom,
    dateTo,
    agentId,
    categoryId,
    status,
    organizationId,
  }), [preset, dateFrom, dateTo, agentId, categoryId, status, organizationId])

  const handlePreset = useCallback((p: DatePreset) => {
    setPreset(p)
    if (p !== 'custom') {
      setCustomFrom(undefined)
      setCustomTo(undefined)
    }
  }, [])

  const reset = useCallback(() => {
    setPreset('30d')
    setCustomFrom(undefined)
    setCustomTo(undefined)
    setAgentId(null)
    setCategoryId(null)
    setStatus(null)
  }, [])

  return {
    filters,
    preset,
    dateFrom,
    dateTo,
    agentId,
    categoryId,
    status,
    setPreset: handlePreset,
    setCustomFrom,
    setCustomTo,
    setAgentId,
    setCategoryId,
    setStatus,
    reset,
  }
}
