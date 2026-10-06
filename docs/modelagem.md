# Livih — modelagem (proposta para revisão)

CRM de atendimento pelo WhatsApp com agente de IA. **Multiempresa desde o dia 1**: a F7 é a primeira
organização; depois entram clientes da F7 e terceiros, no mesmo banco, isolados por RLS.

## Princípios

1. **Toda tabela de negócio tem `org_id`** e RLS "só membros da organização veem e mexem".
2. **Nada específico de cliente no código**: número/instância da w-api, prompt do agente, base de
   conhecimento, etapas do funil, regras de passagem para humano e agenda são linhas do banco.
3. **Histórico de mensagens é só acréscimo**: não existe UPDATE de conteúdo nem DELETE pelo app.
   Exclusão por LGPD só por função própria, que anonimiza e registra na auditoria.
4. **Um caminho de saída só**: bot e atendente enviam pela mesma fila (`fila_envio`). O n8n nunca chama a
   w-api direto.
5. **Segredos fora das tabelas**: o token da w-api de cada canal fica no Supabase Vault. O front nunca vê.
6. **O n8n é o cérebro, não o dono dos dados**: ele lê e grava pelo banco (RPCs). Se o n8n cair, as
   mensagens continuam sendo gravadas e o atendente responde pela tela.

## Fluxo

```
WhatsApp ──► w-api ──► Edge Function wapi-webhook (1 URL por canal, com segredo)
                         │ 1. grava evento bruto (dedup pelo id da mensagem)
                         │ 2. acha/cria contato e conversa, grava a mensagem
                         │ 3. áudio → transcreve (como o agente-midia do Casos Info)
                         │ 4. conversa em modo "bot" e agente ativo? → chama o n8n
                         ▼
                       n8n (1 workflow para todas as organizações)
                         │ espera ~6 s (cliente manda várias mensagens seguidas) e
                         │ desiste se chegou mensagem mais nova
                         │ agente_contexto(conversa) → prompt + base + últimas mensagens + lead
                         │ ferramentas = RPCs (lead, etapa, nota, humano, agenda)
                         │ agente_responder(conversa, texto)
                         ▼
                       mensagens (autor = bot) + fila_envio
                         ▼
                       Edge Function wapi-enviar (pg_cron / trigger) ──► w-api ──► WhatsApp

Atendente na tela ──► enviar_mensagem(conversa, texto) ──► mesma fila_envio
```

## Tabelas

### Organização e acesso
| Tabela | Campos principais | Observações |
|---|---|---|
| `organizacoes` | nome, slug, status (ativa/suspensa), plano, criado_em | plano/limites ficam para depois, mas a coluna já existe |
| `perfis` | user_id (auth.users), nome, avatar_url | criado por trigger no cadastro |
| `membros_org` | org_id, user_id, papel (dono / admin / atendente), ativo | um usuário pode estar em várias organizações (a F7 atendendo clientes) |

Funções de RLS: `eh_membro(org_id)` e `tem_papel(org_id, papeis[])`, `security definer`, `stable`,
com `search_path` fixo.

### Canal e agente (configuração por organização)
| Tabela | Campos principais | Observações |
|---|---|---|
| `canais` | org_id, tipo (`wapi`), nome, telefone, instance_id, vault_token_id, webhook_segredo_hash, ativo | o token fica no Vault; a tabela guarda só a referência |
| `agentes` | org_id, canal_id, nome, ativo, modelo, prompt, mensagem_fora_horario, horario jsonb, regras_humano jsonb, telefone_alerta | a F7 começa com o prompt atual do "Agente F7" |
| `base_conhecimento` | org_id, titulo, conteudo, ativo, atualizado_por | começa com o texto atual da ferramenta `base_conhecimento_f7` |
| `base_trechos` *(fase 2)* | org_id, documento_id, conteudo, embedding vector | busca por trecho quando a base crescer |

### Conversa
| Tabela | Campos principais | Observações |
|---|---|---|
| `contatos` | org_id, telefone (E.164), nome, empresa, email, origem, tags[], dados jsonb, responsavel_id | único por (org_id, telefone) |
| `conversas` | org_id, canal_id, contato_id, estado, atribuida_a, motivo_humano, ultima_mensagem_em, nao_lidas | **uma conversa permanente por contato e canal**; estado = `bot` / `aguardando_humano` / `humano` / `encerrada` |
| `mensagens` | org_id, conversa_id, direcao (entrada/saida), autor_tipo (contato/atendente/bot/sistema), autor_id, tipo (texto/audio/imagem/documento/…), texto, transcricao, midia_path, wapi_id, status_entrega, criado_em | só acréscimo: um trigger bloqueia DELETE e UPDATE de conteúdo; só `status_entrega` muda |
| `eventos_recebidos` | canal_id, wapi_id, payload jsonb, recebido_em, processado_em, erro | único por (canal_id, wapi_id) = deduplicação; apagado após 30 dias (cabe no plano gratuito) |
| `fila_envio` | org_id, conversa_id, mensagem_id, status (pendente/enviando/enviada/erro), tentativas, proxima_tentativa_em, erro | nova tentativa com espera crescente |
| `notas` | org_id, conversa_id ou contato_id, autor_id, texto | nota interna, o contato não vê |

### CRM
| Tabela | Campos principais | Observações |
|---|---|---|
| `etapas_funil` | org_id, nome, ordem, tipo (aberta/ganho/perdido), cor | cada organização define as suas; padrão: Novo → Em diagnóstico → Reunião marcada → Proposta → Ganho / Perdido |
| `oportunidades` | org_id, contato_id, etapa_id, titulo, resumo, valor_estimado, responsavel_id, origem, fechada_em, motivo_perda | **o "lead"**. Separado do contato porque o mesmo contato pode voltar com outro projeto |
| `oportunidade_historico` | oportunidade_id, etapa_de, etapa_para, autor_tipo, autor_id, criado_em | trilha do funil, preenchida por trigger |
| `reunioes` *(fase 5)* | org_id, contato_id, oportunidade_id, inicio, fim, status, google_event_id, criado_por_tipo | agenda de cada organização configurada no agente |

### Auditoria
| Tabela | Campos principais | Observações |
|---|---|---|
| `auditoria` | org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes jsonb, depois jsonb, criado_em | só acréscimo; registra troca de estado da conversa, etapa, atribuição, exclusão LGPD e mudança de config |

## Ferramentas do agente (RPCs, só `service_role`)

Todas recebem `conversa_id` e tiram a organização dela, então o agente de uma empresa não consegue
tocar nos dados de outra, mesmo com um prompt mal-intencionado.

| RPC | Para quê |
|---|---|
| `agente_contexto(conversa)` | prompt, base, contato, oportunidade aberta e últimas N mensagens |
| `agente_atualizar_contato(conversa, dados)` | nome, empresa, email, segmento… o que o cliente contar |
| `agente_registrar_oportunidade(conversa, titulo, resumo)` | cria ou atualiza o lead |
| `agente_mover_etapa(conversa, etapa)` | ex.: "Em diagnóstico" |
| `agente_nota(conversa, texto)` | resumo do diagnóstico para o humano |
| `agente_chamar_humano(conversa, motivo)` | lead quente / orçamento / reclamação: estado → `aguardando_humano`, o bot para e o `telefone_alerta` recebe aviso |
| `agente_responder(conversa, texto)` | grava a resposta e põe na fila |
| `agente_horarios_livres` / `agente_agendar` *(fase 5)* | Google Calendar da organização |

## Front (Cloudflare)

- **Conversas**: lista por estado (aguardando humano primeiro), chat em tempo real (Supabase
  Realtime), botões "assumir", "devolver ao bot" e "encerrar".
- **Funil**: quadro por etapa com as oportunidades.
- **Contatos**: ficha com histórico, notas e oportunidades.
- **Configurações** (dono/admin): canal, agente (prompt, horário, regras), base de conhecimento,
  etapas, membros.
- Seletor de organização no topo para quem é membro de mais de uma.

## Plano gratuito do Supabase

- Mensagens em texto: anos de folga nos 500 MB.
- `eventos_recebidos` apagados após 30 dias. Áudio não é guardado por padrão, só a transcrição
  (configurável por organização).
- Backup: `pg_dump` diário na VPS. Um ping diário evita a pausa por inatividade.
- Mídia no bucket `midias/<org_id>/<conversa_id>/…`, com acesso por organização.

## Fases

1. Banco (tudo acima menos `base_trechos` e `reunioes`) + `wapi-webhook` + `wapi-enviar` + tela de conversas.
2. Agente F7 no n8n usando as RPCs (prompt e base atuais migrados).
3. Passagem para humano + aviso.
4. Funil e contatos na tela.
5. Agenda (Google Calendar) e base por trecho.

## Em aberto

- Agenda: qual Google Calendar (fase 5).
- Número de teste: ligar primeiro o número da F7 direto, ou um número de teste antes?
- Cobrança dos clientes (planos, limite de mensagens): fora por enquanto. A coluna `plano` só reserva espaço.
