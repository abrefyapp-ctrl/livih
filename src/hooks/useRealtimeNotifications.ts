import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useRealtimeNotifications() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    console.log("[notifications] Iniciando listener...");

    const channel = supabase
      .channel("global-new-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "sender_type=eq.customer",
        },
        async (payload) => {
          console.log("[notifications] Nova mensagem recebida:", payload);

          const msg = payload.new as any;

          const { data: ticket } = await supabase
            .from("tickets")
            .select("id, customers(name, phone_number)")
            .eq("id", msg.ticket_id)
            .single();

          const customer = ticket?.customers as any;
          const senderName = customer?.name || customer?.phone_number || "Cliente";

          const messagePreview =
            msg.content_text ||
            (msg.content_type === "imageMessage" ? "📷 Imagem" : null) ||
            (msg.content_type === "audioMessage" ? "🎵 Áudio" : null) ||
            (msg.content_type === "videoMessage" ? "🎥 Vídeo" : null) ||
            (msg.content_type === "documentMessage" ? "📄 Documento" : null) ||
            "Nova mensagem";

          toast(senderName, {
            description: messagePreview,
            duration: 6000,
            action: {
              label: "Ver ticket",
              onClick: () => {
                window.location.href = `/tickets/${msg.ticket_id}`;
              },
            },
          });

          if (
            "Notification" in window &&
            Notification.permission === "granted" &&
            document.visibilityState === "hidden"
          ) {
            const notification = new Notification(`💬 ${senderName}`, {
              body: messagePreview,
              icon: "/favicon.ico",
            });

            notification.onclick = () => {
              window.focus();
              window.location.href = `/tickets/${msg.ticket_id}`;
            };
          }

          queryClient.invalidateQueries({ queryKey: ["tickets"] });
          queryClient.invalidateQueries({ queryKey: ["messages", msg.ticket_id] });
        }
      )
      .subscribe((status) => {
        console.log("[notifications] Status do canal:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
