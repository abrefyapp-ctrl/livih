import { useState, useRef, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Ban, Paperclip } from "lucide-react";
import { ReplyPreview, QuotedMessageData } from "@/components/chat/QuotedMessage";

type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";

interface MessageInputProps {
  ticketId: string;
  ticketStatus: TicketStatus;
  agentId?: string | null;
  onSend: (
    ticketId: string,
    content: string,
    file?: File | null,
    agentId?: string | null,
    quotedMessageId?: string | null,  // ← novo parâmetro opcional
  ) => Promise<void>;
  // ── props de reply (opcionais — não quebra quem não usa) ──
  replyTo?: QuotedMessageData | null;
  onCancelReply?: () => void;
}

const MessageInput = ({
  ticketId,
  ticketStatus,
  agentId,
  onSend,
  replyTo,
  onCancelReply,
}: MessageInputProps) => {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isClosed = ticketStatus === "resolved" || ticketStatus === "closed";

  const handleSend = async () => {
    if ((!text.trim() && !file) || !ticketId || isClosed || sending) return;

    setSending(true);

    await onSend(ticketId, text.trim(), file, agentId, replyTo?.id ?? null);

    setText("");
    setFile(null);
    onCancelReply?.(); // limpa a citação após enviar
    setSending(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const blob = imageItem.getAsFile();
      if (blob) {
        const fileName = `print-${Date.now()}.png`;
        const imageFile = new File([blob], fileName, { type: blob.type });
        setFile(imageFile);
      }
    }
  };

  if (isClosed) {
    return (
      <div className="flex items-center gap-2 border-t px-4 py-3">
        <Ban className="h-4 w-4" />
        <span className="text-sm">Este atendimento foi encerrado</span>
      </div>
    );
  }

  return (
    <div className="border-t p-3">
      <div className="flex flex-col gap-2">

        {/* ── Prévia da mensagem citada ── */}
        {replyTo && onCancelReply && (
          <ReplyPreview quoted={replyTo} onCancel={onCancelReply} />
        )}

        {/* Preview do arquivo */}
        {file && (
          <div className="text-xs bg-muted px-2 py-1 rounded flex justify-between items-center gap-2">
            {file.type.startsWith("image/") ? (
              <img
                src={URL.createObjectURL(file)}
                alt="preview"
                className="h-16 rounded object-contain"
              />
            ) : (
              <span>{file.name}</span>
            )}
            <button onClick={() => setFile(null)}>❌</button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Digite sua mensagem..."
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
          />

          {/* input escondido */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          {/* botão de anexo */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {/* enviar */}
          <Button
            onClick={handleSend}
            disabled={(!text.trim() && !file) || sending}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
