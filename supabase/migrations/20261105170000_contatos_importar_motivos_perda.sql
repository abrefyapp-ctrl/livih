-- Importar contatos por planilha e motivo de perda em lista (docs/crm-acompanhamento.md, entrega 4; 05/11).
--
-- 1. Importação de contatos (dono e admin): a empresa chega com a lista dela. Acha pelo celular (só números, com 55),
--    atualiza só o que veio preenchido, soma as etiquetas e põe na carteira do vendedor informado pelo e-mail (sem
--    vendedor, fica com a equipe toda, como na importação de clientes). O que não dá para usar volta como aviso.
-- 2. Motivo de perda em lista: o texto livre não somava em relatório. A empresa tem a lista dela (editável, com um
--    padrão); a oportunidade perdida aponta o motivo, e o texto livre continua como detalhe. O Painel mostra as perdas
--    por motivo no período (painel_perdas).

-- ============================================================================
-- Importação de contatos
-- ============================================================================
-- p_linhas: [{nome, telefone, email, empresa, etiquetas, vendedor}], etiquetas separadas por vírgula ou ponto e vírgula,
-- vendedor = e-mail de alguém da equipe.
create function public.contatos_importar(p_org uuid, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_linha jsonb;
  v_n integer := 0;
  v_tel text;
  v_tags text[];
  v_vend uuid;
  v_ct public.contatos;
  v_criados integer := 0;
  v_atualizados integer := 0;
  v_avisos jsonb := '[]';
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin importam contatos';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'a planilha não tem linhas';
  end if;
  if jsonb_array_length(p_linhas) > 5000 then
    raise exception 'no máximo 5.000 linhas por importação';
  end if;

  for v_linha in select x from jsonb_array_elements(p_linhas) x loop
    v_n := v_n + 1;
    select jsonb_object_agg(k, nullif(btrim(v), '')) into v_linha from jsonb_each_text(v_linha) as e(k, v);
    v_linha := coalesce(v_linha, '{}');

    v_tel := regexp_replace(coalesce(v_linha ->> 'telefone', ''), '\D', '', 'g');
    if length(v_tel) in (10, 11) then
      v_tel := '55' || v_tel;
    end if;
    if v_tel !~ '^[0-9]{12,15}$' then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: celular "%s" inválido (use DDD + número), ignorada.', v_n,
                                              coalesce(v_linha ->> 'telefone', '')));
      continue;
    end if;

    select coalesce(array_agg(distinct t) filter (where t <> ''), '{}') into v_tags
      from unnest(regexp_split_to_array(coalesce(v_linha ->> 'etiquetas', ''), '\s*[,;]\s*')) t;
    v_tags := (select coalesce(array_agg(left(btrim(t), 40)), '{}') from unnest(v_tags) t);

    v_vend := null;
    if v_linha ->> 'vendedor' is not null then
      select m.user_id into v_vend from public.membros_org m join auth.users u on u.id = m.user_id
       where m.org_id = p_org and m.ativo and lower(u.email) = lower(v_linha ->> 'vendedor');
      if v_vend is null then
        v_avisos := v_avisos || to_jsonb(format('Linha %s: o vendedor "%s" não é da equipe; o contato ficou sem vendedor.',
                                                v_n, v_linha ->> 'vendedor'));
      end if;
    end if;

    select * into v_ct from public.contatos where org_id = p_org and telefone = v_tel;
    if v_ct.id is null then
      insert into public.contatos (org_id, telefone, nome, email, empresa, tags, origem)
      values (p_org, v_tel, left(v_linha ->> 'nome', 200), left(lower(v_linha ->> 'email'), 200),
              left(v_linha ->> 'empresa', 200), v_tags, 'importacao')
      returning * into v_ct;
      -- O gatilho põe quem importou como vendedor; a importação é para a equipe toda, salvo o vendedor da linha.
      update public.contatos set responsavel_id = v_vend where id = v_ct.id;
      v_criados := v_criados + 1;
    else
      update public.contatos c set
        nome = coalesce(left(v_linha ->> 'nome', 200), c.nome),
        email = coalesce(left(lower(v_linha ->> 'email'), 200), c.email),
        empresa = coalesce(left(v_linha ->> 'empresa', 200), c.empresa),
        tags = (select coalesce(array_agg(distinct t), '{}') from unnest(c.tags || v_tags) t),
        responsavel_id = coalesce(v_vend, c.responsavel_id)
       where c.id = v_ct.id;
      v_atualizados := v_atualizados + 1;
    end if;
  end loop;

  perform public.auditar(p_org, 'contatos_importar', 'contatos', null, null,
                         jsonb_build_object('linhas', v_n, 'criados', v_criados, 'atualizados', v_atualizados));
  return jsonb_build_object('criados', v_criados, 'atualizados', v_atualizados, 'avisos', v_avisos);
end $$;
revoke execute on function public.contatos_importar(uuid, jsonb) from public, anon;
grant execute on function public.contatos_importar(uuid, jsonb) to authenticated;

-- ============================================================================
-- Motivos de perda
-- ============================================================================
create table public.motivos_perda (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (org_id, nome),
  unique (id, org_id)
);
comment on table public.motivos_perda is 'Lista de motivos de perda da empresa (oportunidades.motivo_perda_id)';
alter table public.motivos_perda enable row level security;
create policy motivos_perda_ver on public.motivos_perda for select to authenticated using (public.eh_membro(org_id));
create policy motivos_perda_gerir on public.motivos_perda for all to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')) with check (public.tem_papel(org_id, '{dono,admin}'));
grant select, insert, update, delete on public.motivos_perda to authenticated;

alter table public.oportunidades add column motivo_perda_id uuid;
alter table public.oportunidades add constraint oportunidades_motivo_perda_fk
  foreign key (motivo_perda_id, org_id) references public.motivos_perda (id, org_id) on delete set null (motivo_perda_id);
comment on column public.oportunidades.motivo_perda is 'Detalhe da perda, em texto livre (o motivo da lista fica em motivo_perda_id)';

-- A lista padrão: na empresa nova e nas que já existem.
create function public.motivos_perda_padrao(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.motivos_perda (org_id, nome, ordem) values
    (p_org, 'Preço', 1), (p_org, 'Prazo de entrega', 2), (p_org, 'Escolheu outro fornecedor', 3),
    (p_org, 'Sem resposta do cliente', 4), (p_org, 'Desistiu da compra', 5), (p_org, 'Outro', 6)
  on conflict (org_id, nome) do nothing;
$$;
create function public.organizacao_motivos_perda_padrao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.motivos_perda_padrao(new.id);
  return new;
end $$;
create trigger organizacao_motivos_perda_padrao after insert on public.organizacoes
for each row execute function public.organizacao_motivos_perda_padrao();
select public.motivos_perda_padrao(id) from public.organizacoes;

revoke execute on function public.motivos_perda_padrao(uuid), public.organizacao_motivos_perda_padrao()
from public, anon, authenticated;

-- Perdas do período por motivo, com a mesma regra de quem vê do Painel (atendente: a própria carteira).
create function public.painel_perdas(p_org uuid, p_de timestamptz, p_ate timestamptz, p_vendedor uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_vend uuid := public.painel_filtro_vendedor(p_org, p_vendedor);
begin
  if p_ate <= p_de or p_ate - p_de > interval '366 days' then
    raise exception 'período inválido';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('motivo', x.motivo, 'quantidade', x.n, 'valor', x.valor)
                              order by x.n desc, x.motivo), '[]')
      from (
        select coalesce(mp.nome, 'Sem motivo informado') as motivo, count(*) as n, coalesce(sum(o.valor_estimado), 0) as valor
          from public.oportunidades o
          join public.etapas_funil e on e.id = o.etapa_id and e.tipo = 'perdido'
          left join public.motivos_perda mp on mp.id = o.motivo_perda_id
         where o.org_id = p_org and o.fechada_em >= p_de and o.fechada_em < p_ate
           and (v_vend is null or o.responsavel_id = v_vend)
         group by 1
      ) x
  );
end $$;
revoke execute on function public.painel_perdas(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.painel_perdas(uuid, timestamptz, timestamptz, uuid) to authenticated;
