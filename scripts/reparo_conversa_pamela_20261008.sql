-- Reparo de 08/10/2026: mensagens enviadas pelo celular no número da Pâmela (canal da sessão c-d553cdd906e74832)
-- caíram todas numa conversa com o próprio número dela (bug do waha-webhook corrigido no commit 0c3d411).
--
-- O que faz:
--   1. O contato errado (telefone = o da Pâmela, LID = o do 1º prospect) passa a ter o telefone do 1º prospect,
--      dono daquele LID. A conversa 26cedff7 vira a conversa com ele (onde já estão a prospecção dele e o
--      teste enviado pelo Livih, que de fato chegou para ele).
--   2. Cada outra mensagem dessa conversa vai para a conversa do destinatário real, lido do evento bruto do WAHA
--      (chat = LID do destinatário, RecipientAlt = telefone). Contato e conversa são achados ou criados pela mesma
--      função do sistema (contato_por_whatsapp).
--   3. Cada mensagem movida e a troca do contato ficam registradas na auditoria (antes/depois).
--
-- Mensagens são imutáveis; a única exceção do gatilho é o modo LGPD (livih.lgpd), ligado só dentro desta
-- transação (set_config local).
--
-- Uso: SQL Editor do Supabase (projeto przgftkiicuapbpwspjd). Termina com COMMIT. Para só conferir, troque o
-- COMMIT final por ROLLBACK.
begin;

select set_config('livih.lgpd', 'on', true);

create temp table reparo_log (passo text, detalhe text) on commit drop;

do $$
declare
  c_conversa constant uuid := '26cedff7-df15-4ad3-a09d-07f1dfe7c561';
  c_tel_errado constant text := '5541997547798';   -- o próprio número da Pâmela
  c_tel_dono_lid constant text := '5541987414157'; -- 1º prospect, dono do LID 259919173439633
  v_conv public.conversas;
  v_contato_errado public.contatos;
  r record;
  v_tel text;
  v_lid text;
  v_contato uuid;
  v_destino uuid;
begin
  select * into v_conv from public.conversas where id = c_conversa for update;
  if v_conv.id is null then raise exception 'conversa % não existe (reparo já feito?)', c_conversa; end if;
  select * into v_contato_errado from public.contatos where id = v_conv.contato_id for update;
  if v_contato_errado.telefone is distinct from c_tel_errado then
    raise exception 'o contato da conversa não é mais o número da Pâmela (%): reparo já feito?', v_contato_errado.telefone;
  end if;
  if exists (select 1 from public.contatos where org_id = v_conv.org_id and telefone = c_tel_dono_lid) then
    raise exception 'já existe outro contato com o telefone % — resolver à mão', c_tel_dono_lid;
  end if;

  -- 1. o contato errado passa a ser o 1º prospect
  update public.contatos set telefone = c_tel_dono_lid where id = v_contato_errado.id;
  insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
  values (v_conv.org_id, 'sistema', 'reparo_contato_proprio_numero', 'contatos', v_contato_errado.id::text,
          jsonb_build_object('telefone', c_tel_errado), jsonb_build_object('telefone', c_tel_dono_lid,
          'motivo', 'bug do waha-webhook (commit 0c3d411): o próprio número virava o contato'));
  insert into reparo_log values ('contato', c_tel_errado || ' -> ' || c_tel_dono_lid);

  -- 2. mensagens enviadas pelo celular para outros destinatários
  for r in
    select m.id, m.wa_id, m.texto, m.criado_em, e.payload
      from public.mensagens m
      join public.eventos_recebidos e on e.canal_id = v_conv.canal_id and e.wa_id = m.wa_id
     where m.conversa_id = c_conversa and m.direcao = 'saida'
     order by m.criado_em
  loop
    v_lid := nullif(split_part(r.payload->'payload'->>'from', '@', 1), '');
    if r.payload->'payload'->>'from' not like '%@lid' then v_lid := null; end if;
    v_tel := split_part(split_part(r.payload->'payload'->'_data'->'Info'->>'RecipientAlt', '@', 1), ':', 1);
    -- mesma normalização do waha-webhook (lerJid): celular brasileiro sem o 9 ganha o 9
    if v_tel ~ '^55\d{2}[6-9]\d{7}$' then v_tel := substr(v_tel, 1, 4) || '9' || substr(v_tel, 5); end if;
    if v_tel !~ '^\d{10,15}$' then v_tel := null; end if;

    if v_tel = c_tel_dono_lid or v_lid = v_contato_errado.whatsapp_lid then
      insert into reparo_log values ('fica', left(coalesce(r.texto, ''), 40));
      continue;
    end if;
    if v_tel is null and v_lid is null then
      insert into reparo_log values ('sem destino no evento, fica', left(coalesce(r.texto, ''), 40));
      continue;
    end if;

    v_contato := public.contato_por_whatsapp(v_conv.org_id, v_tel, v_lid, null);
    insert into public.conversas (org_id, canal_id, contato_id, estado)
    values (v_conv.org_id, v_conv.canal_id, v_contato, 'humano')
    on conflict (canal_id, contato_id) do nothing;
    select id into v_destino from public.conversas where canal_id = v_conv.canal_id and contato_id = v_contato;

    update public.mensagens set conversa_id = v_destino where id = r.id;
    insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
    values (v_conv.org_id, 'sistema', 'reparo_mensagem_conversa', 'mensagens', r.id::text,
            jsonb_build_object('conversa_id', c_conversa),
            jsonb_build_object('conversa_id', v_destino, 'telefone', v_tel, 'lid', v_lid,
                               'motivo', 'bug do waha-webhook (commit 0c3d411)'));
    insert into reparo_log values ('movida -> ' || coalesce(v_tel, v_lid), left(coalesce(r.texto, ''), 40));
  end loop;

  -- 3. resumo e horário da última mensagem de cada conversa envolvida
  update public.conversas cv
     set ultima_mensagem_em = u.criado_em,
         ultima_mensagem_resumo = left(coalesce(u.texto, '[' || u.tipo::text || ']'), 140)
    from (select distinct on (m.conversa_id) m.conversa_id, m.criado_em, m.texto, m.tipo
            from public.mensagens m
           where m.conversa_id in (select id from public.conversas where canal_id = v_conv.canal_id)
           order by m.conversa_id, m.criado_em desc) u
   where cv.id = u.conversa_id
     and cv.ultima_mensagem_em is distinct from u.criado_em;
end $$;

select passo, detalhe from reparo_log;

commit;
