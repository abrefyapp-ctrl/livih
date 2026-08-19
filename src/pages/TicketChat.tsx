import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/hooks/useMessages";
import { TicketWithCustomer, STATUS_LABELS, STATUS_COLORS } from "@/types/database";
import TicketSidebar from "@/components/chat/TicketSidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import MessageInput from "@/components/chat/MessageInput";
import TicketDetailPanel from "@/components/chat/TicketDetailPanel";
import CreateTicketDialog from "@/components/chat/CreateTicketDialog";
import InternalNotes from "@/components/chat/InternalNotes";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Info, MessageSquare, Lock } from "lucide-react";
import { useReply } from "@/hooks/useReply";
import { cn } from "@/lib/utils";
import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/lib/env";

const TicketChat = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketWithCustomer | null>(null);
  const [ticketLoading, setTicketLoading] = useState(true);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [mode, setMode] = useState<"public" | "internal">("public");
  const [allAgents, setAllAgents] = useState<{ id: string; name: string; email: string }[]>([]);

  const { messages, loading: messagesLoading } = useMessages(id);
  const { replyTo, startReply, cancelReply } = useReply();

  useEffect(() => {
    const fetchCurrentAgent = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: agent } = await supabase
        .from("agents")
        .select("id, name, email")
        .eq("email", user.email)
        .maybeSingle();

      if (agent?.id) setCurrentAgentId(agent.id);
    };

    const fetchAllAgents = async () => {
      const { data } = await supabase.from("agents").select("id, name, email");
      if (data) setAllAgents(data);
    };

    fetchCurrentAgent();
    fetchAllAgents();
  }, []);

  useEffect(() => {
    if (!id) return;

    const fetchTicket = async () => {
      setTicketLoading(true);
      const { data } = await supabase
        .from("tickets_with_customer")
        .select("*")
        .eq("id", id)
        .single();

      setTicket(data as TicketWithCustomer | null);
      setTicketLoading(false);
    };

    fetchTicket();

    const channel = supabase
      .channel(`ticket-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${id}` },
        fetchTicket
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleSelectTicket = (t: TicketWithCustomer) => {
    navigate(`/tickets/${t.id}`);
  };

  const handleCreateNewTicket = () => {
    setCreateDialogOpen(true);
  };

  const handleSendMessage = async (
    ticketId: string,
    message: string,
    file?: File | null,
    agentId?: string | null,
    quotedMessageId?: string | null
  ) => {
    try {
      let file_url = null;
      let file_type = null;

      if (file) {
        const fileName = `${Date.now()}_${file.name}`;

        const { error } = await supabase.storage
          .from("uploads")
          .upload(fileName, file);

        if (error) {
          console.error("Erro upload:", error);
          throw error;
        }

        const { data } = supabase.storage
          .from("uploads")
          .getPublicUrl(fileName);

        file_url = data.publicUrl;

        file_type = file.type.startsWith("image/")
          ? "image"
          : "document";

        console.log("[UPLOAD OK]", file_url);
      }

      const res = await fetch(
        `${FUNCTIONS_URL}/send-reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            ticket_id: ticketId,
            message,
            file_url,
            file_type,
            sender_agent_id: agentId ?? currentAgentId,
            quoted_message_id: quotedMessageId ?? null,
          }),
        }
      );

      const result = await res.json();

      if (!result?.success) {
        toast({
          title: "Erro ao enviar",
          description: result?.error || "Falha no envio",
          variant: "destructive",
        });
      }

      console.log("[SEND RESULT]", result);

    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
    }
  };

  const lastMessage = messages[messages.length - 1];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen max-w-full">
      <div className={id ? "hidden md:flex" : "flex w-full md:w-auto"}>
        <TicketSidebar
          selectedTicketId={id}
          onSelectTicket={handleSelectTicket}
          onTicketCreated={(ticketId) => navigate(`/tickets/${ticketId}`)}
        />
      </div>

      {id && ticket ? (
        <div className={`flex flex-1 min-w-0 ${showDetailPanel ? "hidden md:flex" : "flex"} flex-col max-w-full`}>
          <div className="flex h-16 items-center justify-between border-b border-border px-4 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <button
                onClick={() => navigate("/tickets")}
                className="md:hidden mr-1 text-muted-foreground hover:text-foreground shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-primary font-mono">
                    #{ticket.ticket_number}
                  </span>
                  <h2 className="text-sm font-semibold truncate">
                    {ticket.customer_name}
                  </h2>
                  <Badge className={STATUS_COLORS[ticket.status] ?? "bg-gray-400"}>
                    {STATUS_LABELS[ticket.status] ?? ticket.status}
                  </Badge>
                </div>

                {(ticket as any).subject && (
                  <span className="text-xs font-medium text-foreground/80 truncate mt-0.5">
                    {(ticket as any).subject}
                  </span>
                )}

                <span className="text-xs text-muted-foreground">
                  {ticket.customer_phone}
                </span>

                {lastMessage && (
                  <span className="text-[10px] text-muted-foreground mt-1">
                    Última atividade{" "}
                    {formatDistanceToNow(new Date(lastMessage.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowDetailPanel(true)}
                className="md:hidden text-muted-foreground hover:text-foreground"
              >
                <Info className="h-5 w-5" />
              </button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleCreateNewTicket}
                className="hidden md:flex"
              >
                Novo ticket
              </Button>
            </div>
          </div>

          <div className="flex border-b border-border">
            <button
              onClick={() => setMode("public")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors",
                mode === "public"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Mensagens
            </button>
            <button
              onClick={() => setMode("internal")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors",
                mode === "internal"
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Lock className="h-3.5 w-3.5" />
              Notas Internas
            </button>
          </div>

          {mode === "public" ? (
            <>
              <ChatWindow 
                messages={messages} 
                loading={messagesLoading}
                onReply={startReply}
                ticketId={id}
                ticketNumber={ticket.ticket_number}
                organizationId={(ticket as any).organization_id}
                customerId={ticket.customer_id}
                onMessagesUpdate={() => window.location.reload()}
              />
              <MessageInput
                ticketId={id}
                ticketStatus={ticket.status as any}
                agentId={currentAgentId}
                onSend={handleSendMessage}
                replyTo={replyTo}
                onCancelReply={cancelReply}
              />
            </>
          ) : (
            <InternalNotes
              ticketId={id}
              currentAgentId={currentAgentId}
              agents={allAgents}
            />
          )}
        </div>
      ) : ticketLoading ? (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="space-y-3 w-64">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Selecione um ticket para iniciar o atendimento
          </p>
        </div>
      )}

      {id && ticket && (
        <div className={`${showDetailPanel ? "flex" : "hidden"} md:flex flex-col`}>
          <div className="flex h-16 items-center border-b border-border px-4 md:hidden">
            <button
              onClick={() => setShowDetailPanel(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="ml-3 text-sm font-medium">
              Detalhes do Ticket
            </span>
          </div>

          <TicketDetailPanel ticket={ticket} />
        </div>
      )}
      <CreateTicketDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultContactId={(ticket as any)?.contact_id}
        onCreated={(ticketId) => navigate(`/tickets/${ticketId}`)}
      />
    </div>
  );
};

export default TicketChat;
