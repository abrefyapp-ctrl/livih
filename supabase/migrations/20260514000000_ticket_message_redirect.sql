-- ============================================================================
-- Migração: Redirecionamento de mensagens entre tickets
-- Descrição: Adiciona funcionalidade para mover/copiar mensagens entre tickets
-- ============================================================================

-- Tabela para registrar histórico de redirecionamentos
CREATE TABLE IF NOT EXISTS message_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  source_ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  target_ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  redirect_type VARCHAR(20) NOT NULL CHECK (redirect_type IN ('move', 'copy')),
  redirected_by UUID REFERENCES agents(id),
  redirect_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Índices para performance
  CONSTRAINT message_redirects_unique UNIQUE(message_id, target_ticket_id)
);

-- Índices para otimizar consultas
CREATE INDEX idx_message_redirects_message_id ON message_redirects(message_id);
CREATE INDEX idx_message_redirects_source_ticket ON message_redirects(source_ticket_id);
CREATE INDEX idx_message_redirects_target_ticket ON message_redirects(target_ticket_id);
CREATE INDEX idx_message_redirects_created_at ON message_redirects(created_at DESC);

-- Adicionar campo opcional para rastrear mensagem original (útil para cópias)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS original_message_id UUID REFERENCES messages(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_redirected BOOLEAN DEFAULT false;

-- Função para redirecionar mensagem (move ou copia)
CREATE OR REPLACE FUNCTION redirect_message_to_ticket(
  p_message_id UUID,
  p_target_ticket_id UUID,
  p_redirect_type VARCHAR(20) DEFAULT 'move',
  p_redirected_by UUID DEFAULT NULL,
  p_redirect_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source_ticket_id UUID;
  v_new_message_id UUID;
  v_message_data RECORD;
  v_result JSON;
BEGIN
  -- Validar tipo de redirecionamento
  IF p_redirect_type NOT IN ('move', 'copy') THEN
    RAISE EXCEPTION 'Tipo de redirecionamento inválido. Use "move" ou "copy".';
  END IF;

  -- Buscar informações da mensagem original
  SELECT 
    ticket_id,
    sender_type,
    content_text,
    content_type,
    content_url,
    content_caption,
    file_name,
    file_mime,
    file_size,
    whatsapp_message_id,
    status,
    sender_phone,
    sender_name,
    organization_id,
    quoted_message_id
  INTO v_message_data
  FROM messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem não encontrada: %', p_message_id;
  END IF;

  v_source_ticket_id := v_message_data.ticket_id;

  -- Verificar se o ticket de destino existe
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id = p_target_ticket_id) THEN
    RAISE EXCEPTION 'Ticket de destino não encontrado: %', p_target_ticket_id;
  END IF;

  -- Verificar se não está tentando redirecionar para o mesmo ticket
  IF v_source_ticket_id = p_target_ticket_id THEN
    RAISE EXCEPTION 'Não é possível redirecionar mensagem para o mesmo ticket';
  END IF;

  -- Processar baseado no tipo
  IF p_redirect_type = 'move' THEN
    -- MOVER: atualizar ticket_id da mensagem original
    UPDATE messages
    SET 
      ticket_id = p_target_ticket_id,
      is_redirected = true,
      updated_at = now()
    WHERE id = p_message_id;

    v_new_message_id := p_message_id;

  ELSIF p_redirect_type = 'copy' THEN
    -- COPIAR: criar nova mensagem no ticket de destino
    INSERT INTO messages (
      ticket_id,
      sender_type,
      content_text,
      content_type,
      content_url,
      content_caption,
      file_name,
      file_mime,
      file_size,
      whatsapp_message_id,
      status,
      sender_phone,
      sender_name,
      organization_id,
      original_message_id,
      is_redirected,
      quoted_message_id
    ) VALUES (
      p_target_ticket_id,
      v_message_data.sender_type,
      v_message_data.content_text,
      v_message_data.content_type,
      v_message_data.content_url,
      v_message_data.content_caption,
      v_message_data.file_name,
      v_message_data.file_mime,
      v_message_data.file_size,
      NULL, -- não copiar whatsapp_message_id para evitar conflitos
      v_message_data.status,
      v_message_data.sender_phone,
      v_message_data.sender_name,
      v_message_data.organization_id,
      p_message_id, -- referência à mensagem original
      true,
      v_message_data.quoted_message_id
    )
    RETURNING id INTO v_new_message_id;
  END IF;

  -- Registrar o redirecionamento
  INSERT INTO message_redirects (
    message_id,
    source_ticket_id,
    target_ticket_id,
    redirect_type,
    redirected_by,
    redirect_reason
  ) VALUES (
    v_new_message_id,
    v_source_ticket_id,
    p_target_ticket_id,
    p_redirect_type,
    p_redirected_by,
    p_redirect_reason
  );

  -- Criar nota automática no ticket de origem (se for MOVE)
  IF p_redirect_type = 'move' THEN
    INSERT INTO messages (
      ticket_id,
      sender_type,
      content_text,
      content_type,
      status,
      organization_id
    ) VALUES (
      v_source_ticket_id,
      'system',
      format('Mensagem redirecionada para o ticket #%s', 
        (SELECT ticket_number FROM tickets WHERE id = p_target_ticket_id)),
      'conversation',
      'sent',
      v_message_data.organization_id
    );
  END IF;

  -- Criar nota automática no ticket de destino
  INSERT INTO messages (
    ticket_id,
    sender_type,
    content_text,
    content_type,
    status,
    organization_id
  ) VALUES (
    p_target_ticket_id,
    'system',
    format('Mensagem %s do ticket #%s%s',
      CASE WHEN p_redirect_type = 'move' THEN 'movida' ELSE 'copiada' END,
      (SELECT ticket_number FROM tickets WHERE id = v_source_ticket_id),
      CASE WHEN p_redirect_reason IS NOT NULL THEN ': ' || p_redirect_reason ELSE '' END
    ),
    'conversation',
    'sent',
    v_message_data.organization_id
  );

  -- Atualizar timestamp do ticket de destino
  UPDATE tickets
  SET updated_at = now()
  WHERE id = p_target_ticket_id;

  -- Retornar resultado
  SELECT json_build_object(
    'success', true,
    'redirect_type', p_redirect_type,
    'source_ticket_id', v_source_ticket_id,
    'target_ticket_id', p_target_ticket_id,
    'message_id', v_new_message_id,
    'original_message_id', CASE WHEN p_redirect_type = 'copy' THEN p_message_id ELSE NULL END
  ) INTO v_result;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro ao redirecionar mensagem: %', SQLERRM;
END;
$$;

-- Função para obter histórico de redirecionamentos de uma mensagem
CREATE OR REPLACE FUNCTION get_message_redirect_history(p_message_id UUID)
RETURNS TABLE (
  redirect_id UUID,
  source_ticket_number INTEGER,
  target_ticket_number INTEGER,
  redirect_type VARCHAR(20),
  redirected_by_name TEXT,
  redirect_reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mr.id,
    st.ticket_number,
    tt.ticket_number,
    mr.redirect_type,
    a.name,
    mr.redirect_reason,
    mr.created_at
  FROM message_redirects mr
  LEFT JOIN tickets st ON st.id = mr.source_ticket_id
  LEFT JOIN tickets tt ON tt.id = mr.target_ticket_id
  LEFT JOIN agents a ON a.id = mr.redirected_by
  WHERE mr.message_id = p_message_id
  ORDER BY mr.created_at DESC;
END;
$$;

-- View para facilitar consultas de mensagens redirecionadas
CREATE OR REPLACE VIEW v_redirected_messages AS
SELECT
  m.id AS message_id,
  m.ticket_id,
  t.ticket_number,
  m.content_text,
  m.sender_type,
  m.created_at AS message_created_at,
  m.is_redirected,
  m.original_message_id,
  mr.source_ticket_id,
  st.ticket_number AS source_ticket_number,
  mr.redirect_type,
  mr.redirect_reason,
  mr.redirected_by,
  a.name AS redirected_by_name,
  mr.created_at AS redirected_at
FROM messages m
LEFT JOIN message_redirects mr ON mr.message_id = m.id
LEFT JOIN tickets t ON t.id = m.ticket_id
LEFT JOIN tickets st ON st.id = mr.source_ticket_id
LEFT JOIN agents a ON a.id = mr.redirected_by
WHERE m.is_redirected = true;

-- Comentários para documentação
COMMENT ON TABLE message_redirects IS 'Histórico de redirecionamentos de mensagens entre tickets';
COMMENT ON COLUMN message_redirects.redirect_type IS 'Tipo de redirecionamento: move (mover) ou copy (copiar)';
COMMENT ON FUNCTION redirect_message_to_ticket IS 'Redireciona uma mensagem para outro ticket (move ou copy)';
COMMENT ON FUNCTION get_message_redirect_history IS 'Retorna histórico de redirecionamentos de uma mensagem';
