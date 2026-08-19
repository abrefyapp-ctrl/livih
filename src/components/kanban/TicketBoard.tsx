import { useState, useMemo } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useTickets } from '@/hooks/useTickets';
import { useAgents } from '@/hooks/useAgents';
import { BOARD_STATUSES, TicketStatus, TicketWithCustomer } from '@/types/database';
import TicketColumn from './TicketColumn';
import FiltersBar from './FiltersBar';
import { Skeleton } from '@/components/ui/skeleton';

const TicketBoard = () => {
  const { tickets, loading, updateTicketStatus } = useTickets(BOARD_STATUSES);
  const { agents } = useAgents();
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (selectedAgent !== 'all' && t.assigned_agent_id !== selectedAgent) return false;
      if (selectedPriority !== 'all' && t.priority !== selectedPriority) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!t.customer_name?.toLowerCase().includes(s) && !t.customer_phone?.includes(s)) return false;
      }
      return true;
    });
  }, [tickets, search, selectedAgent, selectedPriority]);

  const ticketsByStatus = useMemo(() => {
    const map: Record<string, TicketWithCustomer[]> = {};
    BOARD_STATUSES.forEach(s => (map[s] = []));
    filteredTickets.forEach(t => {
      if (map[t.status]) map[t.status].push(t);
    });
    return map;
  }, [filteredTickets]);
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as TicketStatus;
    const ticketId = result.draggableId;
    if (result.source.droppableId === newStatus) return;
    updateTicketStatus(ticketId, newStatus);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="flex gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-80 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FiltersBar
        search={search}
        onSearchChange={setSearch}
        agents={agents}
        selectedAgent={selectedAgent}
        onAgentChange={setSelectedAgent}
        selectedPriority={selectedPriority}
        onPriorityChange={setSelectedPriority}
      />

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_STATUSES.map(status => (
            <TicketColumn
              key={status}
              status={status}
              tickets={ticketsByStatus[status] || []}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

export default TicketBoard;
