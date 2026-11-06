-- Forma de pagamento na conta do WhatsApp Business (pedido de 06/11, depois da campanha "Teste1" recusada com 131042).
--
-- No modelo da Livih (Embedded Signup, provedor de tecnologia), a Meta cobra cada empresa direto, no cartão da conta do
-- WhatsApp Business dela; a Livih não paga nem cobra pela Meta. Sem cartão, o atendimento dentro das 24 h funciona,
-- mas campanha e modelo fora das 24 h são recusados depois de aceitos (131042), e a empresa só descobria assim.
--
-- A API não diz se o cartão foi cadastrado. Então o número oficial guarda:
--   - meta_pagamento_ok_em: quando o dono ou admin marcou "Já cadastrei" (a tela para de pedir);
--   - meta_pagamento_falha_em: a última recusa da Meta por falta de pagamento (o meta-webhook grava). Recusa depois do
--     "Já cadastrei" volta a mostrar o aviso, agora em faixa para dono e admin.

alter table public.canais
  add column meta_pagamento_ok_em timestamptz,
  add column meta_pagamento_falha_em timestamptz;
comment on column public.canais.meta_pagamento_ok_em is 'API oficial: quando a empresa confirmou que cadastrou a forma de pagamento na Meta';
comment on column public.canais.meta_pagamento_falha_em is 'API oficial: última recusa da Meta por falta de forma de pagamento (erro 131042)';

create function public.canal_confirmar_pagamento_meta(p_canal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_canal public.canais;
begin
  select * into v_canal from public.canais where id = p_canal;
  if v_canal.id is null or not public.tem_papel(v_canal.org_id, '{dono,admin}') then
    raise exception 'só dono e admin confirmam a forma de pagamento';
  end if;
  if v_canal.tipo <> 'meta' then
    raise exception 'só número da API oficial tem cobrança da Meta';
  end if;
  update public.canais set meta_pagamento_ok_em = now() where id = p_canal;
  perform public.auditar(v_canal.org_id, 'confirmar_pagamento_meta', 'canais', p_canal::text, null, null);
end $$;
revoke execute on function public.canal_confirmar_pagamento_meta(uuid) from public, anon;
grant execute on function public.canal_confirmar_pagamento_meta(uuid) to authenticated;

-- Chamada pelo meta-webhook quando a Meta recusa com 131042.
create function public.canal_falha_pagamento_meta(p_canal uuid)
returns void language sql security definer set search_path = '' as $$
  update public.canais set meta_pagamento_falha_em = now() where id = p_canal and tipo = 'meta';
$$;
revoke execute on function public.canal_falha_pagamento_meta(uuid) from public, anon, authenticated;
grant execute on function public.canal_falha_pagamento_meta(uuid) to service_role;

-- Quem já teve campanha (Marketing, sempre paga) entregue nos últimos 30 dias já tem cartão: não precisa pedir. Modelo de
-- Utilidade não serve de prova, porque dentro das 24 h a Meta entrega de graça mesmo sem cartão.
update public.canais k set meta_pagamento_ok_em = now()
 where k.tipo = 'meta' and k.meta_pagamento_ok_em is null
   and exists (select 1 from public.mensagens m join public.conversas c on c.id = m.conversa_id
                where c.canal_id = k.id and m.direcao = 'saida' and m.modelo ->> 'campanha_id' is not null
                  and m.status_entrega in ('entregue', 'lida') and m.criado_em > now() - interval '30 days');
