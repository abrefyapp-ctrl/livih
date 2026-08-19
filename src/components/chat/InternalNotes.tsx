import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Paperclip, Send, X, Stethoscope, Zap, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Note {
  id: string;
  content: string;
  type: "internal" | "public";
  note_type: "diagnostico" | "acao" | "observacao" | "followup" | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  author_name: string;
  author_id: string;
}

interface Agent {
  id: string;
  name: string;
  email: string;
}

const NOTE_TYPES = [
  { value: "diagnostico", label: "Diagnóstico", icon: Stethoscope, color: "text-blue-500",   bg: "bg-blue-500/10 border-blue-500/30" },
  { value: "acao",        label: "Ação",        icon: Zap,          color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30" },
  { value: "observacao",  label: "Observação",  icon: Eye,          color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/30" },
  { value: "followup",    label: "Follow-up",   icon: RefreshCw,    color: "text-green-500",  bg: "bg-green-500/10 border-green-500/30" },
] as const;

interface InternalNotesProps {
  ticketId: string;
  currentAgentId: string | null;
  agents: Agent[];
}

const InternalNotes: React.FC<InternalNotesProps> = ({ ticketId, currentAgentId, agents }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Carrega notas
  const fetchNotes = useCallback(async () => {
    const { data } = await supabase
      .from("ticket_notes")
      .select("id, content, type, note_type, attachment_url, attachment_name, created_at, author_id, agents(name)")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (data) {
      setNotes(data.map((n: any) => ({
        ...n,
        author_name: n.agents?.name ?? "Agente",
      })));
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    fetchNotes();

    // Realtime
    const channel = supabase
      .channel(`notes-${ticketId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "ticket_notes",
        filter: `ticket_id=eq.${ticketId}`,
      }, fetchNotes)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ticketId, fetchNotes]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes]);

  // Detecta @ para mencionar agentes
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const filteredAgents = mentionQuery !== null
    ? agents.filter(a => a.name.toLowerCase().includes(mentionQuery))
    : [];

  const insertMention = (agent: Agent) => {
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const textBefore = content.slice(0, cursor);
    const textAfter = content.slice(cursor);
    const newText = textBefore.replace(/@\w*$/, `@${agent.name} `) + textAfter;
    setContent(newText);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  // Paste de imagem
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const blob = imageItem.getAsFile();
      if (blob) setFile(new File([blob], `print-${Date.now()}.png`, { type: blob.type }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredAgents.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredAgents.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredAgents[mentionIndex]); return; }
      if (e.key === "Escape")    { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if ((!content.trim() && !file) || !currentAgentId || sending) return;
    setSending(true);

    try {
      let attachment_url: string | null = null;
      let attachment_name: string | null = null;

      if (file) {
        const fileName = `notes/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("uploads").upload(fileName, file);
        if (!error) {
          const { data } = supabase.storage.from("uploads").getPublicUrl(fileName);
          attachment_url = data.publicUrl;
          attachment_name = file.name;
        }
      }

      // Extrair menções (@Nome → busca agent id)
      const mentionedNames = [...content.matchAll(/@([\w\s]+?)(?=\s|$)/g)].map(m => m[1].trim());
      const mentions = agents
        .filter(a => mentionedNames.some(n => a.name.toLowerCase().startsWith(n.toLowerCase())))
        .map(a => a.id);

      const { data: inserted, error } = await supabase.from("ticket_notes").insert({
        ticket_id: ticketId,
        author_id: currentAgentId,
        content: content.trim(),
        type: "internal",
        note_type: noteType || null,
        attachment_url,
        attachment_name,
        mentions: mentions.length > 0 ? mentions : null,
        organization_id: null,
      }).select("id, content, type, note_type, attachment_url, attachment_name, created_at, author_id").single();

      if (error) throw error;

      // ✅ Adiciona imediatamente ao estado local (não espera realtime)
      if (inserted) {
        const authorName = agents.find(a => a.id === currentAgentId)?.name ?? "Eu";
        setNotes(prev => [...prev, { ...inserted, author_name: authorName }]);
      }

      setContent("");
      setFile(null);
      setNoteType(null);
    } catch (err: any) {
      toast({ title: "Erro ao salvar nota", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Carregando notas...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Timeline de notas */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {notes.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground">Nenhuma nota interna ainda</p>
          </div>
        )}

        {notes.map(note => {
          const nt = NOTE_TYPES.find(t => t.value === note.note_type);
          const NtIcon = nt?.icon;
          const isOwnNote = note.author_id === currentAgentId;

          return (
            <div key={note.id} className={cn("flex flex-col gap-1", isOwnNote ? "items-end" : "items-start")}>
              {/* Header */}
              <div className="flex items-center gap-1.5 px-1">
                <span className="text-[10px] font-medium text-amber-600">{note.author_name}</span>
                {nt && NtIcon && (
                  <span className={cn("flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full border", nt.bg, nt.color)}>
                    <NtIcon className="h-2.5 w-2.5" />
                    {nt.label}
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground">
                  {format(new Date(note.created_at), "HH:mm", { locale: ptBR })}
                </span>
              </div>

              {/* Conteúdo */}
              <div className={cn(
                "max-w-[75%] rounded-2xl px-3 py-2 text-sm border",
                isOwnNote
                  ? "bg-amber-400/20 dark:bg-amber-500/20 border-amber-400/50 dark:border-amber-500/40 rounded-br-sm"
                  : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 rounded-bl-sm"
              )}>
                {/* Renderiza @menções em destaque */}
                <p className="whitespace-pre-wrap break-words text-sm">
                  {note.content.split(/(@\S+)/g).map((part, i) =>
                    part.startsWith("@")
                      ? <span key={i} className="font-semibold text-amber-600">{part}</span>
                      : part
                  )}
                </p>

                {/* Anexo */}
                {note.attachment_url && (
                  <div className="mt-2">
                    {note.attachment_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      <img src={note.attachment_url} alt={note.attachment_name ?? "anexo"} className="max-h-40 rounded-lg object-contain" />
                    ) : (
                      <a href={note.attachment_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-xs underline text-amber-700">
                        <Paperclip className="h-3 w-3" />
                        {note.attachment_name ?? "Anexo"}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/10 p-3 space-y-2">
        {/* Tipos de nota */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1">Tipo:</span>
          {NOTE_TYPES.map(t => {
            const Icon = t.icon;
            const active = noteType === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setNoteType(active ? null : t.value)}
                className={cn(
                  "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-all",
                  active ? cn(t.bg, t.color, "font-semibold") : "border-border text-muted-foreground hover:border-amber-300"
                )}
              >
                <Icon className="h-2.5 w-2.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Preview de arquivo */}
        {file && (
          <div className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1 text-xs">
            {file.type.startsWith("image/")
              ? <img src={URL.createObjectURL(file)} alt="preview" className="h-10 rounded object-contain" />
              : <><Paperclip className="h-3 w-3" /><span className="truncate">{file.name}</span></>
            }
            <button onClick={() => setFile(null)} className="ml-auto text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Mention dropdown */}
        {mentionQuery !== null && filteredAgents.length > 0 && (
          <div className="rounded-md border border-border bg-popover shadow-md overflow-hidden">
            {filteredAgents.map((agent, i) => (
              <button
                key={agent.id}
                onClick={() => insertMention(agent)}
                className={cn("w-full text-left px-3 py-1.5 text-sm hover:bg-accent", i === mentionIndex && "bg-accent")}
              >
                @{agent.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Nota interna... use @nome para mencionar"
            className="min-h-[44px] max-h-[120px] resize-none text-sm bg-background border-amber-300 dark:border-amber-700 focus:ring-amber-400"
          />

          <input type="file" ref={fileInputRef} className="hidden"
            onChange={e => setFile(e.target.files?.[0] || null)} />

          <Button type="button" variant="outline" size="icon"
            className="border-amber-300 dark:border-amber-700 shrink-0"
            onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>

          <Button size="icon" onClick={handleSend}
            disabled={(!content.trim() && !file) || sending}
            className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-[9px] text-amber-600/70 text-center">
          🔒 Nota interna — não será enviada ao cliente
        </p>
      </div>
    </div>
  );
};

export default InternalNotes;
