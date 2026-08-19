import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageWithSender } from '@/types/database';
import { toast } from '@/hooks/use-toast';

// Hidrata o campo `quoted` em cada mensagem que tem quoted_message_id
async function hydrateQuoted(msgs: MessageWithSender[]): Promise<MessageWithSender[]> {
  const ids = [...new Set(
    (msgs as any[])
      .map(m => m.quoted_message_id)
      .filter(Boolean)
  )];

  if (ids.length === 0) return msgs;

  const { data: quotedMsgs } = await supabase
    .from('messages')
    .select('id, content_text, content_type, content_url, sender_type, sender_name')
    .in('id', ids);

  if (!quotedMsgs) return msgs;

  const byId = Object.fromEntries(quotedMsgs.map(q => [q.id, q]));

  return (msgs as any[]).map(m =>
    m.quoted_message_id && byId[m.quoted_message_id]
      ? { ...m, quoted: byId[m.quoted_message_id] }
      : m
  ) as MessageWithSender[];
}

export const useMessages = (ticketId: string | undefined) => {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('messages_with_sender')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      toast({ title: 'Erro ao carregar mensagens', description: error.message, variant: 'destructive' });
    } else {
      const hydrated = await hydrateQuoted((data as MessageWithSender[]) || []);
      setMessages(hydrated);
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    fetchMessages();

    const channel = supabase
      .channel(`messages-${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `ticket_id=eq.${ticketId}` },
        async (payload) => {
          // Rebusca a mensagem completa (com sender_name) e hidrata o quoted
          const { data } = await supabase
            .from('messages_with_sender')
            .select('*')
            .eq('id', (payload.new as any).id)
            .maybeSingle();

          if (!data) return;

          const [hydrated] = await hydrateQuoted([data as MessageWithSender]);

          setMessages(prev => {
            if (prev.some(m => m.id === hydrated.id)) {
              return prev.map(m => m.id === hydrated.id ? { ...m, ...hydrated } : m);
            }
            return [...prev, hydrated];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `ticket_id=eq.${ticketId}` },
        async (payload) => {
          const { data } = await supabase
            .from('messages_with_sender')
            .select('*')
            .eq('id', (payload.new as any).id)
            .maybeSingle();

          if (!data) return;

          const [hydrated] = await hydrateQuoted([data as MessageWithSender]);
          setMessages(prev => prev.map(m => m.id === hydrated.id ? { ...m, ...hydrated } : m));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, fetchMessages]);

  return { messages, loading };
};
