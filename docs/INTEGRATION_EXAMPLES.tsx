// EXEMPLO DE INTEGRAÇÃO: Como adicionar o redirecionamento ao seu componente de mensagens

import { MessageActions } from '@/components/MessageActions';
import { Badge } from '@/components/ui/badge';
import { Forward } from 'lucide-react';

// ============================================================================
// EXEMPLO 1: Integrar no componente de mensagem individual
// ============================================================================

interface MessageItemProps {
  message: any;
  ticket: any;
  onUpdate: () => void;
}

function MessageItem({ message, ticket, onUpdate }: MessageItemProps) {
  return (
    <div className="group relative p-4 hover:bg-accent/50 rounded-lg">
      {/* Badge para mensagens redirecionadas */}
      {message.is_redirected && (
        <Badge variant="secondary" className="mb-2 gap-1">
          <Forward className="w-3 h-3" />
          Mensagem Redirecionada
        </Badge>
      )}

      {/* Conteúdo da mensagem */}
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm">{message.content_text}</p>
          <span className="text-xs text-muted-foreground">
            {new Date(message.created_at).toLocaleString()}
          </span>
        </div>

        {/* Menu de ações - aparece no hover */}
        <MessageActions
          message={message}
          ticketId={ticket.id}
          ticketNumber={ticket.ticket_number}
          organizationId={ticket.organization_id}
          customerId={ticket.customer_id}
          onSuccess={onUpdate}
        />
      </div>
    </div>
  );
}

// ============================================================================
// EXEMPLO 2: Adicionar botão de redirecionamento em ações em massa
// ============================================================================

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { MessageRedirectDialog } from '@/components/MessageRedirectDialog';

function MessagesListWithBulkActions() {
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [redirectDialogOpen, setRedirectDialogOpen] = useState(false);

  return (
    <div>
      {/* Barra de ações em massa */}
      {selectedMessages.length > 0 && (
        <div className="sticky top-0 bg-background border-b p-4 flex items-center gap-4 z-10">
          <span className="text-sm text-muted-foreground">
            {selectedMessages.length} mensagem(ns) selecionada(s)
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRedirectDialogOpen(true)}
          >
            Redirecionar Selecionadas
          </Button>
        </div>
      )}

      {/* Lista de mensagens com checkbox */}
      {messages.map((message) => (
        <div key={message.id} className="flex items-start gap-3 p-4">
          <Checkbox
            checked={selectedMessages.includes(message.id)}
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedMessages([...selectedMessages, message.id]);
              } else {
                setSelectedMessages(selectedMessages.filter(id => id !== message.id));
              }
            }}
          />
          <MessageItem message={message} />
        </div>
      ))}

      {/* Dialog para primeira mensagem selecionada */}
      {selectedMessages.length > 0 && (
        <MessageRedirectDialog
          open={redirectDialogOpen}
          onOpenChange={setRedirectDialogOpen}
          messageId={selectedMessages[0]}
          messageContent={messages.find(m => m.id === selectedMessages[0])?.content_text || ''}
          currentTicketId={currentTicket.id}
          currentTicketNumber={currentTicket.ticket_number}
          organizationId={organizationId}
          onSuccess={() => {
            setSelectedMessages([]);
            refetchMessages();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// EXEMPLO 3: Mostrar histórico de redirecionamentos
// ============================================================================

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

function MessageRedirectHistory({ messageId }: { messageId: string }) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [messageId]);

  const loadHistory = async () => {
    try {
      const { data } = await supabase.rpc('get_message_redirect_history', {
        p_message_id: messageId
      });
      setHistory(data || []);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Carregando histórico...</div>;
  if (history.length === 0) return null;

  return (
    <div className="mt-2 p-3 bg-muted rounded-lg space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">
        Histórico de Redirecionamentos
      </p>
      {history.map((item) => (
        <div key={item.redirect_id} className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {item.redirect_type === 'move' ? 'Movida' : 'Copiada'}
            </Badge>
            <span>
              de #{item.source_ticket_number} → #{item.target_ticket_number}
            </span>
          </div>
          {item.redirect_reason && (
            <p className="text-muted-foreground italic">
              "{item.redirect_reason}"
            </p>
          )}
          <p className="text-muted-foreground">
            por {item.redirected_by_name} em{' '}
            {new Date(item.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// EXEMPLO 4: Integração com TicketSidebar existente
// ============================================================================

// Adicione isso ao seu componente TicketSidebar.tsx existente:

import { MessageActions } from '@/components/MessageActions';

// Dentro do render das mensagens, adicione:
<div className="message-item group">
  {/* ... conteúdo existente da mensagem ... */}
  
  {/* Adicione o menu de ações */}
  <MessageActions
    message={message}
    ticketId={ticket.id}
    ticketNumber={ticket.ticket_number}
    organizationId={ticket.organization_id}
    customerId={ticket.customer_id}
    onReply={() => handleReply(message)}
    onSuccess={() => refetchMessages()}
  />
</div>

// ============================================================================
// EXEMPLO 5: Hook customizado para redirecionamento
// ============================================================================

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export function useMessageRedirect() {
  const [loading, setLoading] = useState(false);

  const redirectMessage = async (
    messageId: string,
    targetTicketId: string,
    type: 'move' | 'copy' = 'move',
    reason?: string
  ) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('redirect-message', {
        body: {
          messageId,
          targetTicketId,
          redirectType: type,
          redirectReason: reason,
        },
      });

      if (error) throw error;

      toast.success(
        `Mensagem ${type === 'move' ? 'movida' : 'copiada'} com sucesso!`
      );

      return data;
    } catch (error: any) {
      toast.error(error.message || 'Erro ao redirecionar mensagem');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getHistory = async (messageId: string) => {
    try {
      const { data } = await supabase.rpc('get_message_redirect_history', {
        p_message_id: messageId
      });
      return data || [];
    } catch (error: any) {
      console.error('Erro ao buscar histórico:', error);
      return [];
    }
  };

  return {
    redirectMessage,
    getHistory,
    loading,
  };
}

// Uso do hook:
function MyComponent() {
  const { redirectMessage, loading } = useMessageRedirect();

  const handleRedirect = async () => {
    await redirectMessage(
      messageId,
      targetTicketId,
      'move',
      'Assunto relacionado'
    );
  };

  return (
    <Button onClick={handleRedirect} disabled={loading}>
      Redirecionar
    </Button>
  );
}

// ============================================================================
// EXEMPLO 6: Componente de notificação de mensagem redirecionada
// ============================================================================

function RedirectedMessageBanner({ message }: { message: any }) {
  const [history, setHistory] = useState<any>(null);

  useEffect(() => {
    if (message.is_redirected) {
      loadRedirectInfo();
    }
  }, [message.id]);

  const loadRedirectInfo = async () => {
    const { data } = await supabase
      .from('v_redirected_messages')
      .select('*')
      .eq('message_id', message.id)
      .single();
    
    setHistory(data);
  };

  if (!message.is_redirected || !history) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
      <div className="flex items-center gap-2 text-sm text-blue-800">
        <Forward className="w-4 h-4" />
        <span>
          Esta mensagem foi {history.redirect_type === 'move' ? 'movida' : 'copiada'}{' '}
          do ticket #{history.source_ticket_number}
        </span>
      </div>
      {history.redirect_reason && (
        <p className="text-xs text-blue-600 mt-1 ml-6">
          Motivo: {history.redirect_reason}
        </p>
      )}
    </div>
  );
}

export {
  MessageItem,
  MessagesListWithBulkActions,
  MessageRedirectHistory,
  RedirectedMessageBanner,
  useMessageRedirect,
};
