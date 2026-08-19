import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/types/database';
import { toast } from '@/hooks/use-toast';

export const useCustomers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) {
      toast({ title: 'Erro ao carregar clientes', description: error.message, variant: 'destructive' });
    } else {
      setCustomers((data as Customer[]) || []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const createCustomer = async (name: string, phone_number: string, email?: string, company?: string) => {
    if (!organizationId) {
      toast({ title: 'Erro', description: 'Organização não identificada', variant: 'destructive' });
      return false;
    }

    // 1. Cria o cliente (empresa)
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        name,
        phone_number,
        email: email || null,
        company: company || null,
        organization_id: organizationId,
      })
      .select('id')
      .single();

    if (error) {
      toast({ title: 'Erro ao criar cliente', description: error.message, variant: 'destructive' });
      return false;
    }

    // 2. Cria contato principal automaticamente
    const { error: contactError } = await supabase
      .from('customer_contacts')
      .insert({
        customer_id: customer.id,
        organization_id: organizationId,
        name,
        phone_number,
        role: 'Principal',
      });

    if (contactError) {
      console.error('[createCustomer] Erro ao criar contato principal:', contactError.message);
    }

    await fetchCustomers();
    return true;
  };

  const updateCustomer = async (id: string, fields: { name?: string; phone_number?: string; email?: string; company?: string }) => {
    const { error } = await supabase.from('customers').update(fields).eq('id', id);
    if (error) {
      toast({ title: 'Erro ao atualizar cliente', description: error.message, variant: 'destructive' });
      return false;
    }
    await fetchCustomers();
    return true;
  };

  const deleteCustomer = async (id: string) => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir cliente', description: error.message, variant: 'destructive' });
      return false;
    }
    await fetchCustomers();
    return true;
  };

  return { customers, loading, search, setSearch, createCustomer, updateCustomer, deleteCustomer };
};
