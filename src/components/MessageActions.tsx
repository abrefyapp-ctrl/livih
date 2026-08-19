// MessageActions.tsx
// Menu de ações para mensagens individuais

import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { 
  MoreVertical, 
  Copy, 
  Move, 
  Reply, 
  Trash2,
  Forward,
  Star,
  Archive
} from 'lucide-react';
import { MessageRedirectDialog } from './MessageRedirectDialog';

interface Message {
  id: string;
  content_text: string;
  sender_type: 'customer' | 'agent' | 'system';
  created_at: string;
  is_redirected?: boolean;
}

interface MessageActionsProps {
  message: Message;
  ticketId: string;
  ticketNumber: number;
  organizationId: string;
  customerId?: string;
  onReply?: () => void;
  onDelete?: () => void;
  onStar?: () => void;
  onSuccess?: () => void;
}

export function MessageActions({
  message,
  ticketId,
  ticketNumber,
  organizationId,
  customerId,
  onReply,
  onDelete,
  onStar,
  onSuccess,
}: MessageActionsProps) {
  const [redirectDialogOpen, setRedirectDialogOpen] = useState(false);
  const [redirectType, setRedirectType] = useState<'move' | 'copy'>('move');

  const handleOpenRedirectDialog = (type: 'move' | 'copy') => {
    setRedirectType(type);
    setRedirectDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Ações da mensagem</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {onReply && (
            <>
              <DropdownMenuItem onClick={onReply}>
                <Reply className="mr-2 h-4 w-4" />
                Responder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem onClick={() => handleOpenRedirectDialog('copy')}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar para outro ticket
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handleOpenRedirectDialog('move')}>
            <Move className="mr-2 h-4 w-4" />
            Mover para outro ticket
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {onStar && (
            <DropdownMenuItem onClick={onStar}>
              <Star className="mr-2 h-4 w-4" />
              Destacar mensagem
            </DropdownMenuItem>
          )}

          {message.is_redirected && (
            <DropdownMenuItem disabled>
              <Forward className="mr-2 h-4 w-4" />
              Mensagem redirecionada
            </DropdownMenuItem>
          )}

          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <MessageRedirectDialog
        open={redirectDialogOpen}
        onOpenChange={setRedirectDialogOpen}
        messageId={message.id}
        messageContent={message.content_text}
        currentTicketId={ticketId}
        currentTicketNumber={ticketNumber}
        organizationId={organizationId}
        customerId={customerId}
        onSuccess={onSuccess}
      />
    </>
  );
}

// Componente simplificado para usar diretamente em mensagens
export function QuickRedirectButton({
  messageId,
  messageContent,
  ticketId,
  ticketNumber,
  organizationId,
  customerId,
  type = 'move',
  onSuccess,
}: {
  messageId: string;
  messageContent: string;
  ticketId: string;
  ticketNumber: number;
  organizationId: string;
  customerId?: string;
  type?: 'move' | 'copy';
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        {type === 'move' ? (
          <>
            <Move className="h-4 w-4" />
            Mover
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            Copiar
          </>
        )}
      </Button>

      <MessageRedirectDialog
        open={open}
        onOpenChange={setOpen}
        messageId={messageId}
        messageContent={messageContent}
        currentTicketId={ticketId}
        currentTicketNumber={ticketNumber}
        organizationId={organizationId}
        customerId={customerId}
        onSuccess={onSuccess}
      />
    </>
  );
}
