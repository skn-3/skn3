import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fmtKr } from '@/lib/offerCalc';
import { UPPDRAG_STATUS_META, type UppdragStatus } from '@/lib/uppdrag';
import { UppdragDetail } from './UppdragDetail';

type UppdragRow = {
  id: string;
  uppdrag_number: string | null;
  offer_id: string | null;
  customer_name: string | null;
  title: string | null;
  status: UppdragStatus;
  assigned_to: string | null;
  revenue_ex_vat: number | null;
  cost_ex_vat: number | null;
  created_at: string;
};

const STATUS_OPTIONS: UppdragStatus[] = ['ej_paborjad', 'pagar', 'klar', 'fakturerad'];

export function UppdragView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['uppdrag'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('uppdrag')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as UppdragRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows || [];
    return (rows || []).filter(r =>
      [r.uppdrag_number, r.customer_name, r.title, r.assigned_to].some(v => (v || '').toLowerCase().includes(q))
    );
  }, [rows, search]);

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<UppdragRow> }) => {
      const { error } = await (supabase as any).from('uppdrag').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uppdrag'] }),
    onError: (e: any) => toast.error(e?.message || 'Kunde inte uppdatera'),
  });

  const openOffer = async (offerId: string | null) => {
    if (!offerId) return;
    const { data, error } = await (supabase as any).from('offers').select('pdf_path').eq('id', offerId).maybeSingle();
    if (error || !data?.pdf_path) { toast.info('Ingen sparad offert-PDF'); return; }
    const { data: signed } = await supabase.storage.from('case-documents').createSignedUrl(data.pdf_path, 3600);
    if (signed?.signedUrl) window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="px-3 md:px-4 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Uppdrag</h2>
        <p className="text-sm text-muted-foreground">Accepterade offerter blir uppdrag. Tilldela montör/UE och följ status.</p>
      </div>

      <div className="max-w-sm">
        <Input placeholder="Sök uppdragsnr, kund, titel eller montör…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Uppdragsnr</th>
              <th className="text-left px-3 py-2">Kund</th>
              <th className="text-left px-3 py-2">Titel</th>
              <th className="text-left px-3 py-2">Tilldelad</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Ekonomi</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Laddar…</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Inga uppdrag ännu</td></tr>
            )}
            {filtered.map(r => {
              const rev = Number(r.revenue_ex_vat || 0);
              const cost = r.cost_ex_vat != null ? Number(r.cost_ex_vat) : null;
              const margin = cost != null ? rev - cost : null;
              const marginPct = cost != null && rev > 0 ? (margin! / rev * 100) : null;
              const meta = UPPDRAG_STATUS_META[r.status] || UPPDRAG_STATUS_META.ej_paborjad;
              return (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{r.uppdrag_number || '—'}</td>
                  <td className="px-3 py-2">{r.customer_name || '—'}</td>
                  <td className="px-3 py-2 max-w-xs truncate">{r.title || '—'}</td>
                  <td className="px-3 py-2">
                    <Input
                      defaultValue={r.assigned_to || ''}
                      placeholder="Montör/UE"
                      className="h-8 text-xs min-w-[140px]"
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== (r.assigned_to || null)) update.mutate({ id: r.id, patch: { assigned_to: v } });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.status}
                      onChange={(e) => update.mutate({ id: r.id, patch: { status: e.target.value as UppdragStatus } })}
                      className="text-xs border rounded px-2 py-1 bg-background"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{UPPDRAG_STATUS_META[s].label}</option>
                      ))}
                    </select>
                    <div className="mt-1"><Badge variant="secondary" className={meta.cls}>{meta.label}</Badge></div>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <div>Intäkt (ex moms) <span className="tabular-nums font-medium">{fmtKr(rev)}</span></div>
                    {cost != null ? (
                      <>
                        <div className="text-muted-foreground">Kostnad <span className="tabular-nums">{fmtKr(cost)}</span></div>
                        <div className={margin! >= 0 ? 'text-green-700' : 'text-red-700'}>
                          Marginal <span className="tabular-nums font-medium">{fmtKr(margin!)}</span>
                          {marginPct != null && <span className="text-muted-foreground"> ({marginPct.toFixed(1)} %)</span>}
                        </div>
                      </>
                    ) : (
                      <div className="text-muted-foreground italic">Ingen kostnad registrerad</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.offer_id && (
                      <button
                        type="button"
                        onClick={() => openOffer(r.offer_id)}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Offert
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
