// hooks/useReply.ts
// Hook que gerencia o estado de "mensagem selecionada para resposta"

import { useState, useCallback } from "react";
import type { QuotedMessageData } from "@/components/chat/QuotedMessage";

export function useReply() {
  const [replyTo, setReplyTo] = useState<QuotedMessageData | null>(null);

  const startReply = useCallback((msg: QuotedMessageData) => {
    setReplyTo(msg);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  return { replyTo, startReply, cancelReply };
}

// ================================================================
// GUIA DE INTEGRAÇÃO
// ================================================================
//
// 1. MIGRAÇÃO SQL
//    Execute o arquivo 005_add_quoted_message_to_messages.sql
//    no painel do Supabase (SQL Editor).
//
// ----------------------------------------------------------------
// 2. NO COMPONENTE DE CONVERSA (ex: TicketChat.tsx)
// ----------------------------------------------------------------
//
//   import { useReply } from "@/hooks/useReply";
//   import { ReplyPreview, QuotedBubble } from "@/components/QuotedMessage";
//   import { ImageModal } from "@/components/ImageModal";
//
//   const { replyTo, startReply, cancelReply } = useReply();
//
// ----------------------------------------------------------------
// 3. EM CADA BOLHA DE MENSAGEM — botão de responder + citação
// ----------------------------------------------------------------
//
//   <div
//     className="group relative"
//     onMouseEnter={() => setHoveredId(msg.id)}  // controle opcional de hover
//   >
//     {/* Bolha citada (se a mensagem já tem uma citação) */}
//     {msg.quoted && (
//       <QuotedBubble
//         quoted={msg.quoted}
//         isAgent={msg.sender_type === "agent"}
//       />
//     )}
//
//     {/* Texto/imagem normal da mensagem */}
//     {msg.content_type === "imageMessage" ? (
//       <ImageModal
//         src={msg.content_url}
//         alt={msg.content_text}
//         fileName={msg.file_name}
//       />
//     ) : (
//       <p>{msg.content_text}</p>
//     )}
//
//     {/* Botão "Responder" — visível no hover */}
//     <button
//       className="absolute -right-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity"
//       onClick={() => startReply({
//         id: msg.id,
//         content_text: msg.content_text,
//         content_type: msg.content_type,
//         content_url: msg.content_url,
//         sender_type: msg.sender_type,
//         sender_name: msg.sender_name,
//       })}
//       title="Responder"
//     >
//       <Reply size={16} />
//     </button>
//   </div>
//
// ----------------------------------------------------------------
// 4. ACIMA DO INPUT — prévia da mensagem citada
// ----------------------------------------------------------------
//
//   {replyTo && (
//     <ReplyPreview quoted={replyTo} onCancel={cancelReply} />
//   )}
//   <textarea ... />   {/* seu input existente */}
//
// ----------------------------------------------------------------
// 5. AO ENVIAR — inclua quoted_message_id no insert
// ----------------------------------------------------------------
//
//   const handleSend = async () => {
//     await supabase.from("messages").insert({
//       ticket_id: ticketId,
//       sender_type: "agent",
//       content_text: text,
//       quoted_message_id: replyTo?.id ?? null,   // <-- AQUI
//       // ... demais campos
//     });
//     cancelReply();   // limpa a citação após enviar
//     setText("");
//   };
//
// ----------------------------------------------------------------
// 6. AO BUSCAR MENSAGENS — faça join com a mensagem citada
// ----------------------------------------------------------------
//
//   const { data: messages } = await supabase
//     .from("messages")
//     .select(`
//       *,
//       quoted:quoted_message_id (
//         id,
//         content_text,
//         content_type,
//         content_url,
//         sender_type,
//         sender_name
//       )
//     `)
//     .eq("ticket_id", ticketId)
//     .order("created_at", { ascending: true });
//
// ================================================================
