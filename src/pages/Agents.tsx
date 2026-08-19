import { useState } from 'react';
import { useAgents } from '@/hooks/useAgents';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Pencil, Trash2 } from 'lucide-react';
import { AgentStats } from '@/types/database';

const Agents = () => {
  const { agents, loading, createAgent, updateAgent, deleteAgent } = useAgents();
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<AgentStats | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => { setName(''); setEmail(''); setPhone(''); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await createAgent(name, email, phone);
    if (ok) { setCreateOpen(false); resetForm(); }
    setSaving(false);
  };

  const openEdit = (a: AgentStats) => {
    setEditAgent(a);
    setName(a.name);
    setEmail(a.email);
    setPhone(a.phone_number || '');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAgent) return;
    setSaving(true);
    const ok = await updateAgent(editAgent.id, { name, email, phone_number: phone });
    if (ok) { setEditAgent(null); resetForm(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deleteAgent(id);
  };

  const formFields = (
    <>
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>E-mail</Label>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Telefone</Label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" />
      </div>
    </>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agentes</h1>
          <p className="text-sm text-muted-foreground">Equipe de atendimento</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="mr-2 h-4 w-4" />Cadastrar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar Agente</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">O agente poderá criar sua própria senha ao fazer login pela primeira vez.</p>
            <form onSubmit={handleCreate} className="space-y-4">
              {formFields}
              <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editAgent} onOpenChange={(o) => { if (!o) { setEditAgent(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Agente</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            {formFields}
            <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead className="hidden md:table-cell">Telefone</TableHead>
                <TableHead>Ativos</TableHead>
                <TableHead className="hidden md:table-cell">Resolvidos</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map(a => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={a.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">{a.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{a.phone_number || '—'}</TableCell>
                  <TableCell className="font-medium">{a.active_tickets}</TableCell>
                  <TableCell className="hidden md:table-cell font-medium">{a.resolved_tickets}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
                            <AlertDialogDescription>Tem certeza que deseja excluir {a.name}? Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(a.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {agents.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum agente encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default Agents;
