import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgents } from '@/hooks/useAgents';
import { TicketPriority, PRIORITY_LABELS } from '@/types/database';
import { Loader2, Paperclip, X, Image, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/lib/env";

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticketId: string) => void;
  defaultContactId?: string; // pré-seleciona contato quando aberto de um ticket existente
}

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  customer_id: string;
  customer_name: string;
  organization_id: string;
}

interface Category {
  id: number;
  name: string;
  color: string;
}

const CreateTicketDialog: React.FC<CreateTicketDialogProps> = ({
  open,
  onOpenChange,
  onCreated,
  defaultContactId,
}) => {
  const { agents } = useAgents();

  // Campos do formulário
  const [contactSearch, setContactSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactList, setShowContactList] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [agentId, setAgentId] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Carrega categorias
  useEffect(() => {
    if (!open) return;
    supabase.from('ticket_categories').select('id, name, color').order('id').then(({ data }) => {
      if (data) setCategories(data);
    });
  }, [open]);

  // Pré-seleciona contato se defaultContactId fornecido
  useEffect(() => {
    if (!open || !defaultContactId) return;
    supabase
      .from('customer_contacts')
      .select('id, name, phone_number, customer_id, customers(name), organization_id')
      .eq('id', defaultContactId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSelectedContact({
            id: data.id,
            name: data.name,
            phone_number: data.phone_number,
            customer_id: data.customer_id,
            customer_name: (data.customers as any)?.name ?? '',
            organization_id: data.organization_id,
          });
        }
      });
  }, [open, defaultContactId]);

  // Busca contatos com debounce
  useEffect(() => {
    if (!contactSearch.trim() || contactSearch.length < 2) {
      setContacts([]);
      setShowContactList(false);
      return;
    }

    setLoadingContacts(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('customer_contacts')
        .select('id, name, phone_number, customer_id, customers(name), organization_id')
        .or(`name.ilike.%${contactSearch}%,phone_number.ilike.%${contactSearch}%`)
        .limit(8);

      setContacts(
        (data || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          phone_number: d.phone_number,
          customer_id: d.customer_id,
          customer_name: d.customers?.name ?? '',
          organization_id: d.organization_id,
        }))
      );
      setShowContactList(true);
      setLoadingContacts(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [contactSearch]);

  // Paste de imagem no textarea
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const blob = imageItem.getAsFile();
      if (blob) {
        setFile(new File([blob], `print-${Date.now()}.png`, { type: blob.type }));
      }
    }
  }, []);

  const reset = () => {
    setContactSearch('');
    setSelectedContact(null);
    setContacts([]);
    setShowContactList(false);
    setCategoryId('');
    setSubject('');
    setPriority('medium');
    setAgentId('');
    setMessage('');
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!selectedContact) return;
    setSubmitting(true);

    try {
      // 1. Criar ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          customer_id: selectedContact.customer_id,
          contact_id: selectedContact.id,
          organization_id: selectedContact.organization_id,
          status: 'open',
          origin: 'direct',
          priority,
          assigned_agent_id: agentId && agentId !== 'none' ? agentId : null,
          category_id: categoryId && categoryId !== 'none' ? parseInt(categoryId) : null,
          subject: subject.trim() || null,
        })
        .select('id, ticket_number')
        .single();

      if (ticketError || !ticket) throw ticketError ?? new Error('Erro ao criar ticket');

      // 2. Upload do arquivo (se houver)
      let file_url: string | null = null;
      let file_type: string | null = null;

      if (file) {
        const fileName = `${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, file);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(fileName);
          file_url = urlData.publicUrl;
          file_type = file.type.startsWith('image/') ? 'image' : 'document';
        }
      }

      // 3. Enviar mensagem inicial (se houver texto ou arquivo)
      if (message.trim() || file_url) {
        await fetch(`${FUNCTIONS_URL}/send-reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:
              `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            ticket_id: ticket.id,
            message: message.trim(),
            file_url,
            file_type,
            sender_agent_id: agentId && agentId !== 'none' ? agentId : null,
          }),
        });
      }

      toast({ title: `Ticket #${ticket.ticket_number} criado com sucesso!` });
      reset();
      onOpenChange(false);
      onCreated(ticket.id);
    } catch (err: any) {
      toast({ title: 'Erro ao criar ticket', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Ticket</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* CLIENTE */}
          <div className="space-y-2">
            <Label>Cliente *</Label>
            {selectedContact ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{selectedContact.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedContact.customer_name} · {selectedContact.phone_number}</p>
                </div>
                <button onClick={() => { setSelectedContact(null); setContactSearch(''); }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    placeholder="Buscar por nome ou telefone..."
                    className="pl-9"
                  />
                  {loadingContacts && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {showContactList && contacts.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-md">
                    {contacts.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedContact(c); setContactSearch(''); setShowContactList(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                      >
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.customer_name} · {c.phone_number}</p>
                      </button>
                    ))}
                  </div>
                )}
                {showContactList && contacts.length === 0 && !loadingContacts && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
                    Nenhum contato encontrado
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ASSUNTO */}
          <div className="space-y-2">
            <Label>Assunto</Label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Descreva brevemente o problema..."
            />
          </div>

          {/* CATEGORIA + PRIORIDADE */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map(cat => (
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

            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={v => setPriority(v as TicketPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(PRIORITY_LABELS) as [TicketPriority, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* AGENTE */}
          <div className="space-y-2">
            <Label>Agente responsável</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder="Nenhum (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>👤 {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* MENSAGEM INICIAL */}
          <div className="space-y-2">
            <Label>Mensagem inicial <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Textarea
              ref={messageRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onPaste={handlePaste}
              placeholder="Digite a mensagem ou cole um print (Ctrl+V)..."
              className="min-h-[80px] max-h-[160px] resize-none text-sm"
            />
          </div>

          {/* ANEXO */}
          <div className="space-y-2">
            {file ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                {file.type.startsWith('image/') ? (
                  <img src={URL.createObjectURL(file)} alt="preview" className="h-12 rounded object-contain" />
                ) : (
                  <>
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                  </>
                )}
                <button onClick={() => setFile(null)} className="ml-auto text-muted-foreground hover:text-foreground shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
              >
                <Paperclip className="h-4 w-4" />
                Anexar arquivo ou cole um print no campo acima (Ctrl+V)
              </button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedContact || submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Criar Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTicketDialog;
