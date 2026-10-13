-- Prospecção ativa: o vendedor começa a conversa pelo Livih com alguém da agenda do celular dele (ou com um
-- número digitado). A agenda vem do WAHA pela Edge Function; aqui só entra telefone e nome.
--
-- O contato é da empresa (único por telefone): se já existe e é da carteira de outro vendedor, a pessoa não
-- vê e o Livih recusa, em vez de abrir uma segunda frente com o mesmo cliente. Contato novo entra na carteira
-- de quem prospectou. A conversa já nasce "em atendimento" com quem iniciou: o agente não responde por cima.
-- Na API oficial a primeira mensagem tem que ser modelo: a conversa é criada sem texto e o modelo sai pela
-- tela da conversa (enviar_modelo).

create function public.iniciar_conversa(p_canal uuid, p_telefone text, p_nome text default null, p_texto text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_canal public.canais;
  v_contato uuid;
  v_conversa uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
begin
  select * into v_canal from public.canais where id = p_canal and ativo;
  if v_canal.id is null or not public.pode_ver_canal(p_canal) then
    raise exception 'número não encontrado';
  end if;
  if not exists (select 1 from public.organizacoes where id = v_canal.org_id and status = 'ativa') then
    raise exception 'empresa suspensa';
  end if;
  if coalesce(p_telefone, '') !~ '^[0-9]{10,15}$' then
    raise exception 'telefone inválido';
  end if;
  if p_texto is not null and btrim(p_texto) <> '' and v_canal.tipo = 'meta' then
    raise exception 'na API oficial a conversa começa com um modelo aprovado';
  end if;

  select id into v_contato from public.contatos where org_id = v_canal.org_id and telefone = p_telefone;
  if v_contato is null then
    insert into public.contatos (org_id, telefone, nome, origem, responsavel_id)
    values (v_canal.org_id, p_telefone, left(v_nome, 120), 'prospeccao', auth.uid())
    returning id into v_contato;
  elsif not public.pode_ver_contato(v_contato) then
    raise exception 'esse número é cliente de outro vendedor';
  elsif v_nome is not null then
    update public.contatos set nome = left(v_nome, 120) where id = v_contato and nome is null;
  end if;

  select id into v_conversa from public.conversas where canal_id = p_canal and contato_id = v_contato for update;
  if v_conversa is null then
    insert into public.conversas (org_id, canal_id, contato_id, estado, atribuida_a)
    values (v_canal.org_id, p_canal, v_contato, 'humano', auth.uid())
    returning id into v_conversa;
  else
    update public.conversas
       set estado = 'humano', atribuida_a = case when estado = 'humano' and atribuida_a is not null then atribuida_a else auth.uid() end,
           nao_lidas = 0
     where id = v_conversa;
  end if;

  if p_texto is not null and btrim(p_texto) <> '' then
    perform public.enfileirar_saida(v_conversa, btrim(p_texto), 'atendente', auth.uid());
  end if;
  return v_conversa;
end $$;

revoke execute on function public.iniciar_conversa(uuid, text, text, text) from public, anon;
grant execute on function public.iniciar_conversa(uuid, text, text, text) to authenticated;
