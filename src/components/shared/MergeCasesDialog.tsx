import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ArrowLeftRight, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllCases } from '@/lib/supabaseClient';
import { STATUS_LABELS } from '@/lib/constants';
import { sameStreetKey, matchesSearch } from '@/lib/caseMatching';
import { pickKeep, mergeFieldPlan, movedSummary, type MergeCase, type MergeChoices, type MergeFieldKey } from '@/lib/caseMerge';
import { logActivity } from '@/lib/activityLog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type CaseLite = MergeCase & { customer_name?: string | null; status?: string | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ärendet man står på (från ärendepanelen). */
  fromCase?: CaseLite | null;
  /** Färdigt par (från "Möjliga dubbletter"). */
  pair?: { a: CaseLite; b: CaseLite } | null;
  onMerged: (keepId: string) => void;
}

interface DryRun { moved: Record<string, number>; notifications: number }

const dateSv = (v: unknown) => {
  const d = new Date(String(v ?? ''));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('sv-SE');
};
const statusLabel = (s: unknown) => STATUS_LABELS[String(s ?? '')] || String(s ?? '—');
const showValue = (key: MergeFieldKey, v: string | null) => (v == null ? '—' : key === 'status' ? statusLabel(v) : v);

export function MergeCasesDialog({ open, onOpenChange, fromCase, pair, onMerged }: Props) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [other, setOther] = useState<CaseLite | null>(null);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [choices, setChoices] = useState<MergeChoices>({});
  const [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: allCases, isLoading: casesLoading } = useQuery({
    queryKey: ['cases', 'merge-candidates'],
    queryFn: fetchAllCases,
    enabled: open && !pair && !!fromCase,
  });

  const sameAddress = useMemo(() => {
    if (!fromCase || !allCases) return [] as CaseLite[];
    return (allCases as CaseLite[]).filter(c => c.id !== fromCase.id && sameStreetKey(c.address, fromCase.address));
  }, [allCases, fromCase]);

  const searchHits = useMemo(() => {
    if (!fromCase || !allCases || search.trim().length < 2) return [] as CaseLite[];
    return (allCases as CaseLite[])
      .filter(c => c.id !== fromCase.id && matchesSearch([c.address, c.customer_name, (c as any).city, (c as any).order_number, (c as any).offer_number], search))
      .slice(0, 20);
  }, [allCases, fromCase, search]);

  // Starta om när dialogen öppnas.
  useEffect(() => {
    if (!open) return;
    setChoices({}); setConfirmed(false); setSearch('');
    if (pair) { setOther(null); setKeepId(pickKeep(pair.a, pair.b)[0].id); }
    else { setOther(null); setKeepId(null); }
  }, [open, pair, fromCase?.id]);

  // Förval av motpart när exakt ett ärende har samma gata + husnummer.
  useEffect(() => {
    if (!open || pair || other || sameAddress.length !== 1 || !fromCase) return;
    setOther(sameAddress[0]);
  }, [open, pair, other, sameAddress, fromCase]);

  const a = pair ? pair.a : fromCase ?? null;
  const b = pair ? pair.b : other;

  useEffect(() => {
    if (a && b && !keepId) setKeepId(pickKeep(a, b)[0].id);
  }, [a, b, keepId]);

  const keep = a && b ? (keepId === b.id ? b : a) : null;
  const drop = a && b ? (keepId === b.id ? a : b) : null;

  const dry = useQuery({
    queryKey: ['merge-cases-dry-run', keep?.id, drop?.id],
    enabled: open && !!keep && !!drop,
    staleTime: 0,
    queryFn: async (): Promise<DryRun> => {
      const { data, error } = await supabase.rpc('merge_cases', { p_keep_id: keep!.id, p_drop_id: drop!.id, p_choices: {}, p_dry_run: true });
      if (error) throw error;
      const r = data as any;
      return { moved: r?.moved ?? {}, notifications: Number(r?.notifications ?? 0) };
    },
  });

  const plan = keep && drop ? mergeFieldPlan(keep, drop, choices) : [];

  const selectOther = (c: CaseLite) => { setOther(c); setKeepId(null); setChoices({}); setConfirmed(false); };
  const swapKeep = (id: string) => { setKeepId(id); setChoices({}); setConfirmed(false); };

  const runMerge = async () => {
    if (!keep || !drop) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('merge_cases', { p_keep_id: keep.id, p_drop_id: drop.id, p_choices: choices as any, p_dry_run: false });
      if (error) throw error;
      const r = data as any;
      const summary = movedSummary(r?.moved ?? {}, Number(r?.notifications ?? 0));
      const changed = (r?.fields ?? []).filter((f: any) => f.changed).map((f: any) => f.field);
      logActivity({
        action: 'cases_merged',
        category: 'case',
        description: `Slog ihop dubblett ${drop.address ?? ''} med ${keep.address ?? ''} — flyttat: ${summary}`,
        case_id: keep.id,
        metadata: { keep_id: keep.id, drop_id: drop.id, moved: r?.moved ?? {}, notifications: r?.notifications ?? 0, changed_fields: changed },
      });
      for (const key of [['cases'], ['cases_all_validate'], ['visits'], ['visits_all_validate'], ['a_orders'], ['case-events']]) qc.invalidateQueries({ queryKey: key });
      toast.success('Ärendena är sammanslagna');
      onOpenChange(false);
      onMerged(keep.id);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte slå ihop ärendena');
    } finally {
      setBusy(false);
    }
  };

  const caseCard = (c: CaseLite) => {
    const isKeep = c.id === keep?.id;
    return (
      <div key={c.id} className={cn('rounded-lg border p-3 space-y-1 min-w-0', isKeep ? 'border-primary bg-primary/5' : 'bg-card')}>
        <div className="flex items-center justify-between gap-2">
          <Badge variant={isKeep ? 'default' : 'outline'}>{isKeep ? 'Behålls' : 'Dubblett – tas bort'}</Badge>
        </div>
        <div className="font-medium break-words">{c.address || '—'}</div>
        <div className="text-sm text-muted-foreground break-words">{c.customer_name || '—'}</div>
        <div className="text-xs text-muted-foreground">Säljare: {c.seller || '—'}</div>
        <div className="text-xs text-muted-foreground">Status: {statusLabel(c.status)}</div>
        <div className="text-xs text-muted-foreground">Skapad: {dateSv(c.created_at)}</div>
        {!isKeep && (
          <Button variant="outline" className="mt-2 min-h-11 w-full" onClick={() => swapKeep(c.id)}>
            <ArrowLeftRight className="h-4 w-4 mr-1" />Behåll detta i stället
          </Button>
        )}
      </div>
    );
  };

  const candidateRow = (c: CaseLite) => (
    <button key={c.id} type="button" onClick={() => selectOther(c)}
      className="w-full min-h-12 rounded-md border bg-background px-3 py-2 text-left hover:bg-muted">
      <div className="font-medium">{c.address}</div>
      <div className="text-xs text-muted-foreground">{c.customer_name || '—'} · {c.seller || '—'} · {statusLabel(c.status)} · skapad {dateSv(c.created_at)}</div>
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={o => { if (!busy) onOpenChange(o); }}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={cn('overflow-y-auto', isMobile ? 'max-h-[92dvh]' : 'w-full sm:max-w-2xl')}>
        <SheetHeader>
          <SheetTitle>Slå ihop dubblett</SheetTitle>
          <SheetDescription>Allt som hör till dubbletten flyttas till ärendet som behålls. Fakturor, fakturanummer, PDF:er, betalstatus och Drive-arkivet ändras inte.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {!pair && fromCase && !other && (
            <div className="space-y-3">
              {casesLoading ? (
                <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Letar efter ärenden på samma adress…</div>
              ) : sameAddress.length > 1 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Flera ärenden har samma gata och husnummer. Välj dubbletten:</div>
                  {sameAddress.map(candidateRow)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Inget annat ärende har samma gata och husnummer. Sök fram dubbletten:</p>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Sök adress, kund eller ordernummer" className="pl-9 min-h-11" />
              </div>
              <div className="space-y-2">{searchHits.map(candidateRow)}</div>
            </div>
          )}

          {keep && drop && (
            <>
              {!pair && <Button variant="ghost" className="min-h-11 px-2" onClick={() => setOther(null)}>Välj ett annat ärende</Button>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {caseCard(keep)}
                {caseCard(drop)}
              </div>

              <div className="rounded-lg border p-3 bg-card">
                <div className="text-sm font-medium">Flyttas till ärendet som behålls</div>
                {dry.isLoading ? (
                  <div className="mt-1 flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Räknar…</div>
                ) : dry.error ? (
                  <div className="mt-1 flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{(dry.error as any)?.message || 'Kunde inte räkna vad som flyttas.'}</div>
                ) : (
                  <div className="mt-1 text-sm">Flyttas: {movedSummary(dry.data?.moved ?? {}, dry.data?.notifications ?? 0)}</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Uppgifter på ärendet som behålls</div>
                {plan.map(row => (
                  <div key={row.key} className="rounded-md border p-2 space-y-1">
                    <div className="text-xs text-muted-foreground">{row.label}</div>
                    {row.needsChoice ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(['keep', 'drop'] as const).map(opt => {
                          const active = (choices[row.key] ?? 'keep') === opt;
                          const value = opt === 'keep' ? row.keepValue : row.dropValue;
                          return (
                            <button key={opt} type="button" aria-pressed={active}
                              onClick={() => { setChoices(c => ({ ...c, [row.key]: opt })); setConfirmed(false); }}
                              className={cn('min-h-11 rounded-md border px-3 py-2 text-left text-sm', active ? 'border-primary bg-primary/10 font-medium' : 'bg-background')}>
                              <div className="text-[11px] text-muted-foreground">{opt === 'keep' ? 'Behåll' : 'Ta från dubbletten'}</div>
                              <div className="break-words">{showValue(row.key, value)}</div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm break-words">
                        {showValue(row.key, row.result)}
                        {row.autoFilled && <span className="ml-2 text-xs text-muted-foreground">(fylls i från dubbletten)</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <label className="flex items-start gap-3 rounded-lg border p-3 min-h-12 cursor-pointer">
                <Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} className="mt-0.5 h-5 w-5" />
                <span className="text-sm">Jag har kontrollerat att båda ärendena gäller samma uppdrag. Dubbletten tas bort och kan inte återställas.</span>
              </label>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pb-2">
                <Button variant="outline" className="min-h-12" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
                <Button variant="destructive" className="min-h-12" onClick={runMerge} disabled={!confirmed || busy || dry.isLoading || !!dry.error}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Slå ihop – dubbletten tas bort
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
