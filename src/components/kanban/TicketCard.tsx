import { TicketWithCustomer, TicketPriority } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABELS } from "@/types/database";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface TicketCardProps {
  ticket: TicketWithCustomer;
  isDragging?: boolean;
}

const priorityClasses: Record<TicketPriority, string> = {
  low: "bg-priority-low/15 text-priority-low border-priority-low/30",
  medium: "bg-priority-medium/15 text-priority-medium border-priority-medium/30",
  high: "bg-priority-high/15 text-priority-high border-priority-high/30",
};

const TicketCard: React.FC<TicketCardProps> = ({ ticket, isDragging }) => {
  const navigate = useNavigate();
  const t = ticket as any;

  return (
    <div
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      className={cn(
        "cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "shadow-lg ring-2 ring-ring/20",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex flex-col min-w-0">
          <span className="text-base font-bold text-primary font-mono">#{ticket.ticket_number}</span>
          {/* Empresa */}
          <span className="text-sm font-medium text-card-foreground truncate">{ticket.customer_name}</span>
          {/* Contato (se diferente da empresa) */}
          {t.contact_name && t.contact_name !== ticket.customer_name && (
            <span className="text-xs text-muted-foreground truncate">👤 {t.contact_name}</span>
          )}
        </div>

        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0 ml-2", priorityClasses[ticket.priority])}>
          {PRIORITY_LABELS[ticket.priority]}
        </Badge>
      </div>

      {/* ASSUNTO */}
      {t.subject && (
        <p className="text-xs text-muted-foreground truncate mb-1 italic">
          {t.subject}
        </p>
      )}

      {/* CATEGORIA */}
      {t.category_name && (
        <div className="mb-2">
          <span
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: t.category_color + "20",
              color: t.category_color,
              border: `1px solid ${t.category_color}40`,
            }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.category_color }} />
            {t.category_name}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground truncate">
          {t.contact_phone || ticket.customer_phone}
        </span>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
        </span>
      </div>
    </div>
  );
};

export default TicketCard;
