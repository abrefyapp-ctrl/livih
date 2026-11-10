-- Número novo nasce com a configuração completa do agente da empresa (docs/equipes-origem-prospeccao.md, entrega 0;
-- 10/11).
--
-- O agente é uma linha por número, mas a configuração é uma só por empresa: agentes_sincronizar copia cada alteração
-- para as outras linhas. Só que, ao conectar um número novo, o whatsapp-conexao copiava apenas instruções, regras,
-- telefone de alerta e modelo. Saudação, horário, aviso fora do horário e "identificar o cliente" (que vieram depois)
-- ficavam vazios no número novo. Caso real: o número "João", criado na demonstração da CEFEQ em 10/11, nasceu sem
-- saudação e sem horário. E a tela do agente abre uma linha qualquer da empresa: se abrisse a do número novo e alguém
-- salvasse, o sincronizar espalhava os campos vazios para todos os números.
--
-- Com 25 vendedores, cada um com o seu número (CEFEQ), isso aconteceria em quase todos. A cópia passa para o banco,
-- num gatilho antes de inserir, e vale para qualquer caminho que crie o agente; o liga/desliga continua por número
-- (o número novo nasce desligado, como já era).

create function public.agentes_herdar_empresa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_modelo public.agentes;
begin
  select a.* into v_modelo from public.agentes a
   where a.org_id = new.org_id and a.id is distinct from new.id
   order by a.atualizado_em desc
   limit 1;
  if v_modelo.id is not null then
    new.prompt := v_modelo.prompt;
    new.regras_humano := v_modelo.regras_humano;
    new.telefone_alerta := v_modelo.telefone_alerta;
    new.modelo := v_modelo.modelo;
    new.saudacao := v_modelo.saudacao;
    new.horario := v_modelo.horario;
    new.mensagem_fora_horario := v_modelo.mensagem_fora_horario;
    new.identificar_cliente := v_modelo.identificar_cliente;
  end if;
  return new;
end $$;
revoke execute on function public.agentes_herdar_empresa() from public, anon, authenticated;

create trigger agentes_herdar_empresa before insert on public.agentes
for each row execute function public.agentes_herdar_empresa();

-- Acerto das empresas que já têm números com configuração diferente (em 10/11: só a CEFEQ). Vale a linha mais completa
-- (com saudação, horário, aviso e identificar cliente); no empate, a alterada por último.
with referencia as (
  select distinct on (a.org_id) a.*
    from public.agentes a
   where a.org_id in (
     select org_id from public.agentes
      group by org_id
     having count(distinct (prompt, regras_humano, telefone_alerta, modelo, saudacao, horario::text,
                            mensagem_fora_horario, identificar_cliente)) > 1)
   order by a.org_id,
            (a.saudacao is not null)::int + (a.horario is not null)::int + (a.mensagem_fora_horario is not null)::int
              + a.identificar_cliente::int desc,
            a.atualizado_em desc
)
update public.agentes a
   set prompt = r.prompt, regras_humano = r.regras_humano, telefone_alerta = r.telefone_alerta, modelo = r.modelo,
       saudacao = r.saudacao, horario = r.horario, mensagem_fora_horario = r.mensagem_fora_horario,
       identificar_cliente = r.identificar_cliente
  from referencia r
 where a.org_id = r.org_id and a.id <> r.id;
