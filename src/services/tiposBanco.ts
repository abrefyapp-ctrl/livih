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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          ativado_em: string | null
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
          saudacao: string | null
          telefone_alerta: string | null
        }
        Insert: {
          ativado_em?: string | null
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
          saudacao?: string | null
          telefone_alerta?: string | null
        }
        Update: {
          ativado_em?: string | null
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
          saudacao?: string | null
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
      assistente_sessoes: {
        Row: {
          anterior: Json | null
          aplicada_em: string | null
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          erro: string | null
          id: string
          mensagens: Json
          modo: string
          org_id: string
          proposta: Json | null
          status: string
        }
        Insert: {
          anterior?: Json | null
          aplicada_em?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          erro?: string | null
          id?: string
          mensagens?: Json
          modo: string
          org_id: string
          proposta?: Json | null
          status?: string
        }
        Update: {
          anterior?: Json | null
          aplicada_em?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          erro?: string | null
          id?: string
          mensagens?: Json
          modo?: string
          org_id?: string
          proposta?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistente_sessoes_org_id_fkey"
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
          meta_coexistencia: boolean
          meta_sync_pedido_em: string | null
          meta_token_expira_em: string | null
          meta_waba_id: string | null
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
          meta_coexistencia?: boolean
          meta_sync_pedido_em?: string | null
          meta_token_expira_em?: string | null
          meta_waba_id?: string | null
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
          meta_coexistencia?: boolean
          meta_sync_pedido_em?: string | null
          meta_token_expira_em?: string | null
          meta_waba_id?: string | null
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
      clientes: {
        Row: {
          ativo: boolean
          atualizado_em: string
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          criado_em: string
          criado_por: string | null
          documento: string | null
          email: string | null
          id: string
          inscricao_estadual: string | null
          logradouro: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          org_id: string
          razao_social: string | null
          responsavel_id: string | null
          telefone: string | null
          tipo: string
          uf: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          criado_em?: string
          criado_por?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          org_id: string
          razao_social?: string | null
          responsavel_id?: string | null
          telefone?: string | null
          tipo?: string
          uf?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          criado_em?: string
          criado_por?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          org_id?: string
          razao_social?: string | null
          responsavel_id?: string | null
          telefone?: string | null
          tipo?: string
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      compromissos: {
        Row: {
          atualizado_em: string
          contato_id: string | null
          criado_em: string
          criado_por: string | null
          fim: string
          id: string
          inicio: string
          lembrete_enviado_em: string | null
          lembrete_minutos: number | null
          local: string | null
          observacao: string | null
          oportunidade_id: string | null
          org_id: string
          origem: string
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_compromisso"]
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          contato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          fim: string
          id?: string
          inicio: string
          lembrete_enviado_em?: string | null
          lembrete_minutos?: number | null
          local?: string | null
          observacao?: string | null
          oportunidade_id?: string | null
          org_id: string
          origem?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_compromisso"]
          titulo: string
        }
        Update: {
          atualizado_em?: string
          contato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          fim?: string
          id?: string
          inicio?: string
          lembrete_enviado_em?: string | null
          lembrete_minutos?: number | null
          local?: string | null
          observacao?: string | null
          oportunidade_id?: string | null
          org_id?: string
          origem?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_compromisso"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compromissos_contato_id_org_id_fkey"
            columns: ["contato_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "compromissos_oportunidade_id_org_id_fkey"
            columns: ["oportunidade_id", "org_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "compromissos_org_id_fkey"
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
          cliente_id: string | null
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
          sem_agente: boolean
          tags: string[]
          telefone: string | null
          whatsapp_lid: string | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
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
          sem_agente?: boolean
          tags?: string[]
          telefone?: string | null
          whatsapp_lid?: string | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
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
          sem_agente?: boolean
          tags?: string[]
          telefone?: string | null
          whatsapp_lid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_fk"
            columns: ["cliente_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "org_id"]
          },
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
          bot_desde: string | null
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
          bot_desde?: string | null
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
          bot_desde?: string | null
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
      documentos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          fonte_url: string | null
          id: string
          mime: string
          nome_arquivo: string
          org_id: string
          origem: string
          palavras_chave: string | null
          path: string
          tamanho: number
          tipo: string | null
          titulo: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          fonte_url?: string | null
          id?: string
          mime: string
          nome_arquivo: string
          org_id: string
          origem?: string
          palavras_chave?: string | null
          path: string
          tamanho: number
          tipo?: string | null
          titulo: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          fonte_url?: string | null
          id?: string
          mime?: string
          nome_arquivo?: string
          org_id?: string
          origem?: string
          palavras_chave?: string | null
          path?: string
          tamanho?: number
          tipo?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_envios: {
        Row: {
          autor_tipo: string
          conversa_id: string
          criado_em: string
          documento_id: string | null
          id: number
          mensagem_id: string
          org_id: string
        }
        Insert: {
          autor_tipo: string
          conversa_id: string
          criado_em?: string
          documento_id?: string | null
          id?: never
          mensagem_id: string
          org_id: string
        }
        Update: {
          autor_tipo?: string
          conversa_id?: string
          criado_em?: string
          documento_id?: string | null
          id?: never
          mensagem_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_envios_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_envios_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_envios_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: true
            referencedRelation: "mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_envios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_produtos: {
        Row: {
          documento_id: string
          org_id: string
          produto_id: string
        }
        Insert: {
          documento_id: string
          org_id: string
          produto_id: string
        }
        Update: {
          documento_id?: string
          org_id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_produtos_documento_id_org_id_fkey"
            columns: ["documento_id", "org_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "documentos_produtos_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "documentos_produtos_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos_saldo"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      emissoras: {
        Row: {
          aliquota_simples: number | null
          atualizado_em: string
          bairro: string | null
          cep: string | null
          certificado_cnpj: string | null
          certificado_validade: string | null
          cfop_estadual: string | null
          cfop_interestadual: string | null
          cidade: string | null
          cnpj: string
          codigo_municipio_ibge: string | null
          cofins_situacao: string | null
          complemento: string | null
          condicoes_pagamento: string | null
          criado_em: string
          email: string | null
          focus_empresa_id: number | null
          ibs_cbs_classificacao: string | null
          ibs_cbs_cst: string | null
          icms_origem: number
          icms_situacao: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          limite_faturamento: number | null
          logo_path: string | null
          logradouro: string | null
          nfe_ambiente: string
          nfe_erro: string | null
          nfe_serie: number
          nfe_sincronizado_em: string | null
          nfe_status: string
          nfse_ativa: boolean
          nfse_codigo_indicador_operacao: string | null
          nfse_codigo_nbs: string | null
          nfse_codigo_tributacao_municipal: string | null
          nfse_codigo_tributacao_nacional: string | null
          nfse_descricao_padrao: string | null
          nfse_habilitada_focus: boolean
          nfse_provedor: string | null
          nfse_regime_especial: number
          nome_fantasia: string | null
          numero: string | null
          org_id: string
          padrao: boolean
          padrao_balcao: boolean
          pis_situacao: string | null
          prazo_entrega: string | null
          razao_social: string
          regime_tributario: number | null
          rodape: string | null
          site: string | null
          telefone: string | null
          uf: string | null
          validade_dias: number
        }
        Insert: {
          aliquota_simples?: number | null
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          certificado_cnpj?: string | null
          certificado_validade?: string | null
          cfop_estadual?: string | null
          cfop_interestadual?: string | null
          cidade?: string | null
          cnpj: string
          codigo_municipio_ibge?: string | null
          cofins_situacao?: string | null
          complemento?: string | null
          condicoes_pagamento?: string | null
          criado_em?: string
          email?: string | null
          focus_empresa_id?: number | null
          ibs_cbs_classificacao?: string | null
          ibs_cbs_cst?: string | null
          icms_origem?: number
          icms_situacao?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          limite_faturamento?: number | null
          logo_path?: string | null
          logradouro?: string | null
          nfe_ambiente?: string
          nfe_erro?: string | null
          nfe_serie?: number
          nfe_sincronizado_em?: string | null
          nfe_status?: string
          nfse_ativa?: boolean
          nfse_codigo_indicador_operacao?: string | null
          nfse_codigo_nbs?: string | null
          nfse_codigo_tributacao_municipal?: string | null
          nfse_codigo_tributacao_nacional?: string | null
          nfse_descricao_padrao?: string | null
          nfse_habilitada_focus?: boolean
          nfse_provedor?: string | null
          nfse_regime_especial?: number
          nome_fantasia?: string | null
          numero?: string | null
          org_id: string
          padrao?: boolean
          padrao_balcao?: boolean
          pis_situacao?: string | null
          prazo_entrega?: string | null
          razao_social: string
          regime_tributario?: number | null
          rodape?: string | null
          site?: string | null
          telefone?: string | null
          uf?: string | null
          validade_dias?: number
        }
        Update: {
          aliquota_simples?: number | null
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          certificado_cnpj?: string | null
          certificado_validade?: string | null
          cfop_estadual?: string | null
          cfop_interestadual?: string | null
          cidade?: string | null
          cnpj?: string
          codigo_municipio_ibge?: string | null
          cofins_situacao?: string | null
          complemento?: string | null
          condicoes_pagamento?: string | null
          criado_em?: string
          email?: string | null
          focus_empresa_id?: number | null
          ibs_cbs_classificacao?: string | null
          ibs_cbs_cst?: string | null
          icms_origem?: number
          icms_situacao?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          limite_faturamento?: number | null
          logo_path?: string | null
          logradouro?: string | null
          nfe_ambiente?: string
          nfe_erro?: string | null
          nfe_serie?: number
          nfe_sincronizado_em?: string | null
          nfe_status?: string
          nfse_ativa?: boolean
          nfse_codigo_indicador_operacao?: string | null
          nfse_codigo_nbs?: string | null
          nfse_codigo_tributacao_municipal?: string | null
          nfse_codigo_tributacao_nacional?: string | null
          nfse_descricao_padrao?: string | null
          nfse_habilitada_focus?: boolean
          nfse_provedor?: string | null
          nfse_regime_especial?: number
          nome_fantasia?: string | null
          numero?: string | null
          org_id?: string
          padrao?: boolean
          padrao_balcao?: boolean
          pis_situacao?: string | null
          prazo_entrega?: string | null
          razao_social?: string
          regime_tributario?: number | null
          rodape?: string | null
          site?: string | null
          telefone?: string | null
          uf?: string | null
          validade_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "emissoras_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_movimentos: {
        Row: {
          autor_id: string | null
          criado_em: string
          id: number
          motivo: string | null
          nota_entrada_id: string | null
          org_id: string
          pedido_id: string | null
          produto_id: string
          quantidade: number
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          criado_em?: string
          id?: never
          motivo?: string | null
          nota_entrada_id?: string | null
          org_id: string
          pedido_id?: string | null
          produto_id: string
          quantidade: number
          tipo: string
        }
        Update: {
          autor_id?: string | null
          criado_em?: string
          id?: never
          motivo?: string | null
          nota_entrada_id?: string | null
          org_id?: string
          pedido_id?: string | null
          produto_id?: string
          quantidade?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_pedido_id_org_id_fkey"
            columns: ["pedido_id", "org_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos_saldo"
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
      fotos_indice: {
        Row: {
          atualizado_em: string
          descricao: string | null
          documento_id: string
          embedding: string | null
          erro: string | null
          org_id: string
          path: string
          status: string
          tentativas: number
        }
        Insert: {
          atualizado_em?: string
          descricao?: string | null
          documento_id: string
          embedding?: string | null
          erro?: string | null
          org_id: string
          path: string
          status?: string
          tentativas?: number
        }
        Update: {
          atualizado_em?: string
          descricao?: string | null
          documento_id?: string
          embedding?: string | null
          erro?: string | null
          org_id?: string
          path?: string
          status?: string
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "fotos_indice_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: true
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_indice_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_catalogo: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          erro: string | null
          id: string
          modo_preco: string
          nome: string | null
          org_id: string
          origem: string
          path: string | null
          progresso: number
          resultado: Json | null
          status: string
          total: number
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          erro?: string | null
          id?: string
          modo_preco: string
          nome?: string | null
          org_id: string
          origem: string
          path?: string | null
          progresso?: number
          resultado?: Json | null
          status?: string
          total?: number
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          erro?: string | null
          id?: string
          modo_preco?: string
          nome?: string | null
          org_id?: string
          origem?: string
          path?: string | null
          progresso?: number
          resultado?: Json | null
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_catalogo_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      membros_org: {
        Row: {
          ativo: boolean
          criado_em: string
          emite_nota_fiscal: boolean
          org_id: string
          papel: Database["public"]["Enums"]["papel_org"]
          user_id: string
          ve_todos_clientes: boolean
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          emite_nota_fiscal?: boolean
          org_id: string
          papel?: Database["public"]["Enums"]["papel_org"]
          user_id: string
          ve_todos_clientes?: boolean
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          emite_nota_fiscal?: boolean
          org_id?: string
          papel?: Database["public"]["Enums"]["papel_org"]
          user_id?: string
          ve_todos_clientes?: boolean
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
          automatica: boolean
          autor_id: string | null
          autor_tipo: Database["public"]["Enums"]["autor_tipo"]
          conversa_id: string
          criado_em: string
          descricao: string | null
          direcao: Database["public"]["Enums"]["direcao_msg"]
          erro: string | null
          id: string
          midia_mime: string | null
          midia_nome: string | null
          midia_path: string | null
          modelo: Json | null
          org_id: string
          status_entrega: Database["public"]["Enums"]["status_entrega"]
          texto: string | null
          tipo: Database["public"]["Enums"]["tipo_msg"]
          transcricao: string | null
          wa_id: string | null
        }
        Insert: {
          automatica?: boolean
          autor_id?: string | null
          autor_tipo: Database["public"]["Enums"]["autor_tipo"]
          conversa_id: string
          criado_em?: string
          descricao?: string | null
          direcao: Database["public"]["Enums"]["direcao_msg"]
          erro?: string | null
          id?: string
          midia_mime?: string | null
          midia_nome?: string | null
          midia_path?: string | null
          modelo?: Json | null
          org_id: string
          status_entrega: Database["public"]["Enums"]["status_entrega"]
          texto?: string | null
          tipo?: Database["public"]["Enums"]["tipo_msg"]
          transcricao?: string | null
          wa_id?: string | null
        }
        Update: {
          automatica?: boolean
          autor_id?: string | null
          autor_tipo?: Database["public"]["Enums"]["autor_tipo"]
          conversa_id?: string
          criado_em?: string
          descricao?: string | null
          direcao?: Database["public"]["Enums"]["direcao_msg"]
          erro?: string | null
          id?: string
          midia_mime?: string | null
          midia_nome?: string | null
          midia_path?: string | null
          modelo?: Json | null
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
      meta_sincronizacao: {
        Row: {
          campo: string
          canal_id: string
          id: number
          importado_em: string | null
          payload: Json
          recebido_em: string
        }
        Insert: {
          campo: string
          canal_id: string
          id?: never
          importado_em?: string | null
          payload: Json
          recebido_em?: string
        }
        Update: {
          campo?: string
          canal_id?: string
          id?: never
          importado_em?: string | null
          payload?: Json
          recebido_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_sincronizacao_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos: {
        Row: {
          adicional: boolean
          codigo: string
          descricao: string
          nome: string
          ordem: number
          padrao: boolean
        }
        Insert: {
          adicional?: boolean
          codigo: string
          descricao: string
          nome: string
          ordem?: number
          padrao?: boolean
        }
        Update: {
          adicional?: boolean
          codigo?: string
          descricao?: string
          nome?: string
          ordem?: number
          padrao?: boolean
        }
        Relationships: []
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
      notas_entrada: {
        Row: {
          arquivo_path: string | null
          autor_id: string | null
          chave: string | null
          criado_em: string
          emissao: string | null
          emitente_cnpj: string | null
          emitente_nome: string | null
          id: string
          numero: string | null
          org_id: string
          origem: string
          serie: string | null
          valor_total: number | null
        }
        Insert: {
          arquivo_path?: string | null
          autor_id?: string | null
          chave?: string | null
          criado_em?: string
          emissao?: string | null
          emitente_cnpj?: string | null
          emitente_nome?: string | null
          id?: string
          numero?: string | null
          org_id: string
          origem: string
          serie?: string | null
          valor_total?: number | null
        }
        Update: {
          arquivo_path?: string | null
          autor_id?: string | null
          chave?: string | null
          criado_em?: string
          emissao?: string | null
          emitente_cnpj?: string | null
          emitente_nome?: string | null
          id?: string
          numero?: string | null
          org_id?: string
          origem?: string
          serie?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_entrada_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_entrada_itens: {
        Row: {
          codigo_fornecedor: string | null
          descricao: string
          fator: number
          id: number
          ncm: string | null
          nota_id: string
          org_id: string
          produto_id: string | null
          quantidade: number
          unidade: string | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          codigo_fornecedor?: string | null
          descricao: string
          fator?: number
          id?: never
          ncm?: string | null
          nota_id: string
          org_id: string
          produto_id?: string | null
          quantidade: number
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          codigo_fornecedor?: string | null
          descricao?: string
          fator?: number
          id?: never
          ncm?: string | null
          nota_id?: string
          org_id?: string
          produto_id?: string | null
          quantidade?: number
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_entrada_itens_nota_id_org_id_fkey"
            columns: ["nota_id", "org_id"]
            isOneToOne: false
            referencedRelation: "notas_entrada"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "notas_entrada_itens_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "notas_entrada_itens_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos_saldo"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          ambiente: string
          atualizado_em: string
          autorizada_em: string | null
          cancelada_em: string | null
          chave: string | null
          cliente_id: string | null
          consultas: number
          criado_em: string
          criado_por: string | null
          danfe_path: string | null
          data_competencia: string | null
          descricao: string | null
          emissora_id: string
          id: string
          justificativa_cancelamento: string | null
          mensagem: string | null
          modelo: string
          numero: number | null
          org_id: string
          os_id: string | null
          pedido_id: string | null
          ref: string
          serie: number | null
          status: string
          valor: number
          xml_cancelamento_path: string | null
          xml_path: string | null
        }
        Insert: {
          ambiente: string
          atualizado_em?: string
          autorizada_em?: string | null
          cancelada_em?: string | null
          chave?: string | null
          cliente_id?: string | null
          consultas?: number
          criado_em?: string
          criado_por?: string | null
          danfe_path?: string | null
          data_competencia?: string | null
          descricao?: string | null
          emissora_id: string
          id?: string
          justificativa_cancelamento?: string | null
          mensagem?: string | null
          modelo?: string
          numero?: number | null
          org_id: string
          os_id?: string | null
          pedido_id?: string | null
          ref: string
          serie?: number | null
          status?: string
          valor?: number
          xml_cancelamento_path?: string | null
          xml_path?: string | null
        }
        Update: {
          ambiente?: string
          atualizado_em?: string
          autorizada_em?: string | null
          cancelada_em?: string | null
          chave?: string | null
          cliente_id?: string | null
          consultas?: number
          criado_em?: string
          criado_por?: string | null
          danfe_path?: string | null
          data_competencia?: string | null
          descricao?: string | null
          emissora_id?: string
          id?: string
          justificativa_cancelamento?: string | null
          mensagem?: string | null
          modelo?: string
          numero?: number | null
          org_id?: string
          os_id?: string | null
          pedido_id?: string | null
          ref?: string
          serie?: number | null
          status?: string
          valor?: number
          xml_cancelamento_path?: string | null
          xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_cliente_id_org_id_fkey"
            columns: ["cliente_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "notas_fiscais_emissora_id_org_id_fkey"
            columns: ["emissora_id", "org_id"]
            isOneToOne: false
            referencedRelation: "emissoras"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "notas_fiscais_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_os_fk"
            columns: ["os_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "notas_fiscais_pedido_id_org_id_fkey"
            columns: ["pedido_id", "org_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
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
      ordens_servico: {
        Row: {
          atualizado_em: string
          cliente_id: string | null
          cliente_nome: string | null
          contato_id: string | null
          criado_em: string
          criado_por: string | null
          id: string
          nf_cliente: string | null
          numero: number
          numero_cliente: string | null
          observacao: string | null
          org_id: string
          recebida_em: string
          responsavel_id: string | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
          cliente_nome?: string | null
          contato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nf_cliente?: string | null
          numero: number
          numero_cliente?: string | null
          observacao?: string | null
          org_id: string
          recebida_em?: string
          responsavel_id?: string | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
          cliente_nome?: string | null
          contato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nf_cliente?: string | null
          numero?: number
          numero_cliente?: string | null
          observacao?: string | null
          org_id?: string
          recebida_em?: string
          responsavel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_cliente_fk"
            columns: ["cliente_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ordens_servico_contato_id_org_id_fkey"
            columns: ["contato_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ordens_servico_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacao_modulos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          modulo: string
          org_id: string
        }
        Insert: {
          ativo: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          modulo: string
          org_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          modulo?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizacao_modulos_modulo_fkey"
            columns: ["modulo"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "organizacao_modulos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
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
      os_config: {
        Row: {
          alerta_fator: number
          atualizado_em: string
          org_id: string
          prazo_pagamento_dias: number
        }
        Insert: {
          alerta_fator?: number
          atualizado_em?: string
          org_id: string
          prazo_pagamento_dias?: number
        }
        Update: {
          alerta_fator?: number
          atualizado_em?: string
          org_id?: string
          prazo_pagamento_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      os_etapas: {
        Row: {
          ativo: boolean
          id: string
          marco: string | null
          nome: string
          ordem: number
          org_id: string
          prazo_padrao_dias: number | null
        }
        Insert: {
          ativo?: boolean
          id?: string
          marco?: string | null
          nome: string
          ordem: number
          org_id: string
          prazo_padrao_dias?: number | null
        }
        Update: {
          ativo?: boolean
          id?: string
          marco?: string | null
          nome?: string
          ordem?: number
          org_id?: string
          prazo_padrao_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "os_etapas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      os_item_historico: {
        Row: {
          autor_id: string | null
          criado_em: string
          data: string
          etapa_de: string | null
          etapa_para: string
          id: number
          importado: boolean
          item_id: string
          org_id: string
        }
        Insert: {
          autor_id?: string | null
          criado_em?: string
          data: string
          etapa_de?: string | null
          etapa_para: string
          id?: never
          importado?: boolean
          item_id: string
          org_id: string
        }
        Update: {
          autor_id?: string | null
          criado_em?: string
          data?: string
          etapa_de?: string | null
          etapa_para?: string
          id?: never
          importado?: boolean
          item_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_item_historico_etapa_para_org_id_fkey"
            columns: ["etapa_para", "org_id"]
            isOneToOne: false
            referencedRelation: "os_etapas"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "os_item_historico_item_id_org_id_fkey"
            columns: ["item_id", "org_id"]
            isOneToOne: false
            referencedRelation: "os_itens"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      os_itens: {
        Row: {
          atualizado_em: string
          campos: Json
          cobranca: string
          criado_em: string
          desfecho: string | null
          desfecho_em: string | null
          etapa_desde: string
          etapa_id: string
          faturado_em: string | null
          id: string
          identificacao: string | null
          modelo: string | null
          observacao: string | null
          ordem: number
          org_id: string
          os_id: string
          pago_em: string | null
          servico_id: string | null
          tipo_id: string | null
          valor: number
          vencimento_em: string | null
        }
        Insert: {
          atualizado_em?: string
          campos?: Json
          cobranca?: string
          criado_em?: string
          desfecho?: string | null
          desfecho_em?: string | null
          etapa_desde: string
          etapa_id: string
          faturado_em?: string | null
          id?: string
          identificacao?: string | null
          modelo?: string | null
          observacao?: string | null
          ordem?: number
          org_id: string
          os_id: string
          pago_em?: string | null
          servico_id?: string | null
          tipo_id?: string | null
          valor?: number
          vencimento_em?: string | null
        }
        Update: {
          atualizado_em?: string
          campos?: Json
          cobranca?: string
          criado_em?: string
          desfecho?: string | null
          desfecho_em?: string | null
          etapa_desde?: string
          etapa_id?: string
          faturado_em?: string | null
          id?: string
          identificacao?: string | null
          modelo?: string | null
          observacao?: string | null
          ordem?: number
          org_id?: string
          os_id?: string
          pago_em?: string | null
          servico_id?: string | null
          tipo_id?: string | null
          valor?: number
          vencimento_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_itens_etapa_id_org_id_fkey"
            columns: ["etapa_id", "org_id"]
            isOneToOne: false
            referencedRelation: "os_etapas"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "os_itens_os_id_org_id_fkey"
            columns: ["os_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "os_itens_servico_id_org_id_fkey"
            columns: ["servico_id", "org_id"]
            isOneToOne: false
            referencedRelation: "os_servicos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "os_itens_tipo_id_org_id_fkey"
            columns: ["tipo_id", "org_id"]
            isOneToOne: false
            referencedRelation: "os_tipos_item"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      os_prazos_cliente: {
        Row: {
          cliente_id: string
          org_id: string
          prazo_pagamento_dias: number
        }
        Insert: {
          cliente_id: string
          org_id: string
          prazo_pagamento_dias: number
        }
        Update: {
          cliente_id?: string
          org_id?: string
          prazo_pagamento_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_prazos_cliente_cliente_id_org_id_fkey"
            columns: ["cliente_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      os_servicos: {
        Row: {
          ativo: boolean
          codigo: string | null
          criado_em: string
          id: string
          nome: string
          org_id: string
          preco: number
        }
        Insert: {
          ativo?: boolean
          codigo?: string | null
          criado_em?: string
          id?: string
          nome: string
          org_id: string
          preco?: number
        }
        Update: {
          ativo?: boolean
          codigo?: string | null
          criado_em?: string
          id?: string
          nome?: string
          org_id?: string
          preco?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_servicos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      os_tipos_item: {
        Row: {
          ativo: boolean
          campos: Json
          id: string
          nome: string
          org_id: string
          rotulo_identificacao: string
          servico_padrao_id: string | null
        }
        Insert: {
          ativo?: boolean
          campos?: Json
          id?: string
          nome: string
          org_id: string
          rotulo_identificacao?: string
          servico_padrao_id?: string | null
        }
        Update: {
          ativo?: boolean
          campos?: Json
          id?: string
          nome?: string
          org_id?: string
          rotulo_identificacao?: string
          servico_padrao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_tipos_item_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_tipos_item_servico_padrao_id_org_id_fkey"
            columns: ["servico_padrao_id", "org_id"]
            isOneToOne: false
            referencedRelation: "os_servicos"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      painel_config: {
        Row: {
          antes_tempo_resposta_min: number | null
          atualizado_em: string
          minutos_por_resposta: number
          org_id: string
          piloto_inicio: string | null
        }
        Insert: {
          antes_tempo_resposta_min?: number | null
          atualizado_em?: string
          minutos_por_resposta?: number
          org_id: string
          piloto_inicio?: string | null
        }
        Update: {
          antes_tempo_resposta_min?: number | null
          atualizado_em?: string
          minutos_por_resposta?: number
          org_id?: string
          piloto_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "painel_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          descricao: string
          id: string
          ordem: number
          org_id: string
          pedido_id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
          subtotal: number | null
        }
        Insert: {
          descricao: string
          id?: string
          ordem?: number
          org_id: string
          pedido_id: string
          preco_unitario: number
          produto_id?: string | null
          quantidade: number
          subtotal?: number | null
        }
        Update: {
          descricao?: string
          id?: string
          ordem?: number
          org_id?: string
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          subtotal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_org_id_fkey"
            columns: ["pedido_id", "org_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "pedido_itens_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "pedido_itens_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos_saldo"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      pedidos: {
        Row: {
          atualizado_em: string
          cliente_id: string | null
          condicoes_pagamento: string | null
          confirmado_em: string | null
          contato_id: string | null
          criado_em: string
          criado_por: string | null
          desconto: number
          emissora_id: string | null
          estoque_baixado: boolean
          frete: number
          id: string
          numero: number
          observacao: string | null
          oportunidade_id: string | null
          org_id: string
          origem: string
          prazo_entrega: string | null
          responsavel_id: string | null
          status: string
          subtotal: number
          total: number
          validade: string | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
          condicoes_pagamento?: string | null
          confirmado_em?: string | null
          contato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          desconto?: number
          emissora_id?: string | null
          estoque_baixado?: boolean
          frete?: number
          id?: string
          numero: number
          observacao?: string | null
          oportunidade_id?: string | null
          org_id: string
          origem?: string
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          validade?: string | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
          condicoes_pagamento?: string | null
          confirmado_em?: string | null
          contato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          desconto?: number
          emissora_id?: string | null
          estoque_baixado?: boolean
          frete?: number
          id?: string
          numero?: number
          observacao?: string | null
          oportunidade_id?: string | null
          org_id?: string
          origem?: string
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_fk"
            columns: ["cliente_id", "org_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "pedidos_contato_id_org_id_fkey"
            columns: ["contato_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "pedidos_emissora_id_org_id_fkey"
            columns: ["emissora_id", "org_id"]
            isOneToOne: false
            referencedRelation: "emissoras"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "pedidos_oportunidade_id_org_id_fkey"
            columns: ["oportunidade_id", "org_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "pedidos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "pedidos_acesso_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          avatar_url: string | null
          criado_em: string
          nome: string | null
          telefone: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          criado_em?: string
          nome?: string | null
          telefone?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          criado_em?: string
          nome?: string | null
          telefone?: string | null
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
      precos_ia: {
        Row: {
          atualizado_em: string
          modelo: string
          observacao: string | null
          usd_por_milhao_entrada: number
          usd_por_milhao_saida: number
        }
        Insert: {
          atualizado_em?: string
          modelo: string
          observacao?: string | null
          usd_por_milhao_entrada: number
          usd_por_milhao_saida: number
        }
        Update: {
          atualizado_em?: string
          modelo?: string
          observacao?: string | null
          usd_por_milhao_entrada?: number
          usd_por_milhao_saida?: number
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          cest: string | null
          codigo: string | null
          controla_estoque: boolean
          criado_em: string
          descricao: string | null
          estoque_minimo: number | null
          id: string
          marca: string | null
          ncm: string | null
          nome: string
          org_id: string
          origem: number | null
          preco: number
          unidade: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          cest?: string | null
          codigo?: string | null
          controla_estoque?: boolean
          criado_em?: string
          descricao?: string | null
          estoque_minimo?: number | null
          id?: string
          marca?: string | null
          ncm?: string | null
          nome: string
          org_id: string
          origem?: number | null
          preco?: number
          unidade?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          cest?: string | null
          codigo?: string | null
          controla_estoque?: boolean
          criado_em?: string
          descricao?: string | null
          estoque_minimo?: number | null
          id?: string
          marca?: string | null
          ncm?: string | null
          nome?: string
          org_id?: string
          origem?: number | null
          preco?: number
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_custos: {
        Row: {
          atualizado_em: string
          custo: number
          nota_id: string | null
          org_id: string
          produto_id: string
        }
        Insert: {
          atualizado_em?: string
          custo: number
          nota_id?: string | null
          org_id: string
          produto_id: string
        }
        Update: {
          atualizado_em?: string
          custo?: number
          nota_id?: string | null
          org_id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_custos_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "notas_entrada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_custos_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "produtos_custos_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos_saldo"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      produtos_fornecedores: {
        Row: {
          atualizado_em: string
          codigo_fornecedor: string
          descricao_fornecedor: string | null
          fator: number
          fornecedor_cnpj: string
          org_id: string
          produto_id: string
          unidade_fornecedor: string | null
        }
        Insert: {
          atualizado_em?: string
          codigo_fornecedor: string
          descricao_fornecedor?: string | null
          fator?: number
          fornecedor_cnpj: string
          org_id: string
          produto_id: string
          unidade_fornecedor?: string | null
        }
        Update: {
          atualizado_em?: string
          codigo_fornecedor?: string
          descricao_fornecedor?: string | null
          fator?: number
          fornecedor_cnpj?: string
          org_id?: string
          produto_id?: string
          unidade_fornecedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_fornecedores_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "produtos_fornecedores_produto_id_org_id_fkey"
            columns: ["produto_id", "org_id"]
            isOneToOne: false
            referencedRelation: "produtos_saldo"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      push_config: {
        Row: {
          chave_publica: string
          criado_em: string
          id: number
        }
        Insert: {
          chave_publica: string
          criado_em?: string
          id?: number
        }
        Update: {
          chave_publica?: string
          criado_em?: string
          id?: number
        }
        Relationships: []
      }
      push_fila: {
        Row: {
          conversa_id: string | null
          corpo: string
          criado_em: string
          enviado_em: string | null
          erro: string | null
          id: number
          titulo: string
          url: string
          user_id: string
        }
        Insert: {
          conversa_id?: string | null
          corpo: string
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: never
          titulo: string
          url?: string
          user_id: string
        }
        Update: {
          conversa_id?: string | null
          corpo?: string
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          id?: never
          titulo?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_fila_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      push_inscricoes: {
        Row: {
          auth: string
          criado_em: string
          dispositivo: string | null
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          criado_em?: string
          dispositivo?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          criado_em?: string
          dispositivo?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      simulacoes_agente: {
        Row: {
          criado_em: string
          id: number
          org_id: string
          user_id: string | null
        }
        Insert: {
          criado_em?: string
          id?: never
          org_id: string
          user_id?: string | null
        }
        Update: {
          criado_em?: string
          id?: never
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulacoes_agente_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_ia: {
        Row: {
          chamadas: number
          conversa_id: string | null
          criado_em: string
          id: number
          mensagem_id: string | null
          modelo: string
          org_id: string
          origem_ref: string
          segundos_audio: number | null
          tipo: string
          tokens_entrada: number
          tokens_saida: number
        }
        Insert: {
          chamadas?: number
          conversa_id?: string | null
          criado_em?: string
          id?: never
          mensagem_id?: string | null
          modelo: string
          org_id: string
          origem_ref: string
          segundos_audio?: number | null
          tipo: string
          tokens_entrada?: number
          tokens_saida?: number
        }
        Update: {
          chamadas?: number
          conversa_id?: string | null
          criado_em?: string
          id?: never
          mensagem_id?: string | null
          modelo?: string
          org_id?: string
          origem_ref?: string
          segundos_audio?: number | null
          tipo?: string
          tokens_entrada?: number
          tokens_saida?: number
        }
        Relationships: [
          {
            foreignKeyName: "uso_ia_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uso_ia_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      produtos_saldo: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          categoria: string | null
          codigo: string | null
          controla_estoque: boolean | null
          criado_em: string | null
          descricao: string | null
          estoque_minimo: number | null
          id: string | null
          marca: string | null
          ncm: string | null
          nome: string | null
          org_id: string | null
          preco: number | null
          saldo: number | null
          unidade: string | null
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          categoria?: string | null
          codigo?: string | null
          controla_estoque?: boolean | null
          criado_em?: string | null
          descricao?: string | null
          estoque_minimo?: number | null
          id?: string | null
          marca?: string | null
          ncm?: string | null
          nome?: string | null
          org_id?: string | null
          preco?: number | null
          saldo?: never
          unidade?: string | null
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          categoria?: string | null
          codigo?: string | null
          controla_estoque?: boolean | null
          criado_em?: string | null
          descricao?: string | null
          estoque_minimo?: number | null
          id?: string | null
          marca?: string | null
          ncm?: string | null
          nome?: string | null
          org_id?: string | null
          preco?: number | null
          saldo?: never
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_ia_mensal: {
        Row: {
          audios_transcritos: number | null
          conversas_com_agente: number | null
          custo_usd: number | null
          mes: string | null
          org_id: string | null
          respostas_agente: number | null
          segundos_audio: number | null
          tokens_entrada: number | null
          tokens_saida: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uso_ia_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      agenda_avisos_equipe: {
        Args: { p_org: string }
        Returns: {
          celular: boolean
          user_id: string
          whatsapp: boolean
        }[]
      }
      agenda_lembretes: { Args: never; Returns: number }
      agente_atualizar_contato: {
        Args: { p_conversa: string; p_dados: Json }
        Returns: Json
      }
      agente_buscar_documentos: {
        Args: { p_busca: string; p_conversa: string }
        Returns: Json
      }
      agente_buscar_produtos: {
        Args: { p_busca: string; p_conversa: string; p_limite?: number }
        Returns: Json
      }
      agente_chamar_humano: {
        Args: { p_conversa: string; p_motivo: string }
        Returns: Json
      }
      agente_consultar_os: {
        Args: { p_busca?: string; p_conversa: string }
        Returns: Json
      }
      agente_contexto: {
        Args: { p_conversa: string; p_limite?: number }
        Returns: Json
      }
      agente_contexto_simulado: {
        Args: {
          p_base?: string
          p_casos?: Json
          p_mensagens: Json
          p_org: string
          p_prompt?: string
        }
        Returns: Json
      }
      agente_dados_orcamento: { Args: { p_conversa: string }; Returns: Json }
      agente_deve_responder: {
        Args: { p_conversa: string; p_mensagem: string }
        Returns: boolean
      }
      agente_enviar_arquivo: {
        Args: {
          p_conversa: string
          p_legenda?: string
          p_nome: string
          p_path: string
        }
        Returns: Json
      }
      agente_enviar_documento: {
        Args: { p_conversa: string; p_documento: string; p_path: string }
        Returns: Json
      }
      agente_horario_valido: { Args: { p: Json }; Returns: boolean }
      agente_marcar: { Args: never; Returns: undefined }
      agente_montar_pedido: {
        Args: { p_conversa: string; p_itens: Json; p_observacao?: string }
        Returns: Json
      }
      agente_mover_etapa: {
        Args: { p_conversa: string; p_etapa: string }
        Returns: Json
      }
      agente_no_horario: {
        Args: { p_horario: Json; p_quando: string }
        Returns: boolean
      }
      agente_nota: {
        Args: { p_conversa: string; p_texto: string }
        Returns: Json
      }
      agente_preparar_documento: {
        Args: { p_conversa: string; p_documento: string; p_reenviar?: boolean }
        Returns: Json
      }
      agente_rascunho_atual: {
        Args: { p_conversa: string }
        Returns: {
          atualizado_em: string
          cliente_id: string | null
          condicoes_pagamento: string | null
          confirmado_em: string | null
          contato_id: string | null
          criado_em: string
          criado_por: string | null
          desconto: number
          emissora_id: string | null
          estoque_baixado: boolean
          frete: number
          id: string
          numero: number
          observacao: string | null
          oportunidade_id: string | null
          org_id: string
          origem: string
          prazo_entrega: string | null
          responsavel_id: string | null
          status: string
          subtotal: number
          total: number
          validade: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
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
      assistente_aplicar: {
        Args: { p_secoes: Json; p_sessao: string }
        Returns: Json
      }
      assistente_desfazer: { Args: { p_sessao: string }; Returns: undefined }
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
      aviso_sistema: {
        Args: { p_conversa: string; p_texto: string }
        Returns: undefined
      }
      buscar_documentos_org: {
        Args: { p_busca: string; p_org: string }
        Returns: Json
      }
      buscar_produtos_org: {
        Args: { p_busca: string; p_limite?: number; p_org: string }
        Returns: Json
      }
      canal_atualizar_status: {
        Args: { p_canal: string; p_numero?: string; p_status: string }
        Returns: undefined
      }
      canal_por_numero_meta: {
        Args: { p_phone_number_id: string }
        Returns: {
          canal_id: string
          org_id: string
        }[]
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
      clientes_importar: {
        Args: { p_linhas: Json; p_org: string }
        Returns: Json
      }
      cnpj_valido: { Args: { p: string }; Returns: boolean }
      contato_por_whatsapp: {
        Args: {
          p_lid: string
          p_nome_whatsapp: string
          p_org: string
          p_telefone: string
        }
        Returns: string
      }
      cpf_valido: { Args: { p: string }; Returns: boolean }
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
      eh_mensagem_automatica: {
        Args: { p_canal: string; p_texto: string }
        Returns: boolean
      }
      emite_nota_fiscal: { Args: { p_org: string }; Returns: boolean }
      enfileirar_saida: {
        Args: {
          p_autor: Database["public"]["Enums"]["autor_tipo"]
          p_autor_id: string
          p_conversa: string
          p_texto: string
        }
        Returns: string
      }
      enviar_arquivo: {
        Args: {
          p_conversa: string
          p_legenda?: string
          p_nome: string
          p_path: string
        }
        Returns: string
      }
      enviar_mensagem: {
        Args: { p_conversa: string; p_texto: string }
        Returns: string
      }
      enviar_modelo: {
        Args: {
          p_conversa: string
          p_idioma: string
          p_nome: string
          p_parametros: string[]
          p_texto: string
        }
        Returns: string
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
      estoque_definir_saldos: {
        Args: { p_itens: Json; p_org: string }
        Returns: Json
      }
      estoque_lancar: {
        Args: {
          p_motivo?: string
          p_produto: string
          p_quantidade: number
          p_tipo: string
        }
        Returns: undefined
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
          midia_mime: string
          midia_nome: string
          midia_path: string
          modelo: Json
          telefone: string
          tentativas: number
          texto: string
          tipo: string
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
      fotos_candidatas: {
        Args: {
          p_embedding: string
          p_limite?: number
          p_org: string
          p_texto: string
        }
        Returns: Json
      }
      fotos_manutencao: { Args: never; Returns: undefined }
      fotos_registrar: {
        Args: {
          p_descricao: string
          p_documento: string
          p_embedding: string
          p_erro: string
          p_path: string
        }
        Returns: undefined
      }
      fotos_reivindicar: {
        Args: { p_limite: number }
        Returns: {
          documento_id: string
          mime: string
          org_id: string
          path: string
        }[]
      }
      funil_salvar: {
        Args: {
          p_abertas: Json
          p_ganho: string
          p_mover?: Json
          p_org: string
          p_perdido: string
        }
        Returns: undefined
      }
      gerar_segredo_webhook: { Args: { p_canal: string }; Returns: string }
      guardar_midia: {
        Args: {
          p_mensagem: string
          p_mime: string
          p_nome: string
          p_path: string
        }
        Returns: Json
      }
      hoje_brasil: { Args: never; Returns: string }
      iniciar_conversa: {
        Args: {
          p_canal: string
          p_nome?: string
          p_telefone: string
          p_texto?: string
        }
        Returns: string
      }
      membro_definir_emite_nota_fiscal: {
        Args: { p_org: string; p_usuario: string; p_valor: boolean }
        Returns: undefined
      }
      membro_definir_ve_todos_clientes: {
        Args: { p_org: string; p_usuario: string; p_valor: boolean }
        Returns: undefined
      }
      meta_guardar_pin: {
        Args: { p_canal: string; p_pin: string }
        Returns: undefined
      }
      meta_guardar_token: {
        Args: { p_canal: string; p_expira_em?: string; p_token: string }
        Returns: undefined
      }
      meta_token_do_canal: { Args: { p_canal: string }; Returns: string }
      midia_destino: {
        Args: { p_canal: string; p_wa_id: string }
        Returns: Json
      }
      modulo_ativo: {
        Args: { p_modulo: string; p_org: string }
        Returns: boolean
      }
      nfe_manutencao: { Args: never; Returns: undefined }
      nfe_salvar_tokens: {
        Args: { p_emissora: string; p_homologacao: string; p_producao: string }
        Returns: undefined
      }
      nfe_segredo_webhook: { Args: never; Returns: string }
      nfe_token: {
        Args: { p_ambiente: string; p_emissora: string }
        Returns: string
      }
      nota_entrada_lancar: {
        Args: { p_itens: Json; p_nota: Json; p_org: string }
        Returns: Json
      }
      org_do_caminho: { Args: { p_nome: string }; Returns: string }
      org_modulos: {
        Args: { p_org: string }
        Returns: {
          adicional: boolean
          ativo: boolean
          codigo: string
          descricao: string
          nome: string
          padrao: boolean
        }[]
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
      os_conferir_itens: {
        Args: { p_gerente: boolean; p_itens: string[] }
        Returns: string
      }
      os_definir_desfecho: {
        Args: { p_data?: string; p_desfecho: string; p_itens: string[] }
        Returns: undefined
      }
      os_duracoes: {
        Args: { p_org: string }
        Returns: {
          dias: number
          etapa_id: string
          fim: string
          inicio: string
          item_id: string
          tipo_id: string
        }[]
      }
      os_faturar: {
        Args: { p_data: string; p_itens: string[]; p_vencimento?: string }
        Returns: undefined
      }
      os_gerente: { Args: { p_org: string }; Returns: boolean }
      os_importar: { Args: { p_linhas: Json; p_org: string }; Returns: Json }
      os_membro: { Args: { p_org: string }; Returns: boolean }
      os_mover_itens: {
        Args: { p_data?: string; p_etapa: string; p_itens: string[] }
        Returns: undefined
      }
      os_painel: {
        Args: { p_ate: string; p_de: string; p_org: string }
        Returns: Json
      }
      os_prazo_cliente: {
        Args: { p_cliente: string; p_org: string }
        Returns: number
      }
      os_preparar: { Args: { p_org: string }; Returns: undefined }
      os_previsao_itens: {
        Args: { p_org: string }
        Returns: {
          dias_na_etapa: number
          em_orcamento: boolean
          fatura_em: string
          finaliza_em: string
          item_id: string
          normal_etapa: number
          parado: boolean
          recebe_em: string
        }[]
      }
      os_previsao_itens_base: {
        Args: { p_org: string }
        Returns: {
          dias_na_etapa: number
          em_orcamento: boolean
          fatura_em: string
          finaliza_em: string
          item_id: string
          normal_etapa: number
          parado: boolean
          recebe_em: string
        }[]
      }
      os_registrar_pagamento: {
        Args: { p_data: string; p_itens: string[] }
        Returns: undefined
      }
      os_salvar_etapas: {
        Args: { p_etapas: Json; p_mover?: Json; p_org: string }
        Returns: undefined
      }
      os_tempo_normal: {
        Args: { p_org: string }
        Returns: {
          base: string
          dias: number
          etapa_id: string
          tipo_id: string
        }[]
      }
      painel_filtro_vendedor: {
        Args: { p_org: string; p_vendedor: string }
        Returns: string
      }
      painel_pendencias: {
        Args: { p_canal?: string; p_org: string; p_vendedor?: string }
        Returns: Json
      }
      painel_periodo: {
        Args: {
          p_ate: string
          p_canal: string
          p_de: string
          p_org: string
          p_vendedor: string
        }
        Returns: Json
      }
      painel_relatorio: { Args: { p_org: string }; Returns: Json }
      painel_resumo: {
        Args: {
          p_ate: string
          p_canal?: string
          p_de: string
          p_org: string
          p_vendedor?: string
        }
        Returns: Json
      }
      pedido_mudar_status: {
        Args: { p_pedido: string; p_status: string }
        Returns: undefined
      }
      plataforma_criar_empresa: { Args: { p_nome: string }; Returns: string }
      plataforma_definir_modulo: {
        Args: { p_ativo: boolean; p_modulo: string; p_org: string }
        Returns: undefined
      }
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
      pode_acessar_midia: { Args: { p_nome: string }; Returns: boolean }
      pode_usar_contato: { Args: { p_contato: string }; Returns: boolean }
      pode_ver_canal: { Args: { p_canal: string }; Returns: boolean }
      pode_ver_cliente: { Args: { p_cliente: string }; Returns: boolean }
      pode_ver_cliente_linha: {
        Args: { p_cliente: string; p_org: string; p_responsavel: string }
        Returns: boolean
      }
      pode_ver_compromisso: {
        Args: { p_contato: string; p_org: string; p_responsavel: string }
        Returns: boolean
      }
      pode_ver_contato: { Args: { p_contato: string }; Returns: boolean }
      pode_ver_contato_linha: {
        Args: { p_contato: string; p_org: string; p_responsavel: string }
        Returns: boolean
      }
      pode_ver_conversa: { Args: { p_conversa: string }; Returns: boolean }
      pode_ver_pedido:
        | {
            Args: { p_contato: string; p_org: string; p_responsavel: string }
            Returns: boolean
          }
        | {
            Args: {
              p_cliente: string
              p_contato: string
              p_org: string
              p_responsavel: string
            }
            Returns: boolean
          }
      push_cancelar: { Args: { p_endpoint: string }; Returns: undefined }
      push_chaves: { Args: never; Returns: Json }
      push_enfileirar: {
        Args: {
          p_conversa: string
          p_corpo: string
          p_titulo: string
          p_users: string[]
        }
        Returns: undefined
      }
      push_equipe_do_canal: { Args: { p_canal: string }; Returns: string[] }
      push_inscrever: {
        Args: {
          p_auth: string
          p_dispositivo?: string
          p_endpoint: string
          p_p256dh: string
        }
        Returns: undefined
      }
      push_nome_contato: { Args: { p_contato: string }; Returns: string }
      push_reivindicar: {
        Args: { p_limite?: number }
        Returns: {
          conversa_id: string
          corpo: string
          fila_id: number
          titulo: string
          url: string
          user_id: string
        }[]
      }
      push_salvar_chaves: {
        Args: { p_chaves: Json; p_publica: string }
        Returns: Json
      }
      push_testar: { Args: never; Returns: undefined }
      reais: { Args: { p: number }; Returns: string }
      registrar_descricao: {
        Args: { p_descricao: string; p_mensagem: string }
        Returns: Json
      }
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
      registrar_envio_documento: {
        Args: { p_documento: string; p_mensagem: string }
        Returns: undefined
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
      sem_acento: { Args: { p: string }; Returns: string }
      simulador_consultar_os: {
        Args: { p_busca?: string; p_org: string }
        Returns: Json
      }
      simulador_documento: {
        Args: { p_documento: string; p_org: string }
        Returns: Json
      }
      simulador_montar_pedido: {
        Args: { p_itens: Json; p_observacao?: string; p_org: string }
        Returns: Json
      }
      simulador_registrar: {
        Args: { p_org: string; p_user: string }
        Returns: boolean
      }
      tem_papel: {
        Args: {
          p_org: string
          p_papeis: Database["public"]["Enums"]["papel_org"][]
        }
        Returns: boolean
      }
      texto_comparavel: { Args: { p: string }; Returns: string }
      usuario_por_email: {
        Args: { p_email: string }
        Returns: {
          id: string
          senha_definida: boolean
        }[]
      }
      ve_todos_clientes: { Args: { p_org: string }; Returns: boolean }
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
      status_compromisso:
        | "marcado"
        | "confirmado"
        | "realizado"
        | "nao_compareceu"
        | "cancelado"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      autor_tipo: ["contato", "atendente", "bot", "sistema"],
      direcao_msg: ["entrada", "saida"],
      estado_conversa: ["bot", "aguardando_humano", "humano", "encerrada"],
      papel_org: ["dono", "admin", "atendente"],
      status_compromisso: [
        "marcado",
        "confirmado",
        "realizado",
        "nao_compareceu",
        "cancelado",
      ],
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
