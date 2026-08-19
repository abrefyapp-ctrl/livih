# Livih — gestão de conversas de WhatsApp

Sistema de **caixa de entrada compartilhada** para atendimento por WhatsApp, com
trilha de auditoria imutável. Nasceu como fork do [Abrefy](https://abrefy.com.br)
(gestão de chamados) e está sendo remodelado para um caso de uso diferente:
atendimento de cobrança / inadimplência, com vários atendentes num mesmo número.

> **Este repositório não tem vínculo com o repositório ou o banco do Abrefy.**
> Histórico do git recomeçado, remote removido, credenciais de produção retiradas
> do código. Nada aqui escreve no Abrefy.

## Diferença central em relação ao Abrefy

O Abrefy é um sistema de chamados: mensagem é conteúdo de trabalho, pode ser
editada, e apagar um ticket apaga o histórico junto.

Aqui a premissa é oposta: **o histórico de mensagens é um livro-razão
append-only**. Ninguém edita, ninguém apaga — nem administrador. A camada de
trabalho (casos, atribuição, notas, status) fica por cima e é mutável; o registro
do que foi dito, não.

Consequências no modelo de dados, ainda a implementar:

| Abrefy | Aqui |
|---|---|
| `ticket` = thread de conversa | `conversation` (permanente, por contato) + `case` (abre/fecha) |
| `messages` com UPDATE/DELETE liberados | append-only, sem policy de UPDATE ou DELETE |
| campo `status` sobrescrito | `message_status` como histórico |
| envio direto do componente | outbox + Edge Function |
| nota interna junto da mensagem | tabela separada |
| — | janela de 24h a partir de `last_inbound_at` |
| — | `author_type` incluindo `bot` |

## Stack

React 18 + Vite + TypeScript + Tailwind + shadcn/ui, Supabase (Postgres, Auth,
Realtime, Storage, Edge Functions).

## Setup

```bash
npm install
cp .env.example .env   # preencher com o SEU projeto Supabase
npm run dev
```

O app quebra no boot se as variáveis estiverem faltando — de propósito, para não
subir apontando para o lugar errado. Ver [src/lib/env.ts](src/lib/env.ts).

Preencha também `project_id` em `supabase/config.toml` antes de rodar qualquer
comando da CLI do Supabase.

## Estado atual

Fork recém-criado. O código é o do Abrefy, com as credenciais centralizadas em
variáveis de ambiente. **A remodelagem descrita acima ainda não foi feita** — as
migrations em `supabase/migrations/` são as herdadas e refletem o modelo antigo.
