# Funcionalidade de Redirecionamento de Mensagens

## 📋 Descrição

Sistema completo para redirecionar mensagens entre tickets na plataforma Abrefy. Permite que agentes movam ou copiem mensagens de um ticket para outro, mantendo histórico completo e rastreabilidade.

## ✨ Funcionalidades

### 1. **Redirecionamento de Mensagens**
- ✅ **Mover**: Remove a mensagem do ticket original e transfere para o ticket de destino
- ✅ **Copiar**: Duplica a mensagem no ticket de destino, mantendo no original

### 2. **Busca Inteligente de Tickets**
- Busca por número do ticket
- Busca por assunto
- Filtro por escopo (mesmo cliente ou todos os tickets)
- Apenas tickets abertos/em andamento/pendentes

### 3. **Histórico e Rastreabilidade**
- Registro completo de todos os redirecionamentos
- Identificação de quem realizou a ação
- Motivo do redirecionamento
- Mensagens automáticas notificando sobre o redirecionamento

### 4. **Interface Amigável**
- Modal de seleção com busca
- Visualização clara dos tickets disponíveis
- Preview da mensagem sendo redirecionada
- Feedback visual em tempo real

## 🗄️ Estrutura do Banco de Dados

### Tabela: `message_redirects`
```sql
CREATE TABLE message_redirects (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL,
  source_ticket_id UUID NOT NULL,
  target_ticket_id UUID NOT NULL,
  redirect_type VARCHAR(20) CHECK (redirect_type IN ('move', 'copy')),
  redirected_by UUID,
  redirect_reason TEXT,
  created_at TIMESTAMPTZ
);
```

### Alterações na Tabela: `messages`
```sql
ALTER TABLE messages ADD COLUMN original_message_id UUID;
ALTER TABLE messages ADD COLUMN is_redirected BOOLEAN DEFAULT false;
```

### Funções SQL

#### `redirect_message_to_ticket()`
Função principal que realiza o redirecionamento:
```sql
redirect_message_to_ticket(
  p_message_id UUID,
  p_target_ticket_id UUID,
  p_redirect_type VARCHAR(20),
  p_redirected_by UUID,
  p_redirect_reason TEXT
) RETURNS JSON
```

#### `get_message_redirect_history()`
Retorna histórico de redirecionamentos:
```sql
get_message_redirect_history(p_message_id UUID)
```

### View: `v_redirected_messages`
Facilita consultas de mensagens redirecionadas com todos os dados relacionados.

## 🚀 Instalação

### 1. Executar Migração SQL
```bash
psql -d sua_database -f 005_ticket_message_redirect.sql
```

Ou via Supabase Dashboard:
1. Acesse SQL Editor
2. Cole o conteúdo de `005_ticket_message_redirect.sql`
3. Execute

### 2. Deploy da Edge Function
```bash
# Via Supabase CLI
supabase functions deploy redirect-message --project-ref SEU_PROJECT_ID

# Ou faça upload manual no dashboard do Supabase
```

### 3. Adicionar Componentes React
Copie os componentes para seu projeto:
```
src/components/
  ├── MessageRedirectDialog.tsx
  └── MessageActions.tsx
```

### 4. Adicionar Serviço TypeScript (opcional)
Se você quiser usar o serviço no backend/server-side:
```
src/services/
  └── message_redirect_service.ts
```

## 💻 Uso

### Exemplo 1: Usando o Menu de Ações
```tsx
import { MessageActions } from '@/components/MessageActions';

<MessageActions
  message={message}
  ticketId={currentTicket.id}
  ticketNumber={currentTicket.ticket_number}
  organizationId={organizationId}
  customerId={customer.id}
  onSuccess={() => {
    // Atualizar lista de mensagens
    refetchMessages();
  }}
/>
```

### Exemplo 2: Botão Direto
```tsx
import { QuickRedirectButton } from '@/components/MessageActions';

<QuickRedirectButton
  messageId={message.id}
  messageContent={message.content_text}
  ticketId={ticket.id}
  ticketNumber={ticket.ticket_number}
  organizationId={org.id}
  customerId={customer.id}
  type="move" // ou "copy"
  onSuccess={handleSuccess}
/>
```

### Exemplo 3: Programaticamente (via API)
```typescript
// Mover mensagem
const response = await supabase.functions.invoke('redirect-message', {
  body: {
    messageId: 'uuid-da-mensagem',
    targetTicketId: 'uuid-do-ticket-destino',
    redirectType: 'move',
    redirectReason: 'Assunto relacionado',
  }
});

// Buscar histórico
const { data: history } = await supabase.functions.invoke('redirect-message', {
  method: 'GET',
  body: null,
});
```

### Exemplo 4: Usando o Serviço TypeScript
```typescript
import { getMessageRedirectService } from '@/services/message_redirect_service';

const service = getMessageRedirectService();

// Mover mensagem
await service.moveMessage(
  messageId,
  targetTicketId,
  agentId,
  'Mensagem relacionada ao problema de login'
);

// Copiar mensagem
await service.copyMessage(
  messageId,
  targetTicketId,
  agentId
);

// Buscar histórico
const history = await service.getRedirectHistory(messageId);

// Buscar tickets disponíveis
const tickets = await service.getOpenTicketsForCustomer(
  customerId,
  currentTicketId,
  organizationId
);
```

## 📊 API Endpoints

### POST `/redirect-message?action=redirect`
Redireciona uma mensagem.

**Body:**
```json
{
  "messageId": "uuid",
  "targetTicketId": "uuid",
  "redirectType": "move", // ou "copy"
  "redirectReason": "opcional"
}
```

**Response:**
```json
{
  "success": true,
  "redirect_type": "move",
  "source_ticket_id": "uuid",
  "target_ticket_id": "uuid",
  "message_id": "uuid"
}
```

### GET `/redirect-message?action=history&messageId={uuid}`
Busca histórico de redirecionamentos.

**Response:**
```json
{
  "history": [
    {
      "redirect_id": "uuid",
      "source_ticket_number": 1234,
      "target_ticket_number": 5678,
      "redirect_type": "move",
      "redirected_by_name": "João Silva",
      "redirect_reason": "Assunto relacionado",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### GET `/redirect-message?action=search-tickets`
Busca tickets disponíveis.

**Query Params:**
- `organizationId` (obrigatório)
- `currentTicketId` (obrigatório)
- `customerId` (opcional)
- `q` (termo de busca, opcional)

**Response:**
```json
{
  "tickets": [
    {
      "id": "uuid",
      "ticket_number": 1234,
      "subject": "Problema com login",
      "status": "open",
      "customer": {
        "name": "Cliente XYZ",
        "email": "cliente@email.com"
      }
    }
  ]
}
```

### GET `/redirect-message?action=redirected-messages&ticketId={uuid}`
Busca mensagens redirecionadas de um ticket.

## 🔒 Segurança

### Permissões RLS (Row Level Security)
Adicione políticas RLS para a tabela `message_redirects`:

```sql
-- Permite ver redirecionamentos da própria organização
CREATE POLICY "Users can view redirects from their org"
  ON message_redirects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tickets t
      JOIN agents a ON a.organization_id = t.organization_id
      WHERE t.id IN (source_ticket_id, target_ticket_id)
        AND a.user_id = auth.uid()
    )
  );

-- Permite criar redirecionamentos
CREATE POLICY "Agents can create redirects"
  ON message_redirects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents
      WHERE user_id = auth.uid()
        AND id = redirected_by
    )
  );
```

### Validações
- ✅ Verifica se a mensagem existe
- ✅ Verifica se o ticket de destino existe
- ✅ Impede redirecionar para o mesmo ticket
- ✅ Valida tipo de redirecionamento (move/copy)
- ✅ Registra autor da ação

## 📈 Métricas e Monitoramento

### Queries Úteis

**Total de redirecionamentos por período:**
```sql
SELECT 
  DATE(created_at) as date,
  redirect_type,
  COUNT(*) as total
FROM message_redirects
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), redirect_type
ORDER BY date DESC;
```

**Agentes que mais redirecionam:**
```sql
SELECT 
  a.name,
  COUNT(*) as total_redirects,
  COUNT(CASE WHEN mr.redirect_type = 'move' THEN 1 END) as moves,
  COUNT(CASE WHEN mr.redirect_type = 'copy' THEN 1 END) as copies
FROM message_redirects mr
JOIN agents a ON a.id = mr.redirected_by
WHERE mr.created_at >= NOW() - INTERVAL '30 days'
GROUP BY a.id, a.name
ORDER BY total_redirects DESC
LIMIT 10;
```

**Tickets com mais mensagens redirecionadas:**
```sql
SELECT 
  t.ticket_number,
  t.subject,
  COUNT(*) as redirect_count
FROM message_redirects mr
JOIN tickets t ON t.id = mr.target_ticket_id
GROUP BY t.id, t.ticket_number, t.subject
ORDER BY redirect_count DESC
LIMIT 20;
```

## 🐛 Troubleshooting

### Erro: "Mensagem não encontrada"
- Verifique se o `messageId` está correto
- Confirme que a mensagem não foi excluída

### Erro: "Ticket de destino não encontrado"
- Verifique se o ticket existe
- Confirme que o ticket pertence à mesma organização

### Mensagens não aparecem após redirecionamento
- Verifique os logs da função `redirect_message_to_ticket`
- Confirme que o frontend está atualizando a lista de mensagens
- Execute `SELECT * FROM messages WHERE id = 'uuid'` para verificar o `ticket_id`

### Edge Function não responde
- Verifique se a função foi deployada corretamente
- Confirme as variáveis de ambiente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
- Verifique logs no Supabase Dashboard

## 🔄 Migração de Dados Existentes

Se você já tem mensagens e quer marcar redirecionamentos históricos:

```sql
-- Exemplo: marcar mensagens que foram movidas manualmente
UPDATE messages 
SET is_redirected = true
WHERE id IN (SELECT id FROM suas_mensagens_movidas);
```

## 📝 Changelog

### v1.0.0 (2024-01-15)
- ✅ Implementação inicial
- ✅ Suporte para mover e copiar mensagens
- ✅ Interface de busca e seleção de tickets
- ✅ Histórico de redirecionamentos
- ✅ Mensagens automáticas de notificação
- ✅ Documentação completa

## 🤝 Contribuindo

Para adicionar novas funcionalidades ou melhorias:

1. Crie uma branch: `git checkout -b feature/nova-funcionalidade`
2. Faça suas alterações
3. Teste localmente
4. Envie um PR

## 📞 Suporte

Para dúvidas ou problemas:
- Abra uma issue no repositório
- Entre em contato com a equipe de desenvolvimento

---

**Desenvolvido para Abrefy** 🚀
