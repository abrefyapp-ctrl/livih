-- Mensagem do limite de números do plano (revisão do manual de WhatsApp, 16/11): mandava usar o "botão Remover", mas o
-- botão se chama "Remover número" e fica dentro de Configurar. Igual a 20261102140000, só o texto.
create or replace function public.canais_sem_vaga(p_org uuid, p_ignorar uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limite integer;
  v_plano text;
  v_eh_proximo boolean;
  v_em date;
  v_qtd integer;
begin
  select l.numeros, l.nome, l.proximo, o.plano_proximo_em into v_limite, v_plano, v_eh_proximo, v_em
    from public.organizacoes o
    join public.planos pa on pa.codigo = o.plano
    left join public.planos pp on pp.codigo = o.plano_proximo
    cross join lateral (
      select x.numeros, x.nome, x.proximo
        from (values (pa.numeros_whatsapp, pa.nome, false), (pp.numeros_whatsapp, pp.nome, true)) x(numeros, nome, proximo)
       where x.numeros is not null order by x.numeros, x.proximo limit 1
    ) l
   where o.id = p_org;
  if v_limite is null then
    return null;
  end if;
  select count(*) into v_qtd from public.canais where org_id = p_org and ativo and id is distinct from p_ignorar;
  if v_qtd < v_limite then
    return null;
  end if;
  if v_eh_proximo then
    return format('O plano %s, que começa em %s, permite %s de WhatsApp, e a empresa já tem %s. Para conectar outro, '
      || 'remova um número que não usa (Configurar → Remover número; só desconectar não libera a vaga). Ou o dono desiste '
      || 'da troca em Configurações → Plano e consumo.',
      v_plano, to_char(v_em, 'DD/MM'), case when v_limite = 1 then '1 número' else v_limite || ' números' end, v_qtd);
  end if;
  return format('O plano %s permite %s de WhatsApp, e a empresa já tem %s. Para conectar outro, remova um número que não '
    || 'usa (Configurar → Remover número; só desconectar não libera a vaga). Ou o dono sobe de plano em Configurações → '
    || 'Plano e consumo.', v_plano, case when v_limite = 1 then '1 número' else v_limite || ' números' end, v_qtd);
end $function$

;
