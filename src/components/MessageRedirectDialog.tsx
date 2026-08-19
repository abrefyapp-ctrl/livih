// MessageRedirectDialog.tsx - Versão ULTRA SIMPLIFICADA

import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ArrowRight, Copy, Move, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  ticket_number: number;
  subject: string | null;
  status: string;
  customer_id: string;
}

interface MessageRedirectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  messageContent: string;
  currentTicketId: string;
  currentTicketNumber: number;
  organizationId: string;
  customerId?: string;
  onSuccess?: () => void;
}

export function MessageRedirectDialog({
  open,
  onOpenChange,
  messageId,
  messageContent,
  currentTicketId,
  currentTicketNumber,
  organizationId,
  customerId,
  onSuccess,
}: MessageRedirectDialogProps) {
  const [redirectType, setRedirectType] = useState<'move' | 'copy'>('move');
  const [targetTicketId, setTargetTicketId] = useState<string>('');
  const [redirectReason, setRedirectReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [scope, setScope] = useState<'customer' | 'all'>('customer');

  useEffect(() => {
    if (open && organizationId) {
      loadTickets();
    }
  }, [open, scope, searchTerm, organizationId]);

  const loadTickets = async () => {
    if (!organizationId) {
      toast.error('Organization ID não informado');
      return;
    }

    setSearching(true);
    try {
      // Query SUPER simples - só campos básicos
      const { data, error } = await supabase
        .from('tickets')
        .select('id, ticket_number, subject, status, customer_id')
        .eq('organization_id', organizationId)
        .neq('id', currentTicketId)
        .in('status', ['open', 'in_progress', 'pending'])
        .order('ticket_number', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Erro:', error);
        throw error;
      }

      let filtered = data || [];

      // Filtro por cliente (em memória)
      if (scope === 'customer' && customerId) {
        filtered = filtered.filter(t => t.customer_id === customerId);
      }

      // Busca (em memória)
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const num = parseInt(term);
        
        filtered = filtered.filter(t => 
          (!isNaN(num) && t.ticket_number === num) ||
          (t.subject && t.subject.toLowerCase().includes(term))
        );
      }

      setTickets(filtered);
    } catch (error: any) {
      console.error('Erro completo:', error);
      toast.error(error.message || 'Erro ao carregar tickets');
    } finally {
      setSearching(false);
    }
  };

  const handleRedirect = async () => {
    if (!targetTicketId) {
      toast.error('Selecione um ticket de destino');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('redirect_message_to_ticket', {
        p_message_id: messageId,
        p_target_ticket_id: targetTicketId,
        p_redirect_type: redirectType,
        p_redirected_by: null,
        p_redirect_reason: redirectReason.trim() || null,
      });

      if (error) throw error;

      const action = redirectType === 'move' ? 'movida' : 'copiada';
      const targetTicket = tickets.find(t => t.id === targetTicketId);
      
      toast.success(
        `Mensagem ${action} para o ticket #${targetTicket?.ticket_number || '?'}`
      );

      onOpenChange(false);
      if (onSuccess) onSuccess();

      setTargetTicketId('');
      setRedirectReason('');
      setSearchTerm('');
    } catch (error: any) {
      console.error('Erro ao redirecionar:', error);
      toast.error(error.message || 'Erro ao redirecionar mensagem');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-blue-500',
      in_progress: 'bg-yellow-500',
      pending: 'bg-orange-500',
    };
    const labels: Record<string, string> = {
      open: 'Aberto',
      in_progress: 'Em Andamento',
      pending: 'Pendente',
    };
    return (
      <Badge className={`${colors[status] || 'bg-gray-500'} text-white`}>
        {labels[status] || status}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Redirecionar Mensagem</DialogTitle>
          <DialogDescription>
            Ticket atual: #{currentTicketNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="border rounded-lg p-3 bg-muted">
            <Label className="text-xs text-muted-foreground mb-1">Mensagem</Label>
            <p className="text-sm line-clamp-3">{messageContent}</p>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Redirecionamento</Label>
            <RadioGroup
              value={redirectType}
              onValueChange={(value) => setRedirectType(value as 'move' | 'copy')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="move" id="move" />
                <Label htmlFor="move" className="flex items-center gap-2 cursor-pointer">
                  <Move className="w-4 h-4" />
                  Mover
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="copy" id="copy" />
                <Label htmlFor="copy" className="flex items-center gap-2 cursor-pointer">
                  <Copy className="w-4 h-4" />
                  Copiar
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Buscar em</Label>
            <Select value={scope} onValueChange={(value: any) => setScope(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Tickets deste cliente</SelectItem>
                <SelectItem value="all">Todos os tickets abertos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="search">Buscar Ticket</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Número ou assunto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-hidden flex flex-col">
            <Label>Ticket de Destino ({tickets.length} disponíveis)</Label>
            <ScrollArea className="flex-1 border rounded-lg">
              {searching ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <p>Nenhum ticket encontrado</p>
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => setTargetTicketId(ticket.id)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all hover:bg-accent ${
                        targetTicketId === ticket.id
                          ? 'border-primary bg-accent'
                          : 'border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">#{ticket.ticket_number}</span>
                            {getStatusBadge(ticket.status)}
                          </div>
                          {ticket.subject && (
                            <p className="text-sm line-clamp-1">{ticket.subject}</p>
                          )}
                        </div>
                        {targetTicketId === ticket.id && (
                          <ArrowRight className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo (opcional)</Label>
            <Textarea
              id="reason"
              placeholder="Ex: Assunto relacionado"
              value={redirectReason}
              onChange={(e) => setRedirectReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleRedirect} disabled={!targetTicketId || loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {redirectType === 'move' ? 'Mover' : 'Copiar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
