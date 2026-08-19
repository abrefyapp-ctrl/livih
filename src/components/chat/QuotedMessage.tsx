import { X, Reply } from "lucide-react";

export interface QuotedMessageData {
  id: string;
  content_text: string | null;
  content_type: string;
  content_url: string | null;
  sender_type: "customer" | "agent";
  sender_name?: string | null;
}

interface ReplyPreviewProps {
  quoted: QuotedMessageData;
  onCancel: () => void;
}

export function ReplyPreview({ quoted, onCancel }: ReplyPreviewProps) {
  const label = quoted.sender_type === "customer" ? quoted.sender_name || "Cliente" : "Você";
  const preview = getPreviewText(quoted);

  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-muted/60 border-l-4 border-primary rounded-md mx-1 mb-1">
      <Reply size={14} className="mt-0.5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-primary truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{preview}</p>
      </div>
      <button
        onClick={onCancel}
        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        title="Cancelar resposta"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface QuotedBubbleProps {
  quoted: QuotedMessageData;
  isAgent?: boolean;
}

export function QuotedBubble({ quoted, isAgent }: QuotedBubbleProps) {
  const label = quoted.sender_type === "customer" ? quoted.sender_name || "Cliente" : "Você";
  const preview = getPreviewText(quoted);

  return (
    <div
      className={`
        flex flex-col gap-0.5 px-2 py-1.5 rounded mb-1 text-xs
        border-l-[3px]
        ${isAgent
          ? "bg-white/10 border-white/50 text-white/80"
          : "bg-black/5 border-primary/60 text-foreground/70"
        }
      `}
    >
      <span className={`font-semibold ${isAgent ? "text-white/90" : "text-primary"}`}>
        {label}
      </span>

      {quoted.content_type === "imageMessage" && quoted.content_url ? (
        <div className="flex items-center gap-1.5">
          <img
            src={quoted.content_url}
            alt="imagem"
            className="w-10 h-10 object-cover rounded opacity-80 shrink-0"
          />
          <span className="truncate">{quoted.content_text ? truncate(quoted.content_text) : "Imagem"}</span>
        </div>
      ) : quoted.content_type === "audioMessage" ? (
        <span>🎵 Áudio</span>
      ) : quoted.content_type === "documentMessage" ? (
        <span>📄 Documento</span>
      ) : (
        <span className="truncate">{preview}</span>
      )}
    </div>
  );
}

const PREVIEW_MAX = 60;

function truncate(text: string): string {
  return text.length > PREVIEW_MAX ? text.slice(0, PREVIEW_MAX) + "…" : text;
}

function getPreviewText(msg: QuotedMessageData): string {
  if (msg.content_type === "audioMessage") return "🎵 Áudio";
  if (msg.content_type === "imageMessage") return msg.content_text ? `📷 ${truncate(msg.content_text)}` : "📷 Imagem";
  if (msg.content_type === "documentMessage") return "📄 Documento";
  return truncate(msg.content_text || "Mensagem");
}
