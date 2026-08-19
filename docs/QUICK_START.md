# 🚀 Guia Rápido de Implementação - Redirecionamento de Mensagens

## Passos para Implementação em 5 Minutos

### 1️⃣ Executar Migração SQL (2 minutos)

**Opção A: Via Supabase Dashboard**
1. Acesse https://app.supabase.com/project/SEU_PROJECT/sql
2. Cole o conteúdo de `005_ticket_message_redirect.sql`
3. Clique em "Run"

**Opção B: Via CLI**
```bash
supabase db push
```

**Verificar instalação:**
```sql
-- Deve retornar a tabela
SELECT * FROM message_redirects LIMIT 1;

-- Deve retornar a função
SELECT proname FROM pg_proc WHERE proname = 'redirect_message_to_ticket';
```

### 2️⃣ Deploy da Edge Function (1 minuto)

**Opção A: Via Supabase CLI**
```bash
# Criar diretório se não existir
mkdir -p supabase/functions/redirect-message

# Copiar arquivo
cp redirect_message_function.ts supabase/functions/redirect-message/index.ts

# Deploy
supabase functions deploy redirect-message
```

**Opção B: Via Dashboard**
1. Acesse Functions no dashboard
2. Crie nova função "redirect-message"
3. Cole o código de `redirect_message_function.ts`
4. Deploy

**Verificar instalação:**
```bash
curl -X GET \
  'https://SEU_PROJECT.supabase.co/functions/v1/redirect-message?action=search-tickets&organizationId=uuid&currentTicketId=uuid' \
  -H "Authorization: Bearer SEU_ANON_KEY"
```

### 3️⃣ Adicionar Componentes React (2 minutos)

```bash
# Copiar componentes para o projeto
cp MessageRedirectDialog.tsx src/components/
cp MessageActions.tsx src/components/

# Instalar dependências se necessário
npm install lucide-react sonner
```

**Verificar imports:**
```tsx
// Ajuste os imports conforme sua estrutura
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
// ... etc
```

### 4️⃣ Integrar com seu Código (variável)

**Exemplo mínimo - adicione ao componente de mensagens:**

```tsx
import { MessageActions } from '@/components/MessageActions';

// Dentro do seu componente de mensagem:
<div className="message">
  {/* seu conteúdo existente */}
  
  <MessageActions
    message={message}
    ticketId={ticket.id}
    ticketNumber={ticket.ticket_number}
    organizationId={organizationId}
    customerId={customer?.id}
    onSuccess={() => {
      // Atualizar mensagens
      refetchMessages();
    }}
  />
</div>
```

**Pronto!** 🎉 A funcionalidade já está disponível.

---

## Checklist Pós-Instalação

### ✅ Verificações Técnicas

- [ ] Tabela `message_redirects` criada
- [ ] Colunas `original_message_id` e `is_redirected` adicionadas em `messages`
- [ ] Função `redirect_message_to_ticket` disponível
- [ ] Função `get_message_redirect_history` disponível
- [ ] View `v_redirected_messages` criada
- [ ] Edge Function deployada e acessível
- [ ] Componentes React compilando sem erros
- [ ] Imports das UI libs funcionando

### ✅ Testes Funcionais

**Teste 1: Mover Mensagem**
1. Abra um ticket com mensagens
2. Clique no menu de ações (...)
3. Selecione "Mover para outro ticket"
4. Escolha um ticket de destino
5. Confirme
6. Verifique:
   - [ ] Mensagem sumiu do ticket original
   - [ ] Mensagem apareceu no ticket destino
   - [ ] Nota automática criada em ambos os tickets

**Teste 2: Copiar Mensagem**
1. Abra um ticket com mensagens
2. Clique no menu de ações (...)
3. Selecione "Copiar para outro ticket"
4. Escolha um ticket de destino
5. Confirme
6. Verifique:
   - [ ] Mensagem permanece no ticket original
   - [ ] Cópia criada no ticket destino
   - [ ] Badge "Mensagem Redirecionada" aparece

**Teste 3: Busca de Tickets**
1. Abra o dialog de redirecionamento
2. Digite um número de ticket na busca
3. Verifique se encontra
4. Teste busca por assunto
5. Alterne entre "Tickets deste cliente" e "Todos os tickets"

**Teste 4: Histórico**
```sql
-- Executar no SQL Editor
SELECT * FROM get_message_redirect_history('uuid-de-uma-mensagem-redirecionada');
```
Deve retornar o histórico completo.

---

## Troubleshooting Rápido

### Problema: "Função não encontrada"
```sql
-- Verificar se função existe
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name LIKE '%redirect%';

-- Se não existir, execute a migração novamente
```

### Problema: "Edge Function não responde"
```bash
# Ver logs
supabase functions logs redirect-message

# Verificar variáveis de ambiente
supabase secrets list
```

### Problema: "Componentes não aparecem"
```tsx
// Verifique se os componentes shadcn/ui estão instalados
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
// ... etc
```

### Problema: "Não consigo ver os tickets"
```tsx
// Verificar se organizationId está sendo passado
console.log('Organization ID:', organizationId);

// Verificar permissões RLS
-- No SQL Editor:
SELECT * FROM tickets 
WHERE organization_id = 'seu-org-id' 
AND status IN ('open', 'in_progress', 'pending');
```

---

## Próximos Passos Opcionais

### 🎨 Personalização Visual
- Customize cores e estilos dos componentes
- Adicione animações
- Adapte ao tema do seu sistema

### 📊 Analytics
```sql
-- Criar view de métricas
CREATE VIEW redirect_metrics AS
SELECT 
  DATE(created_at) as date,
  redirect_type,
  COUNT(*) as total
FROM message_redirects
GROUP BY DATE(created_at), redirect_type;
```

### 🔔 Notificações
- Adicione toast notifications
- Envie emails para agentes envolvidos
- Crie notificações in-app

### 🔐 Permissões Granulares
```sql
-- Permitir apenas certos roles redirecionarem
ALTER TABLE message_redirects 
ADD COLUMN required_role VARCHAR(50);

-- Adicionar validação na função
-- ... (ver documentação completa)
```

### 📱 Versão Mobile
- Adapte o dialog para telas menores
- Crie swipe actions
- Otimize a lista de tickets

---

## Recursos Adicionais

- 📖 [Documentação Completa](README_MESSAGE_REDIRECT.md)
- 💻 [Exemplos de Código](INTEGRATION_EXAMPLES.tsx)
- 🔧 [Serviço TypeScript](message_redirect_service.ts)
- 🗄️ [Migração SQL](005_ticket_message_redirect.sql)

---

## Suporte

**Dúvidas?**
1. Verifique a documentação completa
2. Consulte os exemplos de código
3. Abra uma issue no repositório

**Encontrou um bug?**
1. Verifique os logs: `supabase functions logs redirect-message`
2. Teste a função SQL diretamente
3. Reporte com detalhes e logs

---

**Bom trabalho! 🚀**
