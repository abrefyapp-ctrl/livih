-- Consumo de inteligência artificial por empresa: base para medir o custo real e, depois, para a cota de cada plano.
--
-- Duas origens gravam aqui (só com a chave de serviço, nunca pelo navegador):
--   - 'resposta': o coletor da VPS (/usr/local/bin/coletar_uso_ia_livih.py) lê as execuções do agente no n8n e
--     grava os tokens de cada uma. O agente não precisa saber disso (e importar workflow no n8n o desativa).
--   - 'transcricao': o waha-webhook, logo depois de transcrever um áudio na OpenAI.
-- `origem_ref` torna a gravação idempotente: 'n8n:<id da execução>' ou 'audio:<id da mensagem>'.

-- ---------- preços por modelo (editável sem mexer em código) ----------
create table public.precos_ia (
  modelo                  text primary key,
  usd_por_milhao_entrada  numeric(10, 4) not null,
  usd_por_milhao_saida    numeric(10, 4) not null,
  observacao              text,
  atualizado_em           timestamptz not null default now()
);

insert into public.precos_ia (modelo, usd_por_milhao_entrada, usd_por_milhao_saida, observacao) values
  ('gpt-5-mini', 0.25, 2.00, 'preço padrão da API, conferido em 09/10/2026'),
  ('gpt-4o-transcribe', 2.50, 10.00, 'A CONFERIR na página de preços da OpenAI: o áudio de entrada pode ter preço próprio por token');

alter table public.precos_ia enable row level security;
create policy precos_ia_ver on public.precos_ia for select to authenticated using (public.eh_admin_plataforma());

-- ---------- consumo ----------
create table public.uso_ia (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references public.organizacoes (id) on delete cascade,
  conversa_id     uuid references public.conversas (id) on delete set null,
  mensagem_id     uuid,
  tipo            text not null check (tipo in ('resposta', 'transcricao')),
  modelo          text not null,
  chamadas        integer not null default 1 check (chamadas >= 0),
  tokens_entrada  integer not null default 0 check (tokens_entrada >= 0),
  tokens_saida    integer not null default 0 check (tokens_saida >= 0),
  segundos_audio  numeric(8, 1),
  origem_ref      text not null unique,
  criado_em       timestamptz not null default now()
);

create index uso_ia_org_data_idx on public.uso_ia (org_id, criado_em desc);

alter table public.uso_ia enable row level security;
-- Leitura: dono/admin da empresa e a equipe da plataforma. Escrita: só a chave de serviço (sem policy de insert).
create policy uso_ia_ver on public.uso_ia for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}') or public.eh_admin_plataforma());
revoke insert, update, delete on public.uso_ia from anon, authenticated;

-- ---------- resumo mensal por empresa (base da cota do plano) ----------
-- "Conversas com o agente" = conversas distintas em que o agente respondeu no mês (horário de Brasília).
create view public.uso_ia_mensal with (security_invoker = true) as
select
  u.org_id,
  date_trunc('month', u.criado_em at time zone 'America/Sao_Paulo')::date as mes,
  count(*) filter (where u.tipo = 'resposta')                              as respostas_agente,
  count(distinct u.conversa_id) filter (where u.tipo = 'resposta')         as conversas_com_agente,
  count(*) filter (where u.tipo = 'transcricao')                           as audios_transcritos,
  coalesce(sum(u.segundos_audio), 0)                                       as segundos_audio,
  sum(u.tokens_entrada)                                                    as tokens_entrada,
  sum(u.tokens_saida)                                                      as tokens_saida,
  -- Os preços só são visíveis para a equipe da plataforma (precos_ia): para a empresa cliente o custo vem vazio.
  round(sum(u.tokens_entrada * p.usd_por_milhao_entrada / 1e6
          + u.tokens_saida   * p.usd_por_milhao_saida   / 1e6), 4) as custo_usd
from public.uso_ia u
left join public.precos_ia p on p.modelo = u.modelo
group by 1, 2;

grant select on public.uso_ia_mensal to authenticated;
