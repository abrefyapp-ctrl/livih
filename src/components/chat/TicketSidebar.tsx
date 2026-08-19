import { useTickets } from "@/hooks/useTickets";
import { TicketWithCustomer, STATUS_LABELS, ACTIVE_STATUSES } from "@/types/database";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import CreateTicketDialog from "./CreateTicketDialog";
import { supabase } from "@/integrations/supabase/client";

interface TicketSidebarProps {
  selectedTicketId?: string;
  onSelectTicket: (ticket: TicketWithCustomer) => void;
  onTicketCreated?: (ticketId: string) => void;
}

const statusDotClasses: Record<string, string> = {
  open: "bg-status-open",
  in_progress: "bg-status-in-progress",
  waiting_customer: "bg-status-waiting",
};

// ─── hook de mensagens não lidas ────────────────────────────────
function useUnreadCounts(selectedTicketId?: string) {
  // { [ticket_id]: count }
  const [unread, setUnread] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Toca som de notificação (beep suave via Web Audio API — sem arquivo externo)
  const playNotificationSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // silencia erros de AudioContext (ex: política de autoplay)
    }
  };

  // Limpa ao selecionar ticket
  useEffect(() => {
    if (!selectedTicketId) return;
    setUnread(prev => {
      if (!prev[selectedTicketId]) return prev;
      const next = { ...prev };
      delete next[selectedTicketId];
      return next;
    });
  }, [selectedTicketId]);

  // Realtime — escuta INSERTs de mensagens de clientes em toda a org
  useEffect(() => {
    const channel = supabase
      .channel("sidebar-unread-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          // só mensagens de clientes geram notificação
        },
        (payload) => {
          const msg = payload.new as any;

          // Ignora mensagens do agente e do ticket aberto no momento
          if (msg.sender_type !== "customer") return;
          if (msg.ticket_id === selectedTicketId) return;

          setUnread(prev => ({
            ...prev,
            [msg.ticket_id]: (prev[msg.ticket_id] || 0) + 1,
          }));

          playNotificationSound();

          // Notificação do navegador (se permitido)
          if (Notification.permission === "granted") {
            new Notification("Nova mensagem", {
              body: msg.content_text?.slice(0, 80) || "Nova mensagem recebida",
              icon: "/favicon.ico",
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedTicketId]);

  // Pede permissão de notificação na montagem
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  return unread;
}
// ────────────────────────────────────────────────────────────────

const TicketSidebar: React.FC<TicketSidebarProps> = ({
  selectedTicketId,
  onSelectTicket,
  onTicketCreated,
}) => {
  const { tickets, loading } = useTickets(ACTIVE_STATUSES);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const unread = useUnreadCounts(selectedTicketId);

  const filtered = useMemo(() => {
    if (!search.trim()) return tickets;
    const s = search.toLowerCase();
    return tickets.filter(
      (t) =>
        t.customer_name?.toLowerCase().includes(s) ||
        t.customer_phone?.includes(s)
    );
  }, [tickets, search]);

  if (loading) {
    return (
      <div className="w-72 border-r border-border bg-muted/20 p-3 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex w-72 flex-col border-r border-border bg-muted/20">
      <div className="border-b border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar ticket..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CreateTicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(ticketId) => onTicketCreated?.(ticketId)}
      />

      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-1.5">
          {filtered.map((ticket) => {
            const count = unread[ticket.id] || 0;
            const hasUnread = count > 0;

            return (
              <button
                key={ticket.id}
                onClick={() => onSelectTicket(ticket)}
                className={cn(
                  "w-full rounded-md px-3 py-2.5 text-left transition-colors",
                  selectedTicketId === ticket.id
                    ? "bg-accent text-accent-foreground"
                    : hasUnread
                    ? "bg-primary/5 hover:bg-primary/10"
                    : "hover:bg-muted",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full flex-shrink-0",
                      statusDotClasses[ticket.status] ?? "bg-muted-foreground"
                    )}
                  />

                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className={cn(
                        "text-sm truncate",
                        hasUnread ? "font-bold" : "font-medium"
                      )}
                    >
                      {ticket.customer_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      #{ticket.ticket_number}
                    </span>
                  </div>

                  {/* Badge de não lidos */}
                  {hasUnread && (
                    <span className="ml-auto shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pl-4">
                  <span className="text-[10px] text-muted-foreground">
                    {STATUS_LABELS[ticket.status]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(ticket.updated_at), {
                      addSuffix: false,
                      locale: ptBR,
                    })}
                  </span>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhum ticket encontrado
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TicketSidebar;
