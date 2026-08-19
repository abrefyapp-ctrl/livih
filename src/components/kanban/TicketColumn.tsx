import { Droppable, Draggable } from '@hello-pangea/dnd';
import { TicketWithCustomer, TicketStatus, STATUS_LABELS } from '@/types/database';
import TicketCard from './TicketCard';
import { cn } from '@/lib/utils';

interface TicketColumnProps {
  status: TicketStatus;
  tickets: TicketWithCustomer[];
}

const statusColorClasses: Record<string, string> = {
  open:                'border-t-green-500',
  in_analysis:         'border-t-yellow-500',
  in_progress:         'border-t-blue-500',
  waiting_customer:    'border-t-orange-500',
  waiting_third_party: 'border-t-purple-500',
  resolved:            'border-t-gray-500',
  closed:              'border-t-gray-300',
  cancelled:           'border-t-red-500',
};

const statusDotClasses: Record<string, string> = {
  open:                'bg-green-500',
  in_analysis:         'bg-yellow-500',
  in_progress:         'bg-blue-500',
  waiting_customer:    'bg-orange-500',
  waiting_third_party: 'bg-purple-500',
  resolved:            'bg-gray-500',
  closed:              'bg-gray-300',
  cancelled:           'bg-red-500',
};

const TicketColumn: React.FC<TicketColumnProps> = ({ status, tickets }) => {
  return (
    <div className={cn('flex w-80 flex-shrink-0 flex-col rounded-lg border border-border bg-muted/30 border-t-4', statusColorClasses[status])}>
      <div className="flex items-center gap-2 px-4 py-3">
        <span className={cn('h-2.5 w-2.5 rounded-full', statusDotClasses[status])} />
        <h3 className="text-sm font-semibold text-foreground">{STATUS_LABELS[status]}</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {tickets.length}
        </span>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 space-y-2 overflow-y-auto px-3 pb-3 min-h-[200px] transition-colors',
              snapshot.isDraggingOver && 'bg-accent/30'
            )}
          >
            {tickets.map((ticket, index) => (
              <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <TicketCard ticket={ticket} isDragging={snapshot.isDragging} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default TicketColumn;
