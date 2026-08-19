// redirect_message_function.ts
// Supabase Edge Function para redirecionamento de mensagens entre tickets
// Deploy: supabase functions deploy redirect-message

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Autenticação do usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Autorização necessária" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ============================================================================
    // REDIRECT MESSAGE - Mover ou copiar mensagem
    // ============================================================================
    if (req.method === "POST" && action === "redirect") {
      const body = await req.json();
      const {
        messageId,
        targetTicketId,
        redirectType = "move",
        redirectReason,
      } = body;

      // Validações
      if (!messageId || !targetTicketId) {
        return new Response(
          JSON.stringify({ error: "messageId e targetTicketId são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!["move", "copy"].includes(redirectType)) {
        return new Response(
          JSON.stringify({ error: 'redirectType deve ser "move" ou "copy"' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Obter informações do usuário autenticado
      const { data: userData, error: userError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );

      if (userError || !userData.user) {
        return new Response(
          JSON.stringify({ error: "Usuário não autenticado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar agente relacionado ao usuário
      const { data: agent } = await supabase
        .from("agents")
        .select("id")
        .eq("user_id", userData.user.id)
        .single();

      // Executar redirecionamento
      const { data, error } = await supabase.rpc("redirect_message_to_ticket", {
        p_message_id: messageId,
        p_target_ticket_id: targetTicketId,
        p_redirect_type: redirectType,
        p_redirected_by: agent?.id || null,
        p_redirect_reason: redirectReason || null,
      });

      if (error) {
        console.error("[redirect] Erro:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================================
    // GET REDIRECT HISTORY - Buscar histórico de redirecionamentos
    // ============================================================================
    if (req.method === "GET" && action === "history") {
      const messageId = url.searchParams.get("messageId");

      if (!messageId) {
        return new Response(
          JSON.stringify({ error: "messageId é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase.rpc("get_message_redirect_history", {
        p_message_id: messageId,
      });

      if (error) {
        console.error("[redirect] Erro ao buscar histórico:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ history: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================================
    // SEARCH TICKETS - Buscar tickets para redirecionamento
    // ============================================================================
    if (req.method === "GET" && action === "search-tickets") {
      const organizationId = url.searchParams.get("organizationId");
      const currentTicketId = url.searchParams.get("currentTicketId");
      const customerId = url.searchParams.get("customerId");
      const searchTerm = url.searchParams.get("q");

      if (!organizationId || !currentTicketId) {
        return new Response(
          JSON.stringify({ error: "organizationId e currentTicketId são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let query = supabase
        .from("tickets")
        .select(`
          id,
          ticket_number,
          subject,
          status,
          created_at,
          updated_at,
          customer:customers(name, email),
          contact:contacts(name, phone),
          category:categories(name)
        `)
        .eq("organization_id", organizationId)
        .neq("id", currentTicketId)
        .in("status", ["open", "in_progress", "pending"]);

      // Filtrar por cliente se fornecido
      if (customerId) {
        query = query.eq("customer_id", customerId);
      }

      // Aplicar busca se fornecida
      if (searchTerm) {
        const term = `%${searchTerm}%`;
        // Tentar converter para número para buscar por ticket_number
        const ticketNumber = parseInt(searchTerm);
        if (!isNaN(ticketNumber)) {
          query = query.or(`ticket_number.eq.${ticketNumber},subject.ilike.${term}`);
        } else {
          query = query.ilike("subject", term);
        }
      }

      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("[redirect] Erro ao buscar tickets:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ tickets: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================================
    // GET REDIRECTED MESSAGES - Buscar mensagens redirecionadas de um ticket
    // ============================================================================
    if (req.method === "GET" && action === "redirected-messages") {
      const ticketId = url.searchParams.get("ticketId");

      if (!ticketId) {
        return new Response(
          JSON.stringify({ error: "ticketId é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("v_redirected_messages")
        .select("*")
        .or(`ticket_id.eq.${ticketId},source_ticket_id.eq.${ticketId}`)
        .order("redirected_at", { ascending: false });

      if (error) {
        console.error("[redirect] Erro ao buscar mensagens:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ messages: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action não reconhecida
    return new Response(
      JSON.stringify({ error: "Action não reconhecida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("❌ ERRO:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
