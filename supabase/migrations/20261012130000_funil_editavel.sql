-- Etapas do funil editáveis por empresa (Oportunidades → Editar etapas).
--
-- Cada negócio tem o seu funil: dono/admin renomeiam, reordenam, criam e removem as etapas abertas.
-- Ganho e Perdido continuam existindo sempre (uma de cada; o agente e os relatórios dependem do tipo, não do
-- nome), mas podem ser renomeadas. Tudo numa transação só, para o quadro nunca ficar pela metade.
--
-- p_abertas: [{"id": uuid | null, "nome": text}, …] na ordem do quadro (id null = etapa nova).
-- p_ganho / p_perdido: nomes das etapas de fechamento.
-- p_mover: {"<id da etapa removida>": "<id da etapa que recebe os cartões>"} — obrigatório para etapa removida
--          que ainda tem oportunidades; o destino precisa continuar no funil.
-- As oportunidades movidas ficam no histórico do funil como mudança feita por quem salvou.

create function public.funil_salvar(p_org uuid, p_abertas jsonb, p_ganho text, p_perdido text, p_mover jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_nomes text[];
  v_item jsonb;
  v_ordem integer := 0;
  v_id uuid;
  v_removida record;
  v_destino uuid;
  v_ganho uuid;
  v_perdido uuid;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin mudam o funil';
  end if;
  if jsonb_typeof(p_abertas) is distinct from 'array' or jsonb_array_length(p_abertas) = 0 then
    raise exception 'o funil precisa de pelo menos uma etapa aberta';
  end if;
  if jsonb_array_length(p_abertas) > 12 then
    raise exception 'no máximo 12 etapas abertas';
  end if;

  select array_agg(btrim(x ->> 'nome')) into v_nomes from jsonb_array_elements(p_abertas) x;
  v_nomes := v_nomes || btrim(coalesce(p_ganho, '')) || btrim(coalesce(p_perdido, ''));
  if exists (select 1 from unnest(v_nomes) n where coalesce(n, '') = '' or length(n) > 40) then
    raise exception 'toda etapa precisa de nome (até 40 caracteres)';
  end if;
  if (select count(distinct lower(n)) from unnest(v_nomes) n) <> array_length(v_nomes, 1) then
    raise exception 'há etapas com o mesmo nome';
  end if;
  -- Etapa aberta que veio com id precisa ser aberta e desta empresa.
  if exists (
    select 1 from jsonb_array_elements(p_abertas) x
     where x ->> 'id' is not null
       and not exists (select 1 from public.etapas_funil e
                        where e.id = (x ->> 'id')::uuid and e.org_id = p_org and e.tipo = 'aberta')
  ) then
    raise exception 'etapa inválida';
  end if;

  select id into v_ganho from public.etapas_funil where org_id = p_org and tipo = 'ganho' order by ordem limit 1;
  select id into v_perdido from public.etapas_funil where org_id = p_org and tipo = 'perdido' order by ordem limit 1;

  -- Removidas: os cartões vão para o destino escolhido antes de a etapa sair.
  for v_removida in
    select e.id, e.nome from public.etapas_funil e
     where e.org_id = p_org and e.tipo = 'aberta'
       and e.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_abertas) x where x ->> 'id' is not null)
  loop
    if exists (select 1 from public.oportunidades where etapa_id = v_removida.id) then
      v_destino := nullif(p_mover ->> v_removida.id::text, '')::uuid;
      if v_destino is null
         or v_destino not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_abertas) x where x ->> 'id' is not null) then
        raise exception 'escolha para onde vão as oportunidades de "%"', v_removida.nome;
      end if;
      update public.oportunidades set etapa_id = v_destino where etapa_id = v_removida.id;
    end if;
    delete from public.etapas_funil where id = v_removida.id;
  end loop;

  -- Nome provisório antes do definitivo: trocar dois nomes de lugar não pode bater no unique (org_id, nome).
  update public.etapas_funil set nome = id::text where org_id = p_org;

  for v_item in select x from jsonb_array_elements(p_abertas) x loop
    v_ordem := v_ordem + 1;
    v_id := nullif(v_item ->> 'id', '')::uuid;
    if v_id is null then
      insert into public.etapas_funil (org_id, nome, ordem, tipo) values (p_org, btrim(v_item ->> 'nome'), v_ordem, 'aberta');
    else
      update public.etapas_funil set nome = btrim(v_item ->> 'nome'), ordem = v_ordem where id = v_id;
    end if;
  end loop;
  update public.etapas_funil set nome = btrim(p_ganho), ordem = v_ordem + 1 where id = v_ganho;
  update public.etapas_funil set nome = btrim(p_perdido), ordem = v_ordem + 2 where id = v_perdido;
end $$;

revoke execute on function public.funil_salvar(uuid, jsonb, text, text, jsonb) from public, anon;
grant execute on function public.funil_salvar(uuid, jsonb, text, text, jsonb) to authenticated;
