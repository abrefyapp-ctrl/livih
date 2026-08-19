import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TicketWithCustomer, TicketStatus } from "@/types/database";
import { toast } from "@/hooks/use-toast";

const byUpdatedAtDesc = (a: TicketWithCustomer, b: TicketWithCustomer) =>
  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();

export const useTickets = (filterStatuses?: TicketStatus[]) => {
  const [tickets, setTickets] = useState<TicketWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const statusFilter = filterStatuses || null;

  const fetchTickets = useCallback(async () => {
    setLoading(true);

    let query = supabase.from("tickets_with_customer").select("*").order("updated_at", { ascending: false });

    if (statusFilter) {
      query = query.in("status", statusFilter as unknown as string[]);
    }

    const { data, error } = await query;

    if (error) {
      toast({
        title: "Erro ao carregar tickets",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setTickets((data as TicketWithCustomer[]) || []);
    }

    setLoading(false);
  }, [statusFilter?.join(",")]);

  useEffect(() => {
    fetchTickets();

    const channelName = `tickets-realtime-${statusFilter ? statusFilter.join("-") : "all"}`;

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, (payload) => {
        const event = payload.eventType;

        // 🔥 NOVO TICKET
        if (event === "INSERT") {
          const newTicket = payload.new as any;

          toast({
            title: "🆕 Novo ticket recebido",
            description: `Cliente entrou em contato`,
          });
        }

        if (event === "DELETE") {
          setTickets((prev) => prev.filter((t) => t.id !== (payload.old as any).id));
          return;
        }

        const ticketId = (payload.new as any).id;
        const newStatus = (payload.new as any).status as TicketStatus;

        if (statusFilter && !statusFilter.includes(newStatus)) {
          setTickets((prev) => prev.filter((t) => t.id !== ticketId));
          return;
        }

        supabase
          .from("tickets_with_customer")
          .select("*")
          .eq("id", ticketId)
          .single()
          .then(({ data }) => {
            if (!data) return;

            const ticket = data as TicketWithCustomer;

            setTickets((prev) => {
              const filtered = prev.filter((t) => t.id !== ticketId);
              return [...filtered, ticket].sort(byUpdatedAtDesc);
            });

            // 🔥 NOTIFICAÇÃO MELHORADA
            if (event === "INSERT") {
              toast({
                title: "📩 Novo atendimento",
                description: ticket.customer_name || "Novo cliente",
              });
            }
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTickets]);

  const updateTicketStatus = async (ticketId: string, status: TicketStatus) => {
    const { error } = await supabase
      .from("tickets")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId);

    if (error) {
      toast({
        title: "Erro ao atualizar ticket",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
  };

  return { tickets, loading, updateTicketStatus, refetch: fetchTickets };
};
