import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CaseCombobox } from '@/components/shared/CaseCombobox';

interface Props {
  aOrderId: string;
  teamId: string | null;
  teamName: string | null;
  customerAddress: string;
  customerName: string;
  existingCaseId?: string | null;
  onDone: () => void;
}

const norm = (s: string | null | undefined) => (s ?? '').toString().toLowerCase().trim();

export function CoupleAOrderDialog({
  aOrderId,
  teamId,
  teamName,
  customerAddress,
  customerName,
  existingCaseId,
  onDone,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<any[]>([]);
  const [strongMatches, setStrongMatches] = useState<any[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [montageDate, setMontageDate] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('cases')
          .select('id, address, customer_name, status, team, montage_date')
          .neq('status', 'fakturerad')
          .order('address');
        if (error) throw error;
        if (cancelled) return;
        const list = (data || []) as any[];
        setCases(list);
        if (existingCaseId) {
          setSelectedCaseId(existingCaseId);
          setStrongMatches([]);
        } else {
          const target = norm(customerAddress);
          const strong = target ? list.filter(c => norm(c.address) === target) : [];
          setStrongMatches(strong);
          if (strong.length === 1) setSelectedCaseId(strong[0].id);
        }
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || 'Kunde inte hämta ärenden');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCase = useMemo(
    () => cases.find(c => c.id === selectedCaseId) || null,
    [cases, selectedCaseId],
  );

  function finish() {
    setOpen(false);
    onDone();
  }

  async function handleCouple() {
    if (!selectedCaseId || !selectedCase) return;
    setSubmitting(true);
    try {
      const { error: aoErr } = await (supabase as any)
        .from('a_orders')
        .update({ case_id: selectedCaseId })
        .eq('id', aOrderId);
      if (aoErr) throw aoErr;

      const hasTeam = !!teamId;
      if (hasTeam) {
        const caseUpdate: any = {
          team: teamName,
          status: 'montage_bokat',
        };
        if (montageDate) caseUpdate.montage_date = montageDate;
        const { error: cErr } = await (supabase as any)
          .from('cases')
          .update(caseUpdate)
          .eq('id', selectedCaseId);
        if (cErr) throw cErr;
      }

      // Hämta order_number/invoice_number för loggrad
      const { data: aoData } = await (supabase as any)
        .from('a_orders')
        .select('order_number, invoice_number')
        .eq('id', aOrderId)
        .maybeSingle();
      const ref = aoData?.invoice_number || aoData?.order_number || aOrderId.slice(0, 8);
      const effectiveMontageDate = montageDate || selectedCase.montage_date || null;
      const descParts: string[] = [
        `A-order ${ref} kopplad.`,
        hasTeam ? `Montör: ${teamName}.` : 'Montör: ej satt.',
      ];
      if (hasTeam) {
        descParts.push(
          `Status → Montage bokat${effectiveMontageDate ? ', montagedatum ' + effectiveMontageDate : ''}.`,
        );
      }
      try {
        await (supabase as any).from('case_events').insert({
          case_id: selectedCaseId,
          event_type: 'aorder_coupled',
          description: descParts.join(' '),
        });
      } catch (e) {
        console.error('case_events insert failed', e);
      }

      // Kolla leveransdatum/vecka för varningar
      let missingDelivery = false;
      try {
        const { data: cd } = await (supabase as any)
          .from('cases')
          .select('delivery_date, delivery_week')
          .eq('id', selectedCaseId)
          .maybeSingle();
        missingDelivery = !cd?.delivery_date && !cd?.delivery_week;
      } catch {}

      const extras: string[] = [];
      if (hasTeam && !effectiveMontageDate) extras.push('montagedatum saknas – komplettera i ärendet');
      if (missingDelivery) extras.push('leveransdatum/vecka saknas');
      const extraMsg = extras.length ? ` OBS: ${extras.join('; ')}.` : '';

      toast.success(`A-order kopplad till ${selectedCase.address}.${extraMsg}`);

      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['a_orders'] });

      finish();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte koppla A-ordern');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Koppla A-order till ärende</DialogTitle>
          <DialogDescription>
            Välj ett pågående ärende som denna A-order tillhör.
            {teamId
              ? ' Ärendet får montören och flyttas till Montage bokat.'
              : ' (Ingen montör är satt – endast koppling görs.)'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Kopplar A-order till ärende…
          </div>
        ) : (
          <div className="space-y-4">
            {existingCaseId && selectedCase && (
              <div className="text-sm text-muted-foreground">
                Föreslaget ärende: <strong>{selectedCase.address}</strong>
                {selectedCase.customer_name ? ` – ${selectedCase.customer_name}` : ''}
              </div>
            )}
            {!existingCaseId && strongMatches.length === 1 && selectedCase && (
              <div className="text-sm text-muted-foreground">
                Föreslaget ärende: <strong>{selectedCase.address}</strong>
                {selectedCase.customer_name ? ` – ${selectedCase.customer_name}` : ''}
              </div>
            )}
            {!existingCaseId && strongMatches.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs">Möjliga träffar</Label>
                <div className="rounded border divide-y text-sm">
                  {strongMatches.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 hover:bg-muted ${selectedCaseId === m.id ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedCaseId(m.id)}
                    >
                      <div className="font-medium">{m.address}</div>
                      {m.customer_name && (
                        <div className="text-xs text-muted-foreground">{m.customer_name}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Ärende</Label>
              <CaseCombobox
                cases={cases.map(c => ({ id: c.id, address: c.address, customer_name: c.customer_name }))}
                value={selectedCaseId}
                onChange={setSelectedCaseId}
                placeholder="Välj ärende…"
              />
            </div>

            <div>
              <Label className="text-xs">Montagedatum (valfritt)</Label>
              <Input type="date" value={montageDate} onChange={e => setMontageDate(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={finish} disabled={submitting}>Skippa koppling</Button>
          <Button
            onClick={handleCouple}
            disabled={!selectedCaseId || submitting || loading}
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Koppla till ärende
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
