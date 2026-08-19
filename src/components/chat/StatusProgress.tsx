import { cn } from "@/lib/utils";
import { TicketStatus } from "@/types/database";
import { Check, Clock, Ban } from "lucide-react";

interface StatusProgressProps {
  currentStatus: TicketStatus;
  substatusName?: string | null;
}

// Fluxo principal linear
const MAIN_FLOW: { status: TicketStatus; label: string; short: string }[] = [
  { status: "open",         label: "Aberto",         short: "Aberto" },
  { status: "in_analysis",  label: "Em Análise",      short: "Análise" },
  { status: "in_progress",  label: "Em Atendimento",  short: "Atend." },
  { status: "resolved",     label: "Resolvido",       short: "Resolvido" },
  { status: "closed",       label: "Fechado",         short: "Fechado" },
];

// Status que são "desvios" do fluxo principal
const SIDE_STATUSES: Partial<Record<TicketStatus, { label: string; color: string; bg: string }>> = {
  waiting_customer:    { label: "Aguardando Cliente",   color: "text-orange-500",  bg: "bg-orange-500" },
  waiting_third_party: { label: "Aguardando Terceiro",  color: "text-purple-500",  bg: "bg-purple-500" },
  cancelled:           { label: "Cancelado",            color: "text-red-500",     bg: "bg-red-500" },
};

const STEP_COLORS: Record<string, { dot: string; line: string }> = {
  done:    { dot: "bg-green-500 border-green-500",  line: "bg-green-500" },
  current: { dot: "bg-blue-500 border-blue-500",    line: "bg-border" },
  pending: { dot: "bg-background border-border",    line: "bg-border" },
};

const StatusProgress: React.FC<StatusProgressProps> = ({ currentStatus, substatusName }) => {
  const isSideStatus = currentStatus in SIDE_STATUSES;
  const isCancelled  = currentStatus === "cancelled";

  // Índice no fluxo principal (se for side status, considera em in_progress)
  const currentMainIndex = isSideStatus
    ? MAIN_FLOW.findIndex(s => s.status === "in_progress")
    : MAIN_FLOW.findIndex(s => s.status === currentStatus);

  return (
    <div className="space-y-3">
      {/* Stepper principal */}
      <div className="flex items-center w-full">
        {MAIN_FLOW.map((step, index) => {
          const isDone    = !isCancelled && index < currentMainIndex;
          const isCurrent = !isCancelled && index === currentMainIndex && !isSideStatus;
          const isPending = isCancelled || index > currentMainIndex || (isSideStatus && index > currentMainIndex);
          const state     = isDone ? "done" : isCurrent ? "current" : "pending";
          const colors    = STEP_COLORS[state];

          return (
            <div key={step.status} className="flex items-center flex-1 last:flex-none">
              {/* Dot + label */}
              <div className="flex flex-col items-center gap-1 relative">
                <div
                  className={cn(
                    "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                    colors.dot,
                    isCurrent && "ring-2 ring-blue-500/30 ring-offset-1 ring-offset-background"
                  )}
                >
                  {isDone && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  {isCurrent && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <span
                  className={cn(
                    "text-[9px] font-medium leading-tight text-center w-10",
                    isDone    && "text-green-500",
                    isCurrent && "text-blue-500",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {step.short}
                </span>
              </div>

              {/* Linha entre steps */}
              {index < MAIN_FLOW.length - 1 && (
                <div className={cn("flex-1 h-0.5 mb-4 mx-0.5 transition-all", isDone ? colors.line : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Badge de status lateral (quando fora do fluxo principal) */}
      {isSideStatus && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status atual</p>
            <p className={cn("text-xs font-semibold", SIDE_STATUSES[currentStatus]?.color)}>
              {SIDE_STATUSES[currentStatus]?.label}
            </p>
          </div>
          <div className={cn("ml-auto h-2 w-2 rounded-full animate-pulse", SIDE_STATUSES[currentStatus]?.bg)} />
        </div>
      )}

      {/* Badge de cancelado */}
      {isCancelled && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-500/10 px-3 py-2">
          <Ban className="h-3.5 w-3.5 shrink-0 text-red-500" />
          <p className="text-xs font-semibold text-red-500">Ticket Cancelado</p>
        </div>
      )}

      {/* Substatus atual */}
      {substatusName && !isCancelled && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{substatusName}</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default StatusProgress;
