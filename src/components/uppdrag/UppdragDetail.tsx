import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { fmtKr } from '@/lib/offerCalc';
import { buildHandpenningPdfBlob, buildSlutfakturaPdfBlob } from '@/lib/invoicePdf';
import { UPPDRAG_STATUS_META, type UppdragStatus } from '@/lib/uppdrag';

type Uppdrag = {
  id: string;
  uppdrag_number: string | null;
  offer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_type: string | null;
  customer_personnummer: string | null;
  fastighetsbeteckning: string | null;
  title: string | null;
  status: UppdragStatus;
  assigned_to: string | null;
  revenue_ex_vat: number | null;
  revenue_incl_vat: number | null;
  rot_amount: number | null;
  handpenning_amount: number | null;
  slutfaktura_amount: number | null;
  handpenning_invoice_no: string | null;
  handpenning_pdf_path: string | null;
  handpenning_sent_at: string | null;
  slutfaktura_invoice_no: string | null;
  slutfaktura_pdf_path: string | null;
  slutfaktura_sent_at: string | null;
};

interface Props {
  uppdragId: string | null;
  onClose: () => void;
}

export function UppdragDetail({ uppdragId, onClose }: Props) {
  const qc = useQueryClient();
  const [u, setU] = useState<Uppdrag | null>(null);
  const [loading, setLoading] = useState(false);
  const [hpNo, setHpNo] = useState('');
  const [sfNo, setSfNo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!uppdragId) { setU(null); return; }
    let active = true;
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any).from('uppdrag').select('*').eq('id', uppdragId).maybeSingle();
      if (!active) return;
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      setU(data);
      setHpNo(data?.handpenning_invoice_no || '');
      setSfNo(data?.slutfaktura_invoice_no || '');
    })();
    return () => { active = false; };
  }, [uppdragId]);

  const refresh = async () => {
    if (!uppdragId) return;
    const { data } = await (supabase as any).from('uppdrag').select('*').eq('id', uppdragId).maybeSingle();
    if (data) setU(data);
    qc.invalidateQueries({ queryKey: ['uppdrag'] });
  };

  const openSigned = async (path: string) => {
    const { data } = await supabase.storage.from('case-documents').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const generateHandpenning = async () => {
    if (!u) return;
    if (!hpNo.trim()) { toast.error('Ange fakturanummer'); return; }
    setBusy('hp-gen');
    try {
      const blob = await buildHandpenningPdfBlob(u, { invoiceNo: hpNo.trim() });
      const path = `invoices/${u.id}-handpenning.pdf`;
      const { error: upErr } = await supabase.storage.from('case-documents').upload(path, blob, { upsert: true, contentType: 'application/pdf' });
      if (upErr) throw upErr;
      const { error: dbErr } = await (supabase as any).from('uppdrag').update({
        handpenning_pdf_path: path, handpenning_invoice_no: hpNo.trim(),
      }).eq('id', u.id);
      if (dbErr) throw dbErr;
      await refresh();
      await openSigned(path);
      toast.success('Handpenningsfaktura genererad');
    } catch (e: any) {
      console.error(e); toast.error(e?.message || 'Kunde inte generera PDF');
    } finally { setBusy(null); }
  };

  const generateSlutfaktura = async () => {
    if (!u) return;
    if (!u.handpenning_pdf_path) { toast.error('Generera handpenningsfakturan först'); return; }
    if (!sfNo.trim()) { toast.error('Ange fakturanummer'); return; }
    if (!u.offer_id) { toast.error('Uppdraget saknar offert'); return; }
    setBusy('sf-gen');
    try {
      const { data: offer, error: oErr } = await (supabase as any).from('offers').select('line_items, rot_base').eq('id', u.offer_id).maybeSingle();
      if (oErr) throw oErr;
      const blob = await buildSlutfakturaPdfBlob(u, offer || {}, { invoiceNo: sfNo.trim() });
      const path = `invoices/${u.id}-slutfaktura.pdf`;
      const { error: upErr } = await supabase.storage.from('case-documents').upload(path, blob, { upsert: true, contentType: 'application/pdf' });
      if (upErr) throw upErr;
      const { error: dbErr } = await (supabase as any).from('uppdrag').update({
        slutfaktura_pdf_path: path, slutfaktura_invoice_no: sfNo.trim(),
      }).eq('id', u.id);
      if (dbErr) throw dbErr;
      await refresh();
      await openSigned(path);
      toast.success('Slutfaktura genererad');
    } catch (e: any) {
      console.error(e); toast.error(e?.message || 'Kunde inte generera PDF');
    } finally { setBusy(null); }
  };

  const send = async (kind: 'handpenning' | 'slutfaktura') => {
    if (!u) return;
    setBusy(`${kind}-send`);
    try {
      const { data, error } = await supabase.functions.invoke('send-invoice', { body: { uppdrag_id: u.id, kind } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if (kind === 'slutfaktura') {
        await (supabase as any).from('uppdrag').update({ status: 'fakturerad' }).eq('id', u.id);
      }
      await refresh();
      toast.success('Skickad till kund');
    } catch (e: any) {
      console.error(e); toast.error(e?.message || 'Kunde inte skicka');
    } finally { setBusy(null); }
  };

  const open = !!uppdragId;
  const meta = u ? UPPDRAG_STATUS_META[u.status] : null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{u?.uppdrag_number || 'Uppdrag'}</SheetTitle>
          <SheetDescription>{u?.title || ''}</SheetDescription>
        </SheetHeader>

        {loading && <div className="py-8 text-center text-muted-foreground">Laddar…</div>}

        {u && (
          <div className="mt-4 space-y-6 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="font-medium">{u.customer_name || '—'}</div>
                {meta && <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>}
              </div>
              {u.customer_address && <div className="text-muted-foreground text-xs">{u.customer_address}</div>}
              {u.customer_email && <div className="text-muted-foreground text-xs">{u.customer_email}</div>}
              {u.customer_type === 'privat' && u.customer_personnummer && (
                <div className="text-muted-foreground text-xs">Personnr {u.customer_personnummer}</div>
              )}
              {u.fastighetsbeteckning && <div className="text-muted-foreground text-xs">Fastighet: {u.fastighetsbeteckning}</div>}
              <div className="pt-2 grid grid-cols-2 gap-2 text-xs">
                <div>Intäkt ex moms: <span className="tabular-nums font-medium">{fmtKr(u.revenue_ex_vat || 0)}</span></div>
                <div>Inkl moms: <span className="tabular-nums font-medium">{fmtKr(u.revenue_incl_vat || 0)}</span></div>
                <div>ROT-avdrag: <span className="tabular-nums">{fmtKr(u.rot_amount || 0)}</span></div>
                <div>Handpenning: <span className="tabular-nums">{fmtKr(u.handpenning_amount || 0)}</span></div>
                <div>Slutfaktura: <span className="tabular-nums">{fmtKr(u.slutfaktura_amount || 0)}</span></div>
              </div>
            </div>

            {/* Handpenningsfaktura */}
            <section className="rounded-md border p-4 space-y-3">
              <h3 className="font-semibold">Handpenningsfaktura</h3>
              <div className="text-xs text-muted-foreground">Belopp inkl moms: <span className="tabular-nums font-medium text-foreground">{fmtKr(u.handpenning_amount || 0)}</span></div>
              <div className="flex items-end gap-2 flex-wrap">
                <label className="text-xs flex-1 min-w-[180px]">
                  <span className="text-muted-foreground">Fakturanummer</span>
                  <Input value={hpNo} onChange={e => setHpNo(e.target.value)} placeholder="t.ex. 2026-101" className="h-9" />
                </label>
                <Button type="button" variant="outline" onClick={generateHandpenning} disabled={busy === 'hp-gen' || !hpNo.trim()}>
                  {busy === 'hp-gen' ? 'Genererar…' : (u.handpenning_pdf_path ? 'Generera om PDF' : 'Generera PDF')}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                {u.handpenning_pdf_path && (
                  <button type="button" onClick={() => openSigned(u.handpenning_pdf_path!)} className="text-xs text-primary hover:underline">
                    Visa PDF
                  </button>
                )}
                <Button type="button" size="sm" onClick={() => send('handpenning')}
                  disabled={busy === 'handpenning-send' || !u.handpenning_pdf_path || !u.customer_email}>
                  {busy === 'handpenning-send' ? 'Skickar…' : 'Skicka till kund'}
                </Button>
                {u.handpenning_sent_at && (
                  <span className="text-xs text-muted-foreground">Skickad {new Date(u.handpenning_sent_at).toLocaleString('sv-SE')}</span>
                )}
              </div>
            </section>

            {/* Slutfaktura */}
            <section className="rounded-md border p-4 space-y-3">
              <h3 className="font-semibold">Slutfaktura</h3>
              <div className="text-xs text-muted-foreground">
                Att betala: <span className="tabular-nums font-medium text-foreground">{fmtKr(u.slutfaktura_amount || 0)}</span>
                <span className="ml-2">(inkl moms {fmtKr(u.revenue_incl_vat || 0)} − handpenning {fmtKr(u.handpenning_amount || 0)} − ROT {fmtKr(u.rot_amount || 0)})</span>
              </div>
              {!u.handpenning_pdf_path && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Generera handpenningsfakturan först – referensnumret används i avräkningen.
                </div>
              )}
              <div className="flex items-end gap-2 flex-wrap">
                <label className="text-xs flex-1 min-w-[180px]">
                  <span className="text-muted-foreground">Fakturanummer</span>
                  <Input value={sfNo} onChange={e => setSfNo(e.target.value)} placeholder="t.ex. 2026-102" className="h-9" />
                </label>
                <Button type="button" variant="outline" onClick={generateSlutfaktura}
                  disabled={busy === 'sf-gen' || !sfNo.trim() || !u.handpenning_pdf_path}>
                  {busy === 'sf-gen' ? 'Genererar…' : (u.slutfaktura_pdf_path ? 'Generera om PDF' : 'Generera PDF')}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                {u.slutfaktura_pdf_path && (
                  <button type="button" onClick={() => openSigned(u.slutfaktura_pdf_path!)} className="text-xs text-primary hover:underline">
                    Visa PDF
                  </button>
                )}
                <Button type="button" size="sm" onClick={() => send('slutfaktura')}
                  disabled={busy === 'slutfaktura-send' || !u.slutfaktura_pdf_path || !u.customer_email}>
                  {busy === 'slutfaktura-send' ? 'Skickar…' : 'Skicka till kund'}
                </Button>
                {u.slutfaktura_sent_at && (
                  <span className="text-xs text-muted-foreground">Skickad {new Date(u.slutfaktura_sent_at).toLocaleString('sv-SE')}</span>
                )}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
