export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admins_plataforma: {
        Row: {
          criado_em: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          user_id: string
        }
        Update: {
          criado_em?: string
          user_id?: string
        }
        Relationships: []
      }
      agentes: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          canal_id: string
          horario: Json | null
          id: string
          mensagem_fora_horario: string | null
          modelo: string
          nome: string
          org_id: string
          prompt: string
          regras_humano: Json
          telefone_alerta: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          canal_id: string
          horario?: Json | null
          id?: string
          mensagem_fora_horario?: string | null
          modelo?: string
          nome?: string
          org_id: string
          prompt?: string
          regras_humano?: Json
          telefone_alerta?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          canal_id?: string
          horario?: Json | null
          id?: string
          mensagem_fora_horario?: string | null
          modelo?: string
          nome?: string
          org_id?: string
          prompt?: string
          regras_humano?: Json
          telefone_alerta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agentes_canal_id_org_id_fkey"
            columns: ["canal_id", "org_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      alertas: {
        Row: {
          canal_id: string
          conversa_id: string | null
          criado_em: string
          enviado_em: string | null
          erro: string | null
          id: number
          org_id: string
          proxima_tentativa_em: string
          status: Database["public"]["Enums"]["status_fila"]
          telefone: string
          tentativas: number
          texto: string
        }
        Insert: {
          canal_id: string
          conversa_id?: string | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: never
          org_id: string
          proxima_tentativa_em?: string
          status?: Database["public"]["Enums"]["status_fila"]
          telefone: string
          tentativas?: number
          texto: string
        }
        Update: {
          canal_id?: string
          conversa_id?: string | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: never
          org_id?: string
          proxima_tentativa_em?: string
          status?: Database["public"]["Enums"]["status_fila"]
          telefone?: string
          tentativas?: number
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          antes: Json | null
          ator_id: string | null
          ator_tipo: Database["public"]["Enums"]["autor_tipo"]
          criado_em: string
          depois: Json | null
          entidade: string
          entidade_id: string | null
          id: number
          org_id: string | null
        }
        Insert: {
          acao: string
          antes?: Json | null
          ator_id?: string | null
          ator_tipo: Database["public"]["Enums"]["autor_tipo"]
          criado_em?: string
          depois?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: never
          org_id?: string | null
        }
        Update: {
          acao?: string
          antes?: Json | null
          ator_id?: string | null
          ator_tipo?: Database["public"]["Enums"]["autor_tipo"]
          criado_em?: string
          depois?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: never
          org_id?: string | null
        }
        Relationships: []
      }
      base_conhecimento: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          conteudo: string
          id: string
          org_id: string
          titulo: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          conteudo: string
          id?: string
          org_id: string
          titulo: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          conteudo?: string
          id?: string
          org_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "base_conhecimento_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      canais: {
        Row: {
          alerta_queda_em: string | null
          ativo: boolean
          caiu_em: string | null
          conectado_em: string | null
          criado_em: string
          desconectado_em: string | null
          desconectado_por: string | null
          id: string
          instance_id: string | null
          nome: string
          numero_conectado: string | null
          org_id: string
          responsavel_id: string | null
          status_atualizado_em: string | null
          status_conexao: string | null
          telefone: string | null
          tipo: string
          vault_token_id: string | null
          webhook_segredo_hash: string | null
        }
        Insert: {
          alerta_queda_em?: string | null
          ativo?: boolean
          caiu_em?: string | null
          conectado_em?: string | null
          criado_em?: string
          desconectado_em?: string | null
          desconectado_por?: string | null
          id?: string
          instance_id?: string | null
          nome: string
          numero_conectado?: string | null
          org_id: string
          responsavel_id?: string | null
          status_atualizado_em?: string | null
          status_conexao?: string | null
          telefone?: string | null
          tipo?: string
          vault_token_id?: string | null
          webhook_segredo_hash?: string | null
        }
        Update: {
          alerta_queda_em?: string | null
          ativo?: boolean
          caiu_em?: string | null
          conectado_em?: string | null
          criado_em?: string
          desconectado_em?: string | null
          desconectado_por?: string | null
          id?: string
          instance_id?: string | null
          nome?: string
          numero_conectado?: string | null
          org_id?: string
          responsavel_id?: string | null
          status_atualizado_em?: string | null
          status_conexao?: string | null
          telefone?: string | null
          tipo?: string
          vault_token_id?: string | null
          webhook_segredo_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canais_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          atualizado_em: string
          criado_em: string
          dados: Json
          email: string | null
          empresa: string | null
          id: string
          nome: string | null
          nome_whatsapp: string | null
          org_id: string
          origem: string | null
          responsavel_id: string | null
          tags: string[]
          telefone: string | null
          whatsapp_lid: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          dados?: Json
          email?: string | null
          empresa?: string | null
          id?: string
          nome?: string | null
          nome_whatsapp?: string | null
          org_id: string
          origem?: string | null
          responsavel_id?: string | null
          tags?: string[]
          telefone?: string | null
          whatsapp_lid?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          dados?: Json
          email?: string | null
          empresa?: string | null
          id?: string
          nome?: string | null
          nome_whatsapp?: string | null
          org_id?: string
          origem?: string | null
          responsavel_id?: string | null
          tags?: string[]
          telefone?: string | null
          whatsapp_lid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas: {
        Row: {
          atribuida_a: string | null
          canal_id: string
          contato_id: string
          criado_em: string
          estado: Database["public"]["Enums"]["estado_conversa"]
          id: string
          motivo_humano: string | null
          nao_lidas: number
          org_id: string
          ultima_mensagem_em: string | null
          ultima_mensagem_resumo: string | null
        }
        Insert: {
          atribuida_a?: string | null
          canal_id: string
          contato_id: string
          criado_em?: string
          estado?: Database["public"]["Enums"]["estado_conversa"]
          id?: string
          motivo_humano?: string | null
          nao_lidas?: number
          org_id: string
          ultima_mensagem_em?: string | null
          ultima_mensagem_resumo?: string | null
        }
        Update: {
          atribuida_a?: string | null
          canal_id?: string
          contato_id?: string
          criado_em?: string
          estado?: Database["public"]["Enums"]["estado_conversa"]
          id?: string
          motivo_humano?: string | null
          nao_lidas?: number
          org_id?: string
          ultima_mensagem_em?: string | null
          ultima_mensagem_resumo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_canal_id_org_id_fkey"
            columns: ["canal_id", "org_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "conversas_contato_id_org_id_fkey"
            columns: ["contato_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      etapas_funil: {
        Row: {
          cor: string | null
          id: string
          nome: string
          ordem: number
          org_id: string
          tipo: Database["public"]["Enums"]["tipo_etapa"]
        }
        Insert: {
          cor?: string | null
          id?: string
          nome: string
          ordem: number
          org_id: string
          tipo?: Database["public"]["Enums"]["tipo_etapa"]
        }
        Update: {
          cor?: string | null
          id?: string
          nome?: string
          ordem?: number
          org_id?: string
          tipo?: Database["public"]["Enums"]["tipo_etapa"]
        }
        Relationships: [
          {
            foreignKeyName: "etapas_funil_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_recebidos: {
        Row: {
          canal_id: string
          erro: string | null
          id: number
          payload: Json
          processado_em: string | null
          recebido_em: string
          wa_id: string
        }
        Insert: {
          canal_id: string
          erro?: string | null
          id?: never
          payload: Json
          processado_em?: string | null
          recebido_em?: string
          wa_id: string
        }
        Update: {
          canal_id?: string
          erro?: string | null
          id?: never
          payload?: Json
          processado_em?: string | null
          recebido_em?: string
          wa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_recebidos_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id"]
          },
        ]
      }
      fila_envio: {
        Row: {
          conversa_id: string
          criado_em: string
          enviado_em: string | null
          erro: string | null
          id: number
          mensagem_id: string
          org_id: string
          proxima_tentativa_em: string
          status: Database["public"]["Enums"]["status_fila"]
          tentativas: number
        }
        Insert: {
          conversa_id: string
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: never
          mensagem_id: string
          org_id: string
          proxima_tentativa_em?: string
          status?: Database["public"]["Enums"]["status_fila"]
          tentativas?: number
        }
        Update: {
          conversa_id?: string
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: never
          mensagem_id?: string
          org_id?: string
          proxima_tentativa_em?: string
          status?: Database["public"]["Enums"]["status_fila"]
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "fila_envio_conversa_id_org_id_fkey"
            columns: ["conversa_id", "org_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "fila_envio_mensagem_id_org_id_fkey"
            columns: ["mensagem_id", "org_id"]
            isOneToOne: false
            referencedRelation: "mensagens"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      membros_org: {
        Row: {
          ativo: boolean
          criado_em: string
          org_id: string
          papel: Database["public"]["Enums"]["papel_org"]
          user_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          org_id: string
          papel?: Database["public"]["Enums"]["papel_org"]
          user_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          org_id?: string
          papel?: Database["public"]["Enums"]["papel_org"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membros_org_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          autor_id: string | null
          autor_tipo: Database["public"]["Enums"]["autor_tipo"]
          conversa_id: string
          criado_em: string
          direcao: Database["public"]["Enums"]["direcao_msg"]
          erro: string | null
          id: string
          midia_mime: string | null
          midia_path: string | null
          org_id: string
          status_entrega: Database["public"]["Enums"]["status_entrega"]
          texto: string | null
          tipo: Database["public"]["Enums"]["tipo_msg"]
          transcricao: string | null
          wa_id: string | null
        }
        Insert: {
          autor_id?: string | null
          autor_tipo: Database["public"]["Enums"]["autor_tipo"]
          conversa_id: string
          criado_em?: string
          direcao: Database["public"]["Enums"]["direcao_msg"]
          erro?: string | null
          id?: string
          midia_mime?: string | null
          midia_path?: string | null
          org_id: string
          status_entrega: Database["public"]["Enums"]["status_entrega"]
          texto?: string | null
          tipo?: Database["public"]["Enums"]["tipo_msg"]
          transcricao?: string | null
          wa_id?: string | null
        }
        Update: {
          autor_id?: string | null
          autor_tipo?: Database["public"]["Enums"]["autor_tipo"]
          conversa_id?: string
          criado_em?: string
          direcao?: Database["public"]["Enums"]["direcao_msg"]
          erro?: string | null
          id?: string
          midia_mime?: string | null
          midia_path?: string | null
          org_id?: string
          status_entrega?: Database["public"]["Enums"]["status_entrega"]
          texto?: string | null
          tipo?: Database["public"]["Enums"]["tipo_msg"]
          transcricao?: string | null
          wa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_conversa_id_org_id_fkey"
            columns: ["conversa_id", "org_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      notas: {
        Row: {
          autor_id: string | null
          autor_tipo: Database["public"]["Enums"]["autor_tipo"]
          contato_id: string | null
          conversa_id: string | null
          criado_em: string
          id: string
          org_id: string
          texto: string
        }
        Insert: {
          autor_id?: string | null
          autor_tipo?: Database["public"]["Enums"]["autor_tipo"]
          contato_id?: string | null
          conversa_id?: string | null
          criado_em?: string
          id?: string
          org_id: string
          texto: string
        }
        Update: {
          autor_id?: string | null
          autor_tipo?: Database["public"]["Enums"]["autor_tipo"]
          contato_id?: string | null
          conversa_id?: string | null
          criado_em?: string
          id?: string
          org_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_contato_id_org_id_fkey"
            columns: ["contato_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "notas_conversa_id_org_id_fkey"
            columns: ["conversa_id", "org_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      oportunidade_historico: {
        Row: {
          autor_id: string | null
          autor_tipo: Database["public"]["Enums"]["autor_tipo"]
          criado_em: string
          etapa_de: string | null
          etapa_para: string | null
          id: number
          oportunidade_id: string
          org_id: string
        }
        Insert: {
          autor_id?: string | null
          autor_tipo: Database["public"]["Enums"]["autor_tipo"]
          criado_em?: string
          etapa_de?: string | null
          etapa_para?: string | null
          id?: never
          oportunidade_id: string
          org_id: string
        }
        Update: {
          autor_id?: string | null
          autor_tipo?: Database["public"]["Enums"]["autor_tipo"]
          criado_em?: string
          etapa_de?: string | null
          etapa_para?: string | null
          id?: never
          oportunidade_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oportunidade_historico_etapa_de_fkey"
            columns: ["etapa_de"]
            isOneToOne: false
            referencedRelation: "etapas_funil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_historico_etapa_para_fkey"
            columns: ["etapa_para"]
            isOneToOne: false
            referencedRelation: "etapas_funil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_historico_oportunidade_id_org_id_fkey"
            columns: ["oportunidade_id", "org_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      oportunidades: {
        Row: {
          atualizado_em: string
          contato_id: string
          criado_em: string
          etapa_id: string
          fechada_em: string | null
          id: string
          motivo_perda: string | null
          org_id: string
          origem: string | null
          responsavel_id: string | null
          resumo: string | null
          titulo: string
          valor_estimado: number | null
        }
        Insert: {
          atualizado_em?: string
          contato_id: string
          criado_em?: string
          etapa_id: string
          fechada_em?: string | null
          id?: string
          motivo_perda?: string | null
          org_id: string
          origem?: string | null
          responsavel_id?: string | null
          resumo?: string | null
          titulo: string
          valor_estimado?: number | null
        }
        Update: {
          atualizado_em?: string
          contato_id?: string
          criado_em?: string
          etapa_id?: string
          fechada_em?: string | null
          id?: string
          motivo_perda?: string | null
          org_id?: string
          origem?: string | null
          responsavel_id?: string | null
          resumo?: string | null
          titulo?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_contato_id_org_id_fkey"
            columns: ["contato_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_id_org_id_fkey"
            columns: ["etapa_id", "org_id"]
            isOneToOne: false
            referencedRelation: "etapas_funil"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      organizacoes: {
        Row: {
          criado_em: string
          id: string
          nome: string
          plano: string
          slug: string
          status: string
        }
        Insert: {
          criado_em?: string
          id?: string
          nome: string
          plano?: string
          slug: string
          status?: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome?: string
          plano?: string
          slug?: string
          status?: string
        }
        Relationships: []
      }
      pedidos_acesso: {
        Row: {
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          email: string
          empresa: string
          id: string
          mensagem: string | null
          nome: string
          org_id: string | null
          status: string
          telefone: string | null
        }
        Insert: {
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          email: string
          empresa: string
          id?: string
          mensagem?: string | null
          nome: string
          org_id?: string | null
          status?: string
          telefone?: string | null
        }
        Update: {
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          email?: string
          empresa?: string
          id?: string
          mensagem?: string | null
          nome?: string
          org_id?: string | null
          status?: string
          telefone?: string | null
        }
        Relationships: []
      }
      perfis: {
        Row: {
          avatar_url: string | null
          criado_em: string
          nome: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          criado_em?: string
          nome?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          criado_em?: string
          nome?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plataforma_config: {
        Row: {
          canal_alertas: string | null
          id: number
        }
        Insert: {
          canal_alertas?: string | null
          id?: number
        }
        Update: {
          canal_alertas?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "plataforma_config_canal_alertas_fkey"
            columns: ["canal_alertas"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agente_atualizar_contato: {
        Args: { p_conversa: string; p_dados: Json }
        Returns: Json
      }
      agente_chamar_humano: {
        Args: { p_conversa: string; p_motivo: string }
        Returns: Json
      }
      agente_contexto: {
        Args: { p_conversa: string; p_limite?: number }
        Returns: Json
      }
      agente_deve_responder: {
        Args: { p_conversa: string; p_mensagem: string }
        Returns: boolean
      }
      agente_marcar: { Args: never; Returns: undefined }
      agente_mover_etapa: {
        Args: { p_conversa: string; p_etapa: string }
        Returns: Json
      }
      agente_nota: {
        Args: { p_conversa: string; p_texto: string }
        Returns: Json
      }
      agente_registrar_oportunidade: {
        Args: { p_conversa: string; p_resumo: string; p_titulo: string }
        Returns: Json
      }
      agente_responder: {
        Args: { p_conversa: string; p_mensagem: string; p_texto: string }
        Returns: Json
      }
      agente_suspeita_robo: { Args: { p_conversa: string }; Returns: string }
      alerta_resultado: {
        Args: { p_alerta: number; p_erro?: string; p_ok: boolean }
        Returns: undefined
      }
      alertas_reivindicar: {
        Args: { p_limite?: number }
        Returns: {
          alerta_id: number
          canal_tipo: string
          instance_id: string
          telefone: string
          texto: string
        }[]
      }
      auditar: {
        Args: {
          p_acao: string
          p_antes: Json
          p_depois: Json
          p_entidade: string
          p_id: string
          p_org: string
        }
        Returns: undefined
      }
      autor_atual: {
        Args: never
        Returns: Database["public"]["Enums"]["autor_tipo"]
      }
      canal_atualizar_status: {
        Args: { p_canal: string; p_numero?: string; p_status: string }
        Returns: undefined
      }
      canal_por_webhook: {
        Args: { p_canal: string; p_segredo: string }
        Returns: {
          canal_id: string
          instance_id: string
          org_id: string
          tipo: string
        }[]
      }
      canal_token: { Args: { p_canal: string }; Returns: string }
      chamar_funcao: {
        Args: { p_corpo?: Json; p_funcao: string }
        Returns: number
      }
      contato_por_whatsapp: {
        Args: {
          p_lid: string
          p_nome_whatsapp: string
          p_org: string
          p_telefone: string
        }
        Returns: string
      }
      criar_organizacao: {
        Args: { p_dono?: string; p_nome: string; p_slug: string }
        Returns: string
      }
      definir_token_canal: {
        Args: { p_canal: string; p_token: string }
        Returns: undefined
      }
      eh_admin_plataforma: { Args: never; Returns: boolean }
      eh_membro: { Args: { p_org: string }; Returns: boolean }
      enfileirar_saida: {
        Args: {
          p_autor: Database["public"]["Enums"]["autor_tipo"]
          p_autor_id: string
          p_conversa: string
          p_texto: string
        }
        Returns: string
      }
      enviar_mensagem: {
        Args: { p_conversa: string; p_texto: string }
        Returns: string
      }
      org_primeiros_passos: {
        Args: { p_org: string }
        Returns: {
          agente_ligado: boolean
          base: boolean
          equipe: boolean
          instrucoes: boolean
          whatsapp: boolean
        }[]
      }
      plataforma_criar_empresa: { Args: { p_nome: string }; Returns: string }
      plataforma_definir_status: {
        Args: { p_org: string; p_status: string }
        Returns: undefined
      }
      plataforma_empresas: {
        Args: never
        Returns: {
          conversas_30d: number
          criado_em: string
          dono_email: string
          dono_nome: string
          dono_senha_definida: boolean
          id: string
          membros: number
          nome: string
          numeros: number
          numeros_conectados: number
          slug: string
          status: string
          ultima_mensagem_em: string
        }[]
      }
      equipe_listar: {
        Args: { p_org: string }
        Returns: {
          ativo: boolean
          criado_em: string
          email: string
          nome: string
          papel: Database["public"]["Enums"]["papel_org"]
          senha_definida: boolean
          ultimo_acesso: string
          user_id: string
        }[]
      }
      fila_manutencao: { Args: never; Returns: undefined }
      fila_reivindicar: {
        Args: { p_limite?: number }
        Returns: {
          canal_id: string
          canal_tipo: string
          fila_id: number
          instance_id: string
          mensagem_id: string
          telefone: string
          tentativas: number
          texto: string
          whatsapp_lid: string
        }[]
      }
      fila_resultado: {
        Args: {
          p_erro?: string
          p_fila: number
          p_ok: boolean
          p_wa_id?: string
        }
        Returns: undefined
      }
      gerar_segredo_webhook: { Args: { p_canal: string }; Returns: string }
      pode_ver_canal: { Args: { p_canal: string }; Returns: boolean }
      pode_ver_conversa: { Args: { p_conversa: string }; Returns: boolean }
      registrar_entrada: {
        Args: {
          p_canal: string
          p_lid: string
          p_midia_mime?: string
          p_nome_whatsapp: string
          p_payload: Json
          p_telefone: string
          p_texto: string
          p_tipo: Database["public"]["Enums"]["tipo_msg"]
          p_transcricao?: string
          p_wa_id: string
        }
        Returns: Json
      }
      registrar_saida_celular: {
        Args: {
          p_canal: string
          p_lid: string
          p_payload: Json
          p_telefone: string
          p_texto: string
          p_tipo: Database["public"]["Enums"]["tipo_msg"]
          p_wa_id: string
        }
        Returns: Json
      }
      registrar_status_canal: {
        Args: { p_canal: string; p_status: string }
        Returns: undefined
      }
      registrar_status_entrega: {
        Args: {
          p_canal: string
          p_status: Database["public"]["Enums"]["status_entrega"]
          p_wa_id: string
        }
        Returns: undefined
      }
      registrar_transcricao: {
        Args: { p_mensagem: string; p_transcricao: string }
        Returns: Json
      }
      tem_papel: {
        Args: {
          p_org: string
          p_papeis: Database["public"]["Enums"]["papel_org"][]
        }
        Returns: boolean
      }
      usuario_por_email: {
        Args: { p_email: string }
        Returns: {
          id: string
          senha_definida: boolean
        }[]
      }
      verificar_segredo_interno: {
        Args: { p_segredo: string }
        Returns: boolean
      }
    }
    Enums: {
      autor_tipo: "contato" | "atendente" | "bot" | "sistema"
      direcao_msg: "entrada" | "saida"
      estado_conversa: "bot" | "aguardando_humano" | "humano" | "encerrada"
      papel_org: "dono" | "admin" | "atendente"
      status_entrega:
        | "recebida"
        | "pendente"
        | "enviada"
        | "entregue"
        | "lida"
        | "erro"
      status_fila: "pendente" | "enviando" | "enviada" | "erro"
      tipo_etapa: "aberta" | "ganho" | "perdido"
      tipo_msg:
        | "texto"
        | "audio"
        | "imagem"
        | "video"
        | "documento"
        | "figurinha"
        | "localizacao"
        | "contato"
        | "outro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      autor_tipo: ["contato", "atendente", "bot", "sistema"],
      direcao_msg: ["entrada", "saida"],
      estado_conversa: ["bot", "aguardando_humano", "humano", "encerrada"],
      papel_org: ["dono", "admin", "atendente"],
      status_entrega: [
        "recebida",
        "pendente",
        "enviada",
        "entregue",
        "lida",
        "erro",
      ],
      status_fila: ["pendente", "enviando", "enviada", "erro"],
      tipo_etapa: ["aberta", "ganho", "perdido"],
      tipo_msg: [
        "texto",
        "audio",
        "imagem",
        "video",
        "documento",
        "figurinha",
        "localizacao",
        "contato",
        "outro",
      ],
    },
  },
} as const
