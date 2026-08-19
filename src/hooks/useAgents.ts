import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AgentStats } from '@/types/database';
import { toast } from '@/hooks/use-toast';
import { FUNCTIONS_URL } from "@/lib/env";

export const useAgents = () => {
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('agents')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setOrganizationId(data.organization_id);
        });
    });
  }, []);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('agent_stats').select('*');
    if (error) {
      toast({ title: 'Erro ao carregar agentes', description: error.message, variant: 'destructive' });
    } else {
      setAgents((data as AgentStats[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const createAgent = async (name: string, email: string, phone_number: string) => {
    if (!organizationId) {
      toast({ title: 'Erro', description: 'Organização não identificada', variant: 'destructive' });
      return false;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    const res = await fetch(
      `${FUNCTIONS_URL}/invite-agent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          email,
          phone_number,
          organization_id: organizationId,
          platform_url: "https://abrefy.com.br",
        }),
      }
    );

    const result = await res.json();

    if (!result.success) {
      toast({ title: 'Erro ao cadastrar agente', description: result.error, variant: 'destructive' });
      return false;
    }

    toast({
      title: 'Agente cadastrado!',
      description: `Convite enviado para ${email}.`,
    });

    await fetchAgents();
    return true;
  };

  const updateAgent = async (id: string, fields: { name?: string; email?: string; phone_number?: string }) => {
    const { error } = await supabase.from('agents').update(fields).eq('id', id);
    if (error) {
      toast({ title: 'Erro ao atualizar agente', description: error.message, variant: 'destructive' });
      return false;
    }
    await fetchAgents();
    return true;
  };

  const deleteAgent = async (id: string) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  const res = await fetch(
    `${FUNCTIONS_URL}/delete-agent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agent_id: id }),
    }
  );

  const result = await res.json();

  if (!result.success) {
    toast({ title: 'Erro ao excluir agente', description: result.error, variant: 'destructive' });
    return false;
  }

  await fetchAgents();
  return true;
};

  return { agents, loading, createAgent, updateAgent, deleteAgent };
};
