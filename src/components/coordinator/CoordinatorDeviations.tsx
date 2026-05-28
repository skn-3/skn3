import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { differenceInCalendarDays } from 'date-fns';
import {
  fetchAllDeviations,
  fetchAllCases,
  updateDeviation,
  createDeviation,
  createCaseEvent,
  type DeviationRow,
  type CaseRow,
} from '@/lib/supabaseClient';
import { DEVIATION_TYPES, DEVIATION_RESPONSIBLE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2, Plus, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  coordinatorName: string;
  onSelectCase?: (c: CaseRow) => void;
}

export function CoordinatorDeviations({ coordinatorName, onSelectCase }: Props) {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const { data: deviations, isLoading } = useQuery({
    queryKey: ['coordinator-all-deviations'],
    queryFn: () => fetchAllDeviations(),
  });

  const { data: cases } = useQuery({
    queryKey: ['coordinator-cases'],
    queryFn: () => fetchAllCases(),
  });

  const caseById = useMemo(() => {
    const m = new Map<string, CaseRow>();
    (cases || []).forEach(c => m.set(c.id, c));
    return m;
  }, [cases]);

  const visible = useMemo(() => {
    return (deviations || []).filter(d => showArchived ? d.resolved : !d.resolved)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [deviations, showArchived]);

  const resolveMut = useMutation({
    mutationFn: async (dev: DeviationRow) => {
      await updateDeviation(dev.id, { resolved: true } as any);
      await createCaseEvent({
        case_id: dev.case_id,
        event_type: 'deviation_resolved',
        description: `Reklamation markerad löst av ${coordinatorName}`,
        created_by: coordinatorName,
      });
    },
    onSuccess: () => {
      toast.success('✓ Markerad som löst');
      qc.invalidateQueries({ queryKey: ['coordinator-all-deviations'] });
      qc.invalidateQueries({ queryKey: ['coordinator-deviations'] });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 px-3 md:px-6 max-w-screen-xl mx-auto pb-12">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Reklamationer</h1>
          <p className="text-muted-foreground text-sm">
            {showArchived ? 'Arkiverade (lösta) reklamationer' : 'Öppna reklamationer — äldst först'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowArchived(v => !v)}>
            {showArchived ? 'Visa öppna' : 'Visa arkiverade'}
          </Button>
          <Button onClick={() => setNewOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Ny reklamation
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {visible.length === 0 && (
          <p className="text-muted-foreground text-sm py-8 text-center">Inga {showArchived ? 'arkiverade' : 'öppna'} reklamationer.</p>
        )}
        {visible.map(d => {
          const c = caseById.get(d.case_id);
          const age = Math.max(0, differenceInCalendarDays(new Date(), new Date(d.created_at)));
          const old = age > 14 && !d.resolved;
          return (
            <div
              key={d.id}
              className={cn(
                'rounded-xl border bg-card p-4 shadow-sm space-y-2',
                old && 'border-red-300 bg-red-50/50'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => c && onSelectCase?.(c)}
                  className="text-left min-w-0"
                >
                  <div className="font-semibold text-base hover:underline">{c?.address || '(saknat ärende)'}</div>
                  <div className="text-xs text-muted-foreground">
                    {DEVIATION_TYPES.find(t => t.value === d.type)?.label || d.type}
                    {' · '}
                    {DEVIATION_RESPONSIBLE.find(r => r.value === d.responsible)?.label || d.responsible}
                  </div>
                </button>
                <div className="text-xs font-semibold rounded-full bg-muted px-2 py-1">
                  {d.resolved ? '✓ Löst' : `${age} d gammal`}
                </div>
              </div>
              <p className="text-sm">{d.description}</p>
              <div className="text-sm">Kostnad: <strong>{Number(d.cost || 0).toLocaleString('sv-SE')} kr</strong></div>
              {!d.resolved && (
                <Button size="sm" variant="outline" onClick={() => resolveMut.mutate(d)} disabled={resolveMut.isPending} className="gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Markera löst
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <NewDeviationSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        cases={cases || []}
        coordinatorName={coordinatorName}
        onDone={() => qc.invalidateQueries({ queryKey: ['coordinator-all-deviations'] })}
      />
    </div>
  );
}

function NewDeviationSheet({
  open, onClose, cases, coordinatorName, onDone,
}: { open: boolean; onClose: () => void; cases: CaseRow[]; coordinatorName: string; onDone: () => void }) {
  const [caseId, setCaseId] = useState('');
  const [type, setType] = useState('reklamation');
  const [responsible, setResponsible] = useState('okant');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');

  const sortedCases = useMemo(
    () => [...cases].sort((a, b) => a.address.localeCompare(b.address, 'sv')),
    [cases]
  );

  const mut = useMutation({
    mutationFn: async () => {
      if (!caseId || !description.trim()) throw new Error('Ärende och beskrivning krävs');
      await createDeviation({
        case_id: caseId,
        type,
        responsible,
        description: description.trim(),
        cost: Number(cost) || 0,
        created_by: coordinatorName,
      } as any);
      await createCaseEvent({
        case_id: caseId,
        event_type: 'deviation_created',
        description: `Reklamation skapad av ${coordinatorName}: ${description.trim().slice(0, 80)}`,
        created_by: coordinatorName,
      });
    },
    onSuccess: () => {
      toast.success('✓ Reklamation skapad');
      setCaseId(''); setType('reklamation'); setResponsible('okant'); setDescription(''); setCost('');
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ny reklamation</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Ärende</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger><SelectValue placeholder="Välj ärende..." /></SelectTrigger>
              <SelectContent>
                {sortedCases.map(c => <SelectItem key={c.id} value={c.id}>{c.address}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Typ</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEVIATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ansvar</Label>
            <Select value={responsible} onValueChange={setResponsible}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEVIATION_RESPONSIBLE.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Beskrivning</Label>
            <Textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Kostnad (kr)</Label>
            <Input type="number" value={cost} onChange={e => setCost(e.target.value)} />
          </div>
        </div>
        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? 'Sparar...' : 'Skapa'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
