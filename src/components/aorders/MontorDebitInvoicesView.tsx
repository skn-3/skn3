import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Send, Loader2, CheckCircle2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { buildMontorDebitPdf } from '@/lib/montorDebitPdf';
import { loadAOrderLogo } from '@/lib/aOrderPdf';
import { useRole } from '@/hooks/useRole';

function fmt(n: number) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }

const STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: 'Skickad', cls: 'bg-blue-500 hover:bg-blue-500/90 text-white' },
  paid: { label: 'Betald', cls: 'bg-green-600 hover:bg-green-600/90 text-white' },
  cancelled: { label: 'Makulerad', cls: 'bg-red-500 hover:bg-red-500/90 text-white' },
};

export function MontorDebitInvoicesView() {
  const qc = useQueryClient();
  const { role } = useRole();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['montor_debit_invoices'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('montor_debit_invoices')
        .select('*, montor_teams(id, name, company_name, org_nr, address, email, invoice_email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  async function viewPdf(inv: any) {
    setBusyId(inv.id);
    try {
      if (inv.pdf_path) {
        const { data, error } = await supabase.storage.from('case-documents').createSignedUrl(inv.pdf_path, 600);
        if (!error && data?.signedUrl) { window.open(data.signedUrl, '_blank'); return; }
      }
      const logo = await loadAOrderLogo();
      const doc = buildMontorDebitPdf({
        invoiceNumber: inv.invoice_number,
        date: inv.date, dueDate: inv.due_date,
        team: inv.montor_teams || {},
        title: inv.title, description: inv.description,
        lines: inv.line_items || [],
        vatMode: inv.vat_mode,
        subtotal: Number(inv.subtotal || 0),
        vatAmount: Number(inv.vat_amount || 0),
        total: Number(inv.total || 0),
        logoDataUrl: logo,
      });
      doc.save(`FAKTURA-${inv.invoice_number}.pdf`);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte hämta PDF');
    } finally {
      setBusyId(null);
    }
  }

  async function resend(inv: any) {
    setBusyId(inv.id);
    try {
      const logo = await loadAOrderLogo();
      const doc = buildMontorDebitPdf({
        invoiceNumber: inv.invoice_number,
        date: inv.date, dueDate: inv.due_date,
        team: inv.montor_teams || {},
        title: inv.title, description: inv.description,
        lines: inv.line_items || [],
        vatMode: inv.vat_mode,
        subtotal: Number(inv.subtotal || 0),
        vatAmount: Number(inv.vat_amount || 0),
        total: Number(inv.total || 0),
        logoDataUrl: logo,
      });
      const pdf_base64 = doc.output('datauristring').split(',')[1] || '';
      const { error } = await supabase.functions.invoke('send-montor-debit-invoice', {
        body: { debit_invoice_id: inv.id, pdf_base64 },
      });
      if (error) throw error;
      toast.success('Faktura skickad igen');
      qc.invalidateQueries({ queryKey: ['montor_debit_invoices'] });
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte skicka');
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(inv: any, status: 'paid' | 'cancelled') {
    const { error } = await (supabase as any).from('montor_debit_invoices').update({ status }).eq('id', inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === 'paid' ? 'Markerad som betald' : 'Makulerad');
    qc.invalidateQueries({ queryKey: ['montor_debit_invoices'] });
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Nr</th>
            <th className="px-3 py-2 text-left">Datum</th>
            <th className="px-3 py-2 text-left">Montör (kund)</th>
            <th className="px-3 py-2 text-left">Moms</th>
            <th className="px-3 py-2 text-right">Summa</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {isLoading && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Laddar...</td></tr>}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Inga montörsfakturor ännu.</td></tr>
          )}
          {rows.map(inv => {
            const meta = STATUS[inv.status] || STATUS.sent;
            return (
              <tr key={inv.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-mono">{inv.invoice_number}</td>
                <td className="px-3 py-2">{inv.date}</td>
                <td className="px-3 py-2">{inv.montor_teams?.company_name || inv.montor_teams?.name || '—'}</td>
                <td className="px-3 py-2 text-xs">{inv.vat_mode === 'vanlig' ? '25%' : 'Omvänd'}</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(inv.total)}</td>
                <td className="px-3 py-2">
                  <Badge className={meta.cls}>{meta.label}</Badge>
                  {inv.sent_at && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Skickad {new Date(inv.sent_at).toLocaleDateString('sv-SE')}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => viewPdf(inv)} disabled={busyId === inv.id} title="PDF">
                      {busyId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                    </Button>
                    {inv.status === 'sent' && (
                      <Button size="sm" variant="ghost" onClick={() => resend(inv)} disabled={busyId === inv.id} title="Skicka igen">
                        <Send className="h-3 w-3" />
                      </Button>
                    )}
                    {role?.isAdmin && inv.status === 'sent' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setStatus(inv, 'paid')} title="Markera betald" className="text-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatus(inv, 'cancelled')} title="Makulera" className="text-red-600">
                          <Ban className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
