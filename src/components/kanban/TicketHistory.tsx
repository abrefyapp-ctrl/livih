import { useTickets } from '@/hooks/useTickets';
import { TicketStatus, STATUS_LABELS, PRIORITY_LABELS } from '@/types/database';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TicketHistory = () => {
  const { tickets, loading, updateTicketStatus } = useTickets(['closed'] as TicketStatus[]);
  const navigate = useNavigate();

  const handleReopen = async (e: React.MouseEvent, ticketId: string) => {
    e.stopPropagation();
    await updateTicketStatus(ticketId, 'open');
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum ticket fechado.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Telefone</TableHead>
          <TableHead>Prioridade</TableHead>
          <TableHead>Fechado em</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map(t => (
          <TableRow
            key={t.id}
            className="cursor-pointer"
            onClick={() => navigate(`/tickets/${t.id}`)}
          >
            <TableCell className="font-bold font-mono text-primary">#{t.ticket_number}</TableCell>
            <TableCell className="font-medium">{t.customer_name}</TableCell>
            <TableCell>{t.customer_phone}</TableCell>
            <TableCell>
              <Badge variant="outline">{PRIORITY_LABELS[t.priority] || t.priority}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {format(new Date(t.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" onClick={(e) => handleReopen(e, t.id)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reabrir
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default TicketHistory;
