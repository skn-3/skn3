import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, ExternalLink, Pencil, Download, Send, Briefcase, Copy, FileCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { OfferForm } from './OfferForm';
import { fmtKr } from '@/lib/offerCalc';
import { buildOfferPdfBlob } from '@/lib/offerPdf';
import { createUppdragFromOffer } from '@/lib/uppdrag';

export type OfferRow = {
  id: string;
  offer_number: string | null;
  status: string;
  customer_name: string | null;
  customer_type: 'privat' | 'foretag';
  title: string | null;
  total_incl_vat: number | null;
  total_after_rot: number | null;
  rot_enabled: boolean;
  pdf_path: string | null;
  signed_pdf_path?: string | null;
  case_id: string | null;
  created_at: string;
  updated_at: string;
  // Full fields used by form/pdf:
  [k: string]: any;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Utkast', cls: 'bg-muted text-muted-foreground' },
  sent: { label: 'Skickad', cls: 'bg-blue-100 text-blue-800' },
  accepted: { label: 'Accepterad', cls: 'bg-green-100 text-green-800' },
  declined: { label: 'Avböjd', cls: 'bg-red-100 text-red-800' },
  expired: { label: 'Utgången', cls: 'bg-yellow-100 text-yellow-800' },
};

interface OffersViewProps {
  currentUser: string;
}

export function OffersView({ currentUser }: OffersViewProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<OfferRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: offers, isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('offers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as OfferRow[];
    },
  });

  const effectiveStatusOf = (o: OfferRow): string => {
    let s = o.status;
    if (s === 'sent' && o.valid_until) {
      const end = new Date(o.valid_until);
      end.setHours(23, 59, 59, 999);
      if (Date.now() > end.getTime()) s = 'expired';
    }
    return s;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (offers || []).filter(o => {
      if (statusFilter !== 'all' && effectiveStatusOf(o) !== statusFilter) return false;
      if (q && ![o.offer_number, o.customer_name, o.title].some(v => (v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [offers, search, statusFilter]);

  const handleOpenNew = () => {
    setEditing(null);
    setOpenForm(true);
  };
  const handleOpenEdit = (o: OfferRow) => {
    setEditing(o);
    setOpenForm(true);
  };

  const handleDuplicate = (o: OfferRow) => {
    const omit = new Set([
      'id', 'offer_number', 'status', 'public_token', 'sent_at', 'pdf_path',
      'accepted_at', 'accept_name', 'accept_ip', 'accept_user_agent',
      'declined_at', 'decline_name', 'decline_reason',
    ]);
    const tmpl: any = {};
    for (const [k, v] of Object.entries(o)) {
      if (!omit.has(k)) tmpl[k] = v;
    }
    const d = new Date();
    d.setDate(d.getDate() + 30);
    tmpl.valid_until = d.toISOString().slice(0, 10);
    setEditing(tmpl);
    setOpenForm(true);
  };

  const openPdf = useMutation({
    mutationFn: async (offer: OfferRow) => {
      if (offer.pdf_path) {
        const { data, error } = await supabase.storage.from('case-documents').createSignedUrl(offer.pdf_path, 3600);
        if (error || !data?.signedUrl) throw new Error('Kunde inte öppna PDF');
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      // No saved PDF — generate on the fly and download
      const blob = await buildOfferPdfBlob(offer as any);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (e: any) => toast.error(e?.message || 'Kunde inte öppna PDF'),
  });

  const openSignedPdf = useMutation({
    mutationFn: async (offer: OfferRow) => {
      if (!offer.signed_pdf_path) throw new Error('Signerat avtal saknas');
      const { data, error } = await supabase.storage.from('case-documents').createSignedUrl(offer.signed_pdf_path, 3600);
      if (error || !data?.signedUrl) throw new Error('Kunde inte öppna avtal');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    },
    onError: (e: any) => toast.error(e?.message || 'Kunde inte öppna avtal'),
  });

  const sendOffer = useMutation({
    mutationFn: async (offer: OfferRow) => {
      if (!offer.customer_email) throw new Error('Kunden saknar e-post');
      if (!offer.pdf_path) throw new Error('Generera PDF först');
      const { data, error } = await supabase.functions.invoke('send-offer', { body: { offer_id: offer.id, origin: window.location.origin } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const tok = (data as any)?.public_token as string | undefined;
      const public_url = tok ? `${window.location.origin}/offert/${tok}` : ((data as any)?.public_url as string);
      return { email: offer.customer_email as string, public_url };
    },
    onSuccess: async (res) => {
      toast.success(`Offert skickad till ${res.email}`);
      try { await navigator.clipboard.writeText(res.public_url); } catch {}
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['case_offers'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Kunde inte skicka offert'),
  });

  const createUppdrag = useMutation({
    mutationFn: async (offer: OfferRow) => createUppdragFromOffer(offer, currentUser),
    onSuccess: (res) => {
      toast.success(`Uppdrag ${res.uppdrag_number || ''} skapat`);
      qc.invalidateQueries({ queryKey: ['uppdrag'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Kunde inte skapa uppdrag'),
  });



  return (
    <div className="px-3 md:px-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Offerter</h2>
          <p className="text-sm text-muted-foreground">Skapa, redigera och ladda ner offerter som PDF.</p>
        </div>
        <Button onClick={handleOpenNew} className="gap-2">
          <Plus className="h-4 w-4" /> Ny offert
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'draft', 'sent', 'accepted', 'declined', 'expired'] as const).map(key => {
          const isActive = statusFilter === key;
          const label = key === 'all' ? 'Alla' : STATUS_META[key].label;
          const cls = key === 'all'
            ? (isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')
            : `${STATUS_META[key].cls} ${isActive ? 'ring-2 ring-offset-1 ring-primary' : 'opacity-70 hover:opacity-100'}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition ${cls}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Sök offertnr, kund eller titel…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>


      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Offertnr</th>
              <th className="text-left px-3 py-2">Kund</th>
              <th className="text-left px-3 py-2">Titel</th>
              <th className="text-right px-3 py-2">Belopp</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Datum</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Laddar…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Inga offerter ännu</td></tr>
            )}
            {filtered.map(o => {
              const amount = o.rot_enabled && o.total_after_rot != null ? o.total_after_rot : o.total_incl_vat;
              // Computed expiry: offer valid through end of valid_until day
              let effectiveStatus = o.status;
              if (effectiveStatus === 'sent' && o.valid_until) {
                const end = new Date(o.valid_until);
                end.setHours(23, 59, 59, 999);
                if (Date.now() > end.getTime()) effectiveStatus = 'expired';
              }
              const meta = STATUS_META[effectiveStatus] || STATUS_META.draft;
              return (
                <tr key={o.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => handleOpenEdit(o)}>
                  <td className="px-3 py-2 font-medium">{o.offer_number || '—'}</td>
                  <td className="px-3 py-2">
                    {o.customer_name || '—'}
                    {o.status === 'declined' && o.declined_at && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Avböjd {new Date(o.declined_at).toLocaleDateString('sv-SE')}{o.decline_reason ? ` · ${o.decline_reason}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate">{o.title || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{amount != null ? fmtKr(amount) : '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
                    {o.status === 'accepted' && o.accept_name && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        av {o.accept_name}{o.accepted_at ? ` • ${new Date(o.accepted_at).toLocaleDateString('sv-SE')}` : ''}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2 text-muted-foreground">{new Date(o.created_at).toLocaleDateString('sv-SE')}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openPdf.mutate(o); }}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 mr-3"
                      title={o.pdf_path ? 'Öppna sparad PDF' : 'Generera & öppna PDF'}
                    >
                      {o.pdf_path ? <ExternalLink className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); sendOffer.mutate(o); }}
                      disabled={!o.customer_email || !o.pdf_path || sendOffer.isPending}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 mr-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                      title={!o.customer_email ? 'Kunden saknar e-post' : !o.pdf_path ? 'Generera PDF först' : 'Skicka till kund'}
                    >
                      <Send className="h-3 w-3" /> Skicka
                    </button>
                    {o.status === 'accepted' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); createUppdrag.mutate(o); }}
                        disabled={createUppdrag.isPending}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 mr-3 disabled:opacity-40"
                        title="Skapa uppdrag från denna offert"
                      >
                        <Briefcase className="h-3 w-3" /> Skapa uppdrag
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(o); }}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mr-3"
                      title="Duplicera"
                    >
                      <Copy className="h-3 w-3" /> Duplicera
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleOpenEdit(o); }}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Pencil className="h-3 w-3" /> Öppna
                    </button>

                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Sheet open={openForm} onOpenChange={(v) => { setOpenForm(v); if (!v) setEditing(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
          <SheetHeader className="px-5 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> {editing ? `Offert ${editing.offer_number || ''}` : 'Ny offert'}
            </SheetTitle>
          </SheetHeader>
          <div className="px-5 py-4">
            <OfferForm
              key={editing?.id || 'new'}
              offer={editing}
              currentUser={currentUser}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ['offers'] });
                qc.invalidateQueries({ queryKey: ['case_offers'] });
              }}
              onClose={() => { setOpenForm(false); setEditing(null); }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
