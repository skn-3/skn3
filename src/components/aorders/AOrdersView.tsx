import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, FileText, Send, Loader2, Receipt, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AOrderForm } from './AOrderForm';
import { InvoiceAOrderDialog } from './InvoiceAOrderDialog';
import { CreditAOrderDialog } from './CreditAOrderDialog';
import { ImportInvoicesView } from './ImportInvoicesView';
import { buildAOrderPdf, loadAOrderLogo } from '@/lib/aOrderPdf';
import { useRole } from '@/hooks/useRole';

interface Props { currentUser: string }

function fmt(n: number) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  order: { label: 'Order', cls: 'bg-yellow-500 hover:bg-yellow-500/90 text-white' },
  invoiced: { label: 'Fakturerad', cls: 'bg-green-600 hover:bg-green-600/90 text-white' },
  credited: { label: 'Krediterad', cls: 'bg-red-500 hover:bg-red-500/90 text-white' },
};

export function AOrdersView({ currentUser }: Props) {
  const { role } = useRole();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [assignFor, setAssignFor] = useState<any | null>(null);
  const [assignTeam, setAssignTeam] = useState<string>('');
  const [search, setSearch] = useState('');
  const [invoiceFor, setInvoiceFor] = useState<any | null>(null);
  const [creditFor, setCreditFor] = useState<any | null>(null);
  const [deleteFor, setDeleteFor] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['a_orders_all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('a_orders').select('*, montor_teams(id, name, company_name, org_nr, address, email, invoice_email, bankgiro, invoice_prefix, next_invoice_number)').order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['montor_teams'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('montor_teams').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  const pending = useMemo(() => orders.filter(o => !o.team_id), [orders]);
  const totalPending = useMemo(() => pending.reduce((s, o) => s + Number(o.total_amount || 0), 0), [pending]);
  const internalPending = useMemo(() => pending.reduce((s, o) => s + Number(o.internal_extra_hours || 0) * Number(o.internal_hour_rate || 0) + Number(o.internal_extra_amount || 0), 0), [pending]);
  const montorPending = totalPending;

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o =>
      (o.customer_address || '').toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q) ||
      String(o.order_number || '').includes(q)
    );
  }, [orders, search]);

  function openNew() { setEditing(null); setFormOpen(true); }
  function openEdit(o: any) { setEditing(o); setFormOpen(true); }

  async function doAssign() {
    if (!assignFor || !assignTeam) return;
    const { error } = await (supabase as any).from('a_orders').update({ team_id: assignTeam }).eq('id', assignFor.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Montör tilldelad');
    setAssignFor(null); setAssignTeam('');
    qc.invalidateQueries({ queryKey: ['a_orders_all'] });
  }

  function internalOf(o: any) {
    return Math.round(Number(o.internal_extra_hours || 0) * Number(o.internal_hour_rate || 0) + Number(o.internal_extra_amount || 0));
  }

  const [busyId, setBusyId] = useState<string | null>(null);

  async function fetchOrder(id: string) {
    const { data, error } = await (supabase as any).from('a_orders').select('*, montor_teams(*)').eq('id', id).maybeSingle();
    if (error || !data) throw error || new Error('Hittades inte');
    return data;
  }

  async function rowPdf(o: any) {
    setBusyId(o.id);
    try {
      if (o.pdf_path) {
        const { data, error } = await supabase.storage.from('case-documents').createSignedUrl(o.pdf_path, 600);
        if (!error && data?.signedUrl) { window.open(data.signedUrl, '_blank'); return; }
      }
      const full = await fetchOrder(o.id);
      const logo = await loadAOrderLogo();
      const doc = buildAOrderPdf({
        date: full.date,
        orderNumber: full.order_number,
        customerAddress: full.customer_address || '',
        customerName: full.customer_name,
        lines: full.line_items || [],
        description: full.description,
        team: full.montor_teams,
        logoDataUrl: logo,
      });
      const addrSafe = String(full.customer_address || 'adress').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
      doc.save(`A-ORDER-${full.order_number}-${addrSafe}.pdf`);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte hämta PDF');
    } finally {
      setBusyId(null);
    }
  }

  async function rowSend(o: any) {
    if (!o.team_id) { toast.error('Tilldela montör först'); return; }
    setBusyId(o.id);
    try {
      const full = await fetchOrder(o.id);
      if (!full.montor_teams?.email) { toast.error('Montörsteamet saknar e-post'); return; }
      const logo = await loadAOrderLogo();
      const doc = buildAOrderPdf({
        date: full.date,
        orderNumber: full.order_number,
        customerAddress: full.customer_address || '',
        customerName: full.customer_name,
        lines: full.line_items || [],
        description: full.description,
        team: full.montor_teams,
        logoDataUrl: logo,
      });
      const pdf_base64 = (doc.output('datauristring').split(',')[1]) || '';
      const { error } = await supabase.functions.invoke('send-a-order', { body: { a_order_id: o.id, pdf_base64 } });
      if (error) throw error;
      toast.success('A-order skickad');
      qc.invalidateQueries({ queryKey: ['a_orders_all'] });
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte skicka');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(o: any) {
    setDeletingId(o.id);
    try {
      const pathsToDelete: string[] = [];
      if (o.pdf_path) {
        pathsToDelete.push(o.pdf_path);
      }
      
      // List and delete files under a-orders/{id}
      const { data: files, error: listError } = await supabase.storage
        .from('case-documents')
        .list(`a-orders/${o.id}`);
        
      if (!listError && files && files.length > 0) {
        for (const file of files) {
          pathsToDelete.push(`a-orders/${o.id}/${file.name}`);
        }
      }

      if (pathsToDelete.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('case-documents')
          .remove(pathsToDelete);
        if (storageError) {
          console.error('Kunde inte radera filer från lagring:', storageError);
        }
      }

      const { error } = await supabase.from('a_orders').delete().eq('id', o.id);
      if (error) throw error;

      toast.success(`A-order #${o.order_number || ''} raderades framgångsrikt`);
      qc.invalidateQueries({ queryKey: ['a_orders_all'] });
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte radera A-order');
    } finally {
      setDeletingId(null);
      setDeleteFor(null);
    }
  }

  return (
    <div className="px-3 md:px-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">A-ordrar</h2>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Ny A-order</Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Utestående ({pending.length})</TabsTrigger>
          <TabsTrigger value="history">Historik</TabsTrigger>
          <TabsTrigger value="import">Importera fakturor</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">Utestående totalt</div>
            <div className="text-3xl font-semibold">{fmt(totalPending)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              varav montörsvärde <span className="font-medium text-foreground">{fmt(montorPending)}</span> · internt <span className="font-medium text-foreground">{fmt(internalPending)}</span>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Ordernr</th>
                  <th className="px-3 py-2 text-left">Datum</th>
                  <th className="px-3 py-2 text-left">Kund</th>
                  <th className="px-3 py-2 text-left">Adress</th>
                  <th className="px-3 py-2 text-right">Enheter</th>
                  <th className="px-3 py-2 text-right">Montörsvärde</th>
                  <th className="px-3 py-2 text-right">Internt</th>
                  <th className="px-3 py-2 text-right">Totalt</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pending.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Inga utestående A-ordrar.</td></tr>
                )}
                {pending.map(o => {
                  const units = (o.window_count || 0) + (o.door_count || 0) + (o.roof_window_count || 0);
                  const intern = internalOf(o);
                  return (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono">#{o.order_number}</td>
                      <td className="px-3 py-2">{o.date}</td>
                      <td className="px-3 py-2">{o.customer_name || '—'}</td>
                      <td className="px-3 py-2">{o.customer_address}</td>
                      <td className="px-3 py-2 text-right">{units}</td>
                      <td className="px-3 py-2 text-right">{fmt(o.total_amount)}</td>
                      <td className="px-3 py-2 text-right">{fmt(intern)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(Number(o.total_amount || 0) + intern)}</td>
                      <td className="px-3 py-2 text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => { setAssignFor(o); setAssignTeam(''); }}>Tilldela montör</Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>Öppna</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Sök adress, kund eller ordernr..." className="pl-9" />
          </div>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Ordernr</th>
                  <th className="px-3 py-2 text-left">Datum</th>
                  <th className="px-3 py-2 text-left">Kund</th>
                  <th className="px-3 py-2 text-left">Adress</th>
                  <th className="px-3 py-2 text-left">Montör</th>
                  <th className="px-3 py-2 text-right">Summa</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Laddar...</td></tr>}
                {!isLoading && filteredHistory.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Inga A-ordrar.</td></tr>
                )}
                {filteredHistory.map(o => {
                  const intern = internalOf(o);
                  const isCredit = o.status === 'credited';
                  const meta = STATUS_BADGE[o.status] || STATUS_BADGE.order;
                  return (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono">{o.order_number ? `#${o.order_number}` : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{o.date}</td>
                      <td className="px-3 py-2">{o.customer_name || '—'}</td>
                      <td className="px-3 py-2">{o.customer_address}</td>
                      <td className="px-3 py-2">
                        {o.montor_teams?.name ? o.montor_teams.name : <Badge className="bg-yellow-500 hover:bg-yellow-500/90 text-white">Ej tilldelad</Badge>}
                      </td>
                      <td className={`px-3 py-2 text-right ${isCredit ? 'text-red-600' : ''}`}>
                        {fmt(o.total_amount)}
                        {intern > 0 && <div className="text-[10px] text-muted-foreground">internt {fmt(intern)}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={meta.cls}>{isCredit ? 'Kreditfaktura' : meta.label}</Badge>
                        {o.invoice_number && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {isCredit ? 'Kreditnr' : 'Fakturanr'}: {o.invoice_number}
                            {o.invoice_sent_at && ` · ${new Date(o.invoice_sent_at).toLocaleDateString('sv-SE')}`}
                          </div>
                        )}
                        {isCredit && o.credited_from_order_id && (
                          <div className="text-[10px] text-red-600 mt-0.5">avser tidigare faktura</div>
                        )}
                        {o.order_sent_at && !o.invoice_number && (
                          <div className="text-[10px] text-muted-foreground mt-1">Skickad {new Date(o.order_sent_at).toLocaleDateString('sv-SE')}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => rowPdf(o)} disabled={busyId === o.id} title="PDF">
                            {busyId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                          </Button>
                          {o.status === 'order' && o.team_id && (
                            <Button size="sm" variant="ghost" onClick={() => setInvoiceFor(o)} title="Fakturera" className="text-green-700">
                              <Receipt className="h-3 w-3" />
                            </Button>
                          )}
                           {o.status === 'invoiced' && (
                            <Button size="sm" variant="ghost" onClick={() => setCreditFor(o)} title="Kreditera" className="text-red-600">
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          )}
                          {o.status === 'order' && (
                            <Button size="sm" variant="ghost" onClick={() => rowSend(o)} disabled={busyId === o.id || !o.team_id} title="Skicka A-order till montör">
                              <Send className="h-3 w-3" />
                            </Button>
                          )}
                          {role?.isAdmin && o.status === 'order' && (
                            <Button size="sm" variant="ghost" onClick={() => setDeleteFor(o)} title="Radera A-order" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>Öppna</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="import">
          <ImportInvoicesView />
        </TabsContent>
      </Tabs>

      {/* Assign dialog */}
      <Dialog open={!!assignFor} onOpenChange={v => { if (!v) setAssignFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tilldela montör</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">A-order #{assignFor?.order_number} — {assignFor?.customer_address}</div>
            <Select value={assignTeam} onValueChange={setAssignTeam}>
              <SelectTrigger><SelectValue placeholder="Välj montör..." /></SelectTrigger>
              <SelectContent>
                {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignFor(null)}>Avbryt</Button>
            <Button onClick={doAssign} disabled={!assignTeam}>Tilldela</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AOrderForm
        key={editing?.id ?? 'new'}
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        order={editing}
        currentUser={currentUser}
        onSaved={() => qc.invalidateQueries({ queryKey: ['a_orders_all'] })}
      />

      <InvoiceAOrderDialog
        order={invoiceFor}
        open={!!invoiceFor}
        onOpenChange={(v) => { if (!v) setInvoiceFor(null); }}
        currentUser={currentUser}
      />

      <CreditAOrderDialog
        order={creditFor}
        open={!!creditFor}
        onOpenChange={(v) => { if (!v) setCreditFor(null); }}
        currentUser={currentUser}
      />

      <AlertDialog open={!!deleteFor} onOpenChange={(v) => { if (!v) setDeleteFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera A-order #{deleteFor?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta går inte att ångra. Kopplade filer tas också bort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId === deleteFor?.id}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={deletingId === deleteFor?.id}
              onClick={(e) => {
                e.preventDefault();
                handleDelete(deleteFor);
              }}
            >
              {deletingId === deleteFor?.id ? 'Raderar...' : 'Radera'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
