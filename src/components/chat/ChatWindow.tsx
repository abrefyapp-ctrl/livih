import { useEffect, useRef, useState } from "react";
import { MessageWithSender } from "@/types/database";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCheck, AlertCircle, Clock, FileText, Download, TicketPlus, Reply } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageModal } from "@/components/chat/ImageModal";
import { QuotedBubble, QuotedMessageData } from "@/components/chat/QuotedMessage";
import { MessageActions } from "@/components/MessageActions";
import { FUNCTIONS_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";


interface ChatWindowProps {
  messages: MessageWithSender[];
  loading: boolean;
  onReply?: (msg: QuotedMessageData) => void;
  ticketId: string;
  ticketNumber: number;
  organizationId: string;
  customerId?: string;
  onMessagesUpdate?: () => void;
}

const statusIcons = {
  pending: <Clock className="h-3 w-3 text-muted-foreground" />,
  sent: <CheckCheck className="h-3 w-3 text-green-500" />,
  failed: <AlertCircle className="h-3 w-3 text-destructive" />,
};

function MessageContent({ msg, isAgent }: { msg: MessageWithSender; isAgent: boolean }) {
  const { content_type, content_url, content_caption, file_name } = msg as any;
  const content_text = (msg as any).content_text;

  if (content_type === "imageMessage" && content_url) {
    return (
      <div className="space-y-1">
        <ImageModal
          src={content_url}
          alt={content_caption || "imagem"}
          fileName={file_name}
          trigger={
            <div className="relative group/img cursor-pointer">
              <img
                src={content_url}
                alt={content_caption || "imagem"}
                className="max-w-full rounded-xl object-cover"
                style={{ maxHeight: 260 }}
              />
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const response = await fetch(content_url);
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = file_name || "imagem.jpg";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                }}
                className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          }
        />
        {content_caption && (
          <p className="text-sm whitespace-pre-wrap break-words">{content_caption}</p>
        )}
      </div>
    );
  }

  if (content_type === "videoMessage" && content_url) {
    return (
      <div className="space-y-1">
        <video controls src={content_url} className="max-w-full rounded-xl" style={{ maxHeight: 260 }} />
        {content_caption && <p className="text-sm whitespace-pre-wrap break-words">{content_caption}</p>}
      </div>
    );
  }

  if (content_type === "audioMessage" && content_url) {
    return (
      <div className="space-y-2">
        <audio controls src={content_url} className="w-full max-w-[280px]" />
        {content_text && (
          <div
            className={cn(
              "text-xs italic px-1 opacity-80",
              isAgent ? "text-primary-foreground" : "text-muted-foreground",
            )}
          >
            🎙️ {content_text}
          </div>
        )}
      </div>
    );
  }

  if (content_type === "documentMessage" && content_url) {
    return (
      <div
        onClick={() => window.open(content_url, "_blank")}
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-opacity hover:opacity-80",
          isAgent ? "bg-primary-foreground/10" : "bg-background/50",
        )}
      >
        <FileText className="h-5 w-5 shrink-0" />
        <span className="text-sm truncate max-w-[180px]">{file_name || "Documento"}</span>
        <Download className="h-4 w-4 shrink-0 ml-auto" />
      </div>
    );
  }

  return <p className="text-sm whitespace-pre-wrap break-words">{content_text}</p>;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  messages, 
  loading, 
  onReply,
  ticketId,
  ticketNumber,
  organizationId,
  customerId,
  onMessagesUpdate,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const moveToNewTicket = async (msg: MessageWithSender) => {
    if (movingId) return;
    setMovingId(msg.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/move-to-new-ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ message_id: msg.id }),
      });
      const result = await res.json();
      if (result?.success) {
        alert(`✅ Novo ticket #${result.new_ticket_number} criado com sucesso!`);
      } else {
        alert("❌ Erro ao criar novo ticket: " + (result?.error || "desconhecido"));
      }
    } catch (err) {
      alert("❌ Erro ao criar novo ticket.");
    } finally {
      setMovingId(null);
    }
  };

  // Auto-scroll DESABILITADO para evitar problema de scroll no meio
  // useEffect(() => {
  //   if (messages.length > 0 && !loading) {
  //     setTimeout(() => {
  //       bottomRef.current?.scrollIntoView({ behavior: "auto" });
  //     }, 100);
  //   }
  // }, [messages.length]);

  const retryMessage = async (msg: MessageWithSender) => {
    try {
      const m = msg as any;
      let file_url = null;
      let file_type = null;
      const message = m.content_text;

      if (m.content_url) {
        file_url = m.content_url;
        if (m.content_type === "imageMessage")    file_type = "image";
        else if (m.content_type === "documentMessage") file_type = "document";
        else if (m.content_type === "videoMessage")    file_type = "video";
        else if (m.content_type === "audioMessage")    file_type = "audio";
      }

      const res = await fetch(
        `${FUNCTIONS_URL}/send-reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ ticket_id: msg.ticket_id, message, file_url, file_type }),
        }
      );

      const result = await res.json();
      if (!result?.success) console.error("Retry falhou:", result);
    } catch (err) {
      console.error("Retry falhou:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
            <Skeleton className="h-12 w-64 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Nenhuma mensagem neste ticket</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className="space-y-3 p-4" style={{ paddingBottom: '2rem' }}>
        {messages.map((msg) => {
            const isAgent = msg.sender_type === "agent";
            const isMoving = movingId === msg.id;
            const m = msg as any;
            const quoted: QuotedMessageData | null = m.quoted ?? null;

            return (
              <div
                key={msg.id}
                className={cn("flex items-end gap-1 group", isAgent ? "justify-end" : "justify-start")}
              >
                {/* Botão "Mover para novo ticket" */}
                {!isAgent && (
                  <button
                    onClick={() => moveToNewTicket(msg)}
                    disabled={!!movingId}
                    title="Mover para novo ticket"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mb-1 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    {isMoving
                      ? <Clock className="h-3.5 w-3.5 animate-spin" />
                      : <TicketPlus className="h-3.5 w-3.5" />
                    }
                  </button>
                )}

                {/* Bolha da mensagem */}
                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm",
                    isAgent
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md",
                  )}
                >
                  {quoted && (
                    <QuotedBubble quoted={quoted} isAgent={isAgent} />
                  )}

                  <MessageContent msg={msg} isAgent={isAgent} />

                  <div className={cn("mt-1 flex items-center gap-1", isAgent ? "justify-end" : "justify-start")}>
                    <span className={cn("text-[10px]", isAgent ? "text-primary-foreground/60" : "text-muted-foreground")}>
                      {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
                    </span>
                    {isAgent && (
                      <>
                        {statusIcons[msg.status]}
                        {msg.status === "failed" && (
                          <button
                            onClick={() => retryMessage(msg)}
                            className="ml-1 text-[10px] text-red-400 hover:underline"
                          >
                            tentar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Botão "Responder" */}
                {onReply && (
                  <button
                    onClick={() =>
                      onReply({
                        id: msg.id,
                        content_text: m.content_text,
                        content_type: m.content_type,
                        content_url: m.content_url ?? null,
                        sender_type: msg.sender_type as "customer" | "agent",
                        sender_name: m.sender_name ?? null,
                      })
                    }
                    title="Responder"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mb-1 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Menu de Redirecionamento */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mb-1">
                  <MessageActions
                    message={{
                      id: msg.id,
                      content_text: m.content_text,
                      sender_type: msg.sender_type as 'customer' | 'agent' | 'system',
                      created_at: msg.created_at,
                      is_redirected: m.is_redirected,
                    }}
                    ticketId={ticketId}
                    ticketNumber={ticketNumber}
                    organizationId={organizationId}
                    customerId={customerId}
                    onSuccess={onMessagesUpdate}
                  />
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>
      </div>
  );
};

export default ChatWindow;
