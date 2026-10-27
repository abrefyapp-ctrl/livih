-- Campanhas: texto "se faltar" nas variáveis de nome e empresa (teste com os contatos reais da F7, 27/10).
--
-- Muitos contatos não têm nome cadastrado e a mensagem saía "Olá cliente"; sem empresa, a variável de empresa usava o
-- nome da pessoa ("novidade da Lúcia"). Agora cada variável {fonte: 'nome'|'empresa'} leva `padrao`, o texto que
-- entra quando falta o dado. A empresa não cai mais no nome da pessoa. Sem padrao (campanhas antigas), vale o de antes.

create or replace function public.campanha_parametros(p_modelo jsonb, p_contato uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(
           left(case v ->> 'fonte'
             when 'nome' then coalesce(nullif(btrim(c.nome), ''), nullif(btrim(c.nome_whatsapp), ''),
                                       nullif(btrim(v ->> 'padrao'), ''), 'cliente')
             when 'empresa' then coalesce(nullif(btrim(cl.nome), ''), nullif(btrim(c.empresa), ''),
                                          nullif(btrim(v ->> 'padrao'), ''),
                                          nullif(btrim(c.nome), ''), nullif(btrim(c.nome_whatsapp), ''), 'cliente')
             else btrim(v ->> 'valor') end, 200) order by n), '{}')
    from jsonb_array_elements(coalesce(p_modelo -> 'variaveis', '[]')) with ordinality x(v, n)
    join public.contatos c on c.id = p_contato
    left join public.clientes cl on cl.id = c.cliente_id;
$$;
revoke execute on function public.campanha_parametros(jsonb, uuid) from public, anon, authenticated;

-- Quantos do público estão sem nome ou sem empresa, para a tela avisar antes de enviar.
create or replace function public.campanha_publico(p_org uuid, p_filtros jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin fazem campanhas';
  end if;
  return (
    with e as (
      select c.* from public.campanha_elegiveis(p_org, coalesce(p_filtros, '{}')) x join public.contatos c on c.id = x.contato_id
    )
    select jsonb_build_object(
      'total', (select count(*) from e),
      'sem_nome', (select count(*) from e where nullif(btrim(e.nome), '') is null and nullif(btrim(e.nome_whatsapp), '') is null),
      'sem_empresa', (select count(*) from e left join public.clientes cl on cl.id = e.cliente_id
                       where nullif(btrim(cl.nome), '') is null and nullif(btrim(e.empresa), '') is null),
      'descadastrados', (select count(*) from public.contatos where org_id = p_org and descadastrado_em is not null),
      'amostra', coalesce((select jsonb_agg(coalesce(s.nome, s.nome_whatsapp, s.telefone) order by s.nome nulls last)
                             from (select * from e order by e.nome nulls last limit 5) s), '[]'::jsonb)));
end $$;
