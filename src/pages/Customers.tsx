import { useState } from 'react';
import { useCustomers } from '@/hooks/useCustomers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Customer } from '@/types/database';

const Customers = () => {
  const { customers, loading, search, setSearch, createCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const [createOpen, setCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => { setName(''); setPhone(''); setEmail(''); setCompany(''); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await createCustomer(name, phone, email, company);
    if (ok) { setCreateOpen(false); resetForm(); }
    setSaving(false);
  };

  const openEdit = (c: Customer) => {
    setEditCustomer(c);
    setName(c.name);
    setPhone(c.phone_number);
    setEmail(c.email || '');
    setCompany(c.company || '');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustomer) return;
    setSaving(true);
    const ok = await updateCustomer(editCustomer.id, { name, phone_number: phone, email: email || undefined, company: company || undefined });
    if (ok) { setEditCustomer(null); resetForm(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deleteCustomer(id);
  };

  const formFields = (
    <>
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Telefone</Label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} required placeholder="5511999999999" />
      </div>
      <div className="space-y-2">
        <Label>E-mail</Label>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@empresa.com" />
      </div>
      <div className="space-y-2">
        <Label>Empresa</Label>
        <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Nome da empresa" />
      </div>
    </>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus clientes</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {formFields}
              <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editCustomer} onOpenChange={(o) => { if (!o) { setEditCustomer(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            {formFields}
            <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por nome, telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="hidden md:table-cell">E-mail</TableHead>
                <TableHead className="hidden md:table-cell">Empresa</TableHead>
                <TableHead className="hidden md:table-cell">Criado em</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm">{c.phone_number}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.email || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.company || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                            <AlertDialogDescription>Tem certeza que deseja excluir {c.name}? Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(c.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {customers.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default Customers;
