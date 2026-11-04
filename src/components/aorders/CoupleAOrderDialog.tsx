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
import { CaseMatchCandidates, caseStatusLabel } from '@/components/shared/CaseMatchCandidates';
import { rankCases, type RankedCase } from '@/lib/caseMatching';
import { coupleAOrderToCase, couplingToast } from '@/lib/aOrderCoupling';

interface Props {
  aOrderId: string;
  teamId: string | null;
  teamName: string | null;
  customerAddress: string;
  customerName: string;
  customerPhone?: string | null;
  mockfjardsOrderNumber?: string | null;
  existingCaseId?: string | null;
  onDone: () => void;
}

export function CoupleAOrderDialog({
  aOrderId,
  teamId,
  teamName,
  customerAddress,
  customerName,
  customerPhone,
  mockfjardsOrderNumber,
  existingCaseId,
  onDone,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<RankedCase<any>[]>([]);
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
          .select('id, address, city, customer_name, customer_email, customer_phone, order_number, seller, status, team, montage_date')
          .neq('status', 'fakturerad')
          .order('address');
        if (error) throw error;
        if (cancelled) return;
        const list = (data || []) as any[];
        setCases(list);
        if (existingCaseId) {
          setSelectedCaseId(existingCaseId);
          setCandidates([]);
        } else {
          const ranked = rankCases(list, {
            address: customerAddress,
            name: customerName,
            phone: customerPhone,
            mockfjardsOrderNumber,
          }, { limit: 5 });
          setCandidates(ranked);
          // Både auto och förslag förväljs; förslag visar "Stämmer detta ärende?".
          if (ranked[0]) setSelectedCaseId(ranked[0].case.id);
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
  const top = candidates[0] ?? null;
  const topIsSelected = !!top && top.case.id === selectedCaseId;

  function finish() {
    setOpen(false);
    onDone();
  }

  async function handleCouple() {
    if (!selectedCaseId || !selectedCase) return;
    setSubmitting(true);
    try {
      const { warnings } = await coupleAOrderToCase({
        aOrderId,
        caseId: selectedCaseId,
        teamId,
        teamName,
        montageDate: montageDate || null,
        existingMontageDate: selectedCase.montage_date ?? null,
      });
      toast.success(couplingToast(selectedCase.address, warnings));
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
            Letar efter matchande ärenden…
          </div>
        ) : (
          <div className="space-y-4">
            {existingCaseId && selectedCase && (
              <div className="text-sm text-muted-foreground">
                Föreslaget ärende: <strong>{selectedCase.address}</strong>
                {selectedCase.customer_name ? ` – ${selectedCase.customer_name}` : ''}
              </div>
            )}

            {!existingCaseId && candidates.length > 0 && (
              <div className="space-y-1.5">
                {top?.level === 'suggest' && topIsSelected && (
                  <p className="text-sm font-medium text-warning">Stämmer detta ärende?</p>
                )}
                <Label className="text-xs">
                  {top?.level === 'auto' ? 'Matchat ärende' : candidates.length > 1 ? 'Möjliga träffar' : 'Möjlig träff'}
                </Label>
                <CaseMatchCandidates candidates={candidates} selectedId={selectedCaseId} onSelect={setSelectedCaseId} />
              </div>
            )}

            <div>
              <Label className="text-xs">
                {candidates.length === 0 && !existingCaseId ? 'Inget matchande ärende hittades – sök ärende' : 'Annat ärende'}
              </Label>
              <CaseCombobox
                cases={cases.map(c => ({ id: c.id, address: c.address, city: c.city, customer_name: c.customer_name, statusLabel: caseStatusLabel(c.status) }))}
                value={selectedCaseId}
                onChange={setSelectedCaseId}
                placeholder="Sök adress, ort eller kund…"
              />
            </div>

            <div>
              <Label className="text-xs">Montagedatum (valfritt)</Label>
              <Input type="date" value={montageDate} onChange={e => setMontageDate(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={finish} disabled={submitting}>Skippa koppling</Button>
          <Button
            onClick={handleCouple}
            disabled={!selectedCaseId || submitting || loading}
            className="gap-2 min-h-11"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Koppla till ärende
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
