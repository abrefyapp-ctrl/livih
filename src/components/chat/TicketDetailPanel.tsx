import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TicketWithCustomer, TicketStatus, TicketPriority, STATUS_LABELS, PRIORITY_LABELS } from "@/types/database";
import { useAgents } from "@/hooks/useAgents";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { User, Clock, Tag, Building2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import StatusProgress from "@/components/chat/StatusProgress";
import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/lib/env";

interface TicketDetailPanelProps {
  ticket: TicketWithCustomer;
}

interface Category {
  id: number;
  name: string;
  color: string;
}

interface Substatus {
  id: number;
  name: string;
  status_parent: string;
}

const TicketDetailPanel: React.FC<TicketDetailPanelProps> = ({ ticket }) => {
  const { agents } = useAgents();
  const [updating, setUpdating] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [substatuses, setSubstatuses] = useState<Substatus[]>([]);
  const t = ticket as any;

  useEffect(() => {
    supabase
      .from("ticket_categories")
      .select("id, name, color")
      .order("id")
      .then(({ data }) => {
        if (data) setCategories(data);
      });

    supabase
      .from("ticket_substatus")
      .select("id, name, status_parent")
      .order("sort_order")
      .then(({ data }) => {
        if (data) {
          console.log("[substatus] carregados:", data.length, "| status atual:", ticket.status);
          setSubstatuses(data as Substatus[]);
        }
      });
  }, [ticket.status]);

  const notifyAgentWhatsApp = async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId) as any;
    if (!agent?.phone_number) {
      console.log("[notify] Agente sem telefone cadastrado, notificação ignorada.");
      return;
    }

    const message =
      `👋 Olá, ${agent.name}!\n\n` +
      `Você foi atribuído ao ticket *#${ticket.ticket_number}*.\n\n` +
      `👤 Cliente: ${ticket.customer_name}\n` +
      (t.contact_name ? `📞 Contato: ${t.contact_name}\n` : "") +
      `\nAcesse a plataforma para iniciar o atendimento: https://abrefy.com.br`;

    try {
      const res = await fetch(
        `${FUNCTIONS_URL}/send-whatsapp-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            phone: agent.phone_number,
            message,
          }),
        }
      );
      const json = await res.json();
      console.log("[notify] WhatsApp enviado:", json);
    } catch (err) {
      console.error("[notify] Erro ao enviar WhatsApp:", err);
    }
  };

  const updateField = async (field: string, value: string | number | null) => {
    try {
      setUpdating(true);

      const isResolving = field === "status" && value === "resolved";
      const isAssigningAgent = field === "assigned_agent_id" && value && value !== "none";

      const updatePayload: any = { [field]: value, updated_at: new Date().toISOString() };

      // ✅ ao resolver, marca awaiting_feedback para capturar o SIM do cliente
      if (isResolving) updatePayload.awaiting_feedback = true;
      // ✅ ao reabrir, limpa o flag
      if (field === "status" && value !== "resolved") updatePayload.awaiting_feedback = false;
      // ✅ ao mudar status, limpa substatus (não faz sentido manter de outro status)
      if (field === "status") updatePayload.substatus_id = null;

      const { error } = await supabase
        .from("tickets")
        .update(updatePayload)
        .eq("id", ticket.id);

      if (error) throw error;

      if (isResolving) {
        const message =
          `Perfeito! 😊\n\nMarcamos seu atendimento *#${ticket.ticket_number}* como resolvido, mas queremos garantir que está tudo certo para você.\n\nPor favor, responda com *SIM* caso esteja tudo ok 👍\n\nSe precisar de algo mais, é só nos avisar!`;

        await fetch(`${FUNCTIONS_URL}/send-reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ ticket_id: ticket.id, message }),
        });
      }

      // Notifica agente por WhatsApp ao ser atribuído
      if (isAssigningAgent) {
        await notifyAgentWhatsApp(value as string);
      }

      toast({ title: "Atualizado", description: "Alteração salva com sucesso" });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const currentCategory = categories.find((c) => c.id === t.category_id);

  return (
    <div className="flex w-72 flex-col border-l border-border bg-muted/20 p-4 space-y-5 overflow-y-auto">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Detalhes do Ticket</h3>
        <span className="text-lg font-bold text-primary font-mono mb-3 block">#{ticket.ticket_number}</span>

        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">{ticket.customer_name}</p>
            <p className="text-xs text-muted-foreground">{ticket.customer_phone}</p>
          </div>
        </div>

        {t.contact_name && (
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">{t.contact_name}</p>
              {t.contact_role && <p className="text-xs text-muted-foreground">{t.contact_role}</p>}
              {t.contact_phone && <p className="text-xs text-muted-foreground">{t.contact_phone}</p>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>
            Criado em{" "}
            {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
        </div>

        {t.subject && (
          <div className="mt-2 rounded-md bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Assunto</p>
            <p className="text-sm font-medium">{t.subject}</p>
          </div>
        )}
      </div>

      <Separator />

      {/* FASES DO STATUS */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Progresso</p>
        <StatusProgress currentStatus={ticket.status} substatusName={t.substatus_name} />
      </div>

      <Separator />

      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Categoria</Label>
          <div className="flex items-center gap-2 mb-1">
            {currentCategory ? (
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: currentCategory.color + "20",
                  color: currentCategory.color,
                  border: `1px solid ${currentCategory.color}40`,
                }}
              >
                <Tag className="h-3 w-3" />
                {currentCategory.name}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground italic">Não classificado</span>
            )}
          </div>
          <Select
            value={String(t.category_id || "none")}
            onValueChange={(v) => updateField("category_id", v === "none" ? null : parseInt(v))}
            disabled={updating}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Alterar categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem categoria</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)}>
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Select value={ticket.status} onValueChange={(v) => updateField("status", v)} disabled={updating}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(STATUS_LABELS) as [TicketStatus, string][]).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* SUBSTATUS — filtrado pelo status atual */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Substatus</Label>
          <Select
            value={String(t.substatus_id || "none")}
            onValueChange={(v) => updateField("substatus_id", v === "none" ? null : parseInt(v))}
            disabled={updating || substatuses.filter(s => s.status_parent === ticket.status).length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Nenhum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {substatuses
                .filter(s => s.status_parent === ticket.status)
                .map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Prioridade</Label>
          <Select value={ticket.priority} onValueChange={(v) => updateField("priority", v)} disabled={updating}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(PRIORITY_LABELS) as [TicketPriority, string][]).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Agente Responsável</Label>
          <Select
            value={ticket.assigned_agent_id || "none"}
            onValueChange={(v) => updateField("assigned_agent_id", v === "none" ? null : v)}
            disabled={updating}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Não atribuído" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não atribuído</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>👤 {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default TicketDetailPanel;
