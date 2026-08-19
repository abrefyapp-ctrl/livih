// src/components/reports/TokenManager.tsx
// Geração e gestão de links de relatório para clientes

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Link, Plus, Copy, Trash,
  Check, Calendar, User as UserIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { useReportTokens } from '@/hooks/useCustomerReport'
import type { CustomerReportToken } from '@/types/reports'

interface TokenManagerProps {
  organizationId: string
  agentId: string
}

function TokenRow({
  token,
  onCopy,
  onDeactivate,
}: {
  token: CustomerReportToken
  onCopy: (id: string) => void
  onDeactivate: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 text-sm bg-card">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{token.label}</p>
          {token.customer_name && (
            <Badge variant="secondary" className="text-xs gap-1 shrink-0">
              <UserIcon className="h-3 w-3" />
              {token.customer_name}
            </Badge>
          )}
          {!token.is_active && (
            <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
              Inativo
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <span>Criado {format(new Date(token.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
          {token.expires_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Expira {format(new Date(token.expires_at), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onCopy(token.id)}
          disabled={!token.is_active}
          title="Copiar link"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {token.is_active && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onDeactivate(token.id)}
            title="Desativar token"
          >
            <Trash className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function TokenManager({ organizationId, agentId }: TokenManagerProps) {
  const queryClient = useQueryClient()
  const { data: tokens = [], isLoading } = useReportTokens(organizationId)

  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  // Cria novo token
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('customer_report_tokens')
        .insert({
          organization_id: organizationId,
          label: label.trim(),
          expires_at: expiresAt || null,
          created_by: agentId,
        })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-tokens', organizationId] })
      setLabel('')
      setExpiresAt('')
      setOpen(false)
      toast.success('Link de relatório criado com sucesso')
    },
    onError: () => toast.error('Erro ao criar link de relatório'),
  })

  // Desativa token
  const deactivateMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const { error } = await supabase
        .from('customer_report_tokens')
        .update({ is_active: false })
        .eq('id', tokenId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-tokens', organizationId] })
      toast.success('Link desativado')
    },
    onError: () => toast.error('Erro ao desativar link'),
  })

  function buildUrl(tokenId: string) {
    return `${window.location.origin}/relatorio/${tokenId}`
  }

  async function handleCopy(tokenId: string) {
    await navigator.clipboard.writeText(buildUrl(tokenId))
    setCopied(tokenId)
    toast.success('Link copiado para a área de transferência')
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Link className="h-4 w-4 text-muted-foreground" />
            Links de relatório para clientes
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gere links compartilháveis com uma visão simplificada do relatório.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Novo link
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Criar link de relatório</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="token-label" className="text-xs">
                  Descrição do link <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="token-label"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="ex: Relatório Mensal — Acme Corp"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="token-expires" className="text-xs">
                  Data de expiração <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="token-expires"
                  type="date"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={!label.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? 'Criando…' : 'Criar link'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Link className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhum link criado ainda. Crie um para compartilhar o relatório com seus clientes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tokens.map(token => (
            <TokenRow
              key={token.id}
              token={token}
              onCopy={handleCopy}
              onDeactivate={id => deactivateMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
