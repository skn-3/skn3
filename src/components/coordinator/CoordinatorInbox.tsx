import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { differenceInCalendarDays, getISOWeek, getISOWeekYear } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchAllCases,
  fetchAllDeviations,
  updateCase,
  updateDeviation,
  createCaseEvent,
  createCaseCost,
  type CaseRow,
  type DeviationRow,
} from '@/lib/supabaseClient';
import { MONTORS, STATUS_LABELS, DEVIATION_TYPES, DEVIATION_RESPONSIBLE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Loader2, Phone, MapPin, CalendarPlus, Hammer, Check, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DeviationActionSheet,
  DEVIATION_STATUS_META,
  type DeviationStatus,
} from '@/components/deviations/DeviationActionPanel';

interface Props {
  coordinatorName: string;
}

function ageDays(iso: string): number {
  return Math.max(0, differenceInCalendarDays(new Date(), new Date(iso)));
}

function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-muted-foreground italic text-sm">Telefon saknas</span>;
  const clean = phone.replace(/\s+/g, '');
  return (
    <a
      href={`tel:${clean}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 text-base md:text-lg font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
    >
      <Phone className="h-4 w-4" />
      {phone}
    </a>
  );
}

export function CoordinatorInbox({ coordinatorName }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [bookingCase, setBookingCase] = useState<CaseRow | null>(null);
  const [openDev, setOpenDev] = useState<DeviationRow | null>(null);
  const [newDevOpen, setNewDevOpen] = useState(false);

  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ['coordinator-cases'],
    queryFn: () => fetchAllCases(),
  });

  const { data: deviations, isLoading: devsLoading } = useQuery({
    queryKey: ['coordinator-deviations'],
    queryFn: () => fetchAllDeviations(),
  });

  // Sheet metal orders — fetch all to know which cases already have one
  const { data: sheetMetalCaseIds } = useQuery({
    queryKey: ['coordinator-sheet-metal-cases'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sheet_metal_orders')
        .select('case_id, status');
      if (error) throw error;
      return new Set((data || []).map((o: any) => o.case_id));
    },
  });

  // SECTION 1 — Att boka in: status godkand/i_produktion AND (no montage_date OR no team)
  const toBook = useMemo(() => {
    return (cases || [])
      .filter(c =>
        (c.status === 'godkand' || c.status === 'i_produktion') &&
        (!c.montage_date || !c.team)
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [cases]);

  // SECTION 2 — Att beställa plåt för: cases in production phase without a sheet metal order
  const toOrderSheet = useMemo(() => {
    const candidates = (cases || []).filter(c =>
      ['godkand', 'i_produktion', 'leverans_klar', 'montage_bokat'].includes(c.status)
    );
    if (!sheetMetalCaseIds) return candidates;
    return candidates.filter(c => !sheetMetalCaseIds.has(c.id));
  }, [cases, sheetMetalCaseIds]);

  // SECTION 3 — Reklamationer att följa upp (only active statuses)
  const ACTIVE: DeviationStatus[] = ['ny', 'under_atgard', 'vantar_leverans'];
  const openDeviations = useMemo(() => {
    return (deviations || [])
      .map(d => ({ d, status: ((d as any).status as DeviationStatus) || (d.resolved ? 'klar' : 'ny') }))
      .filter(({ status }) => ACTIVE.includes(status))
      .sort((a, b) => {
        // 'ny' first, then by oldest
        const rank = (s: DeviationStatus) => (s === 'ny' ? 0 : s === 'under_atgard' ? 1 : 2);
        const r = rank(a.status) - rank(b.status);
        if (r !== 0) return r;
        return new Date(a.d.created_at).getTime() - new Date(b.d.created_at).getTime();
      })
      .map(x => x.d);
  }, [deviations]);

  const caseById = useMemo(() => {
    const m = new Map<string, CaseRow>();
    (cases || []).forEach(c => m.set(c.id, c));
    return m;
  }, [cases]);

  // Week deliveries
  const now = new Date();
  const thisIsoWeek = getISOWeek(now);
  const thisIsoYear = getISOWeekYear(now);
  const nextWeek = thisIsoWeek === 52 || thisIsoWeek === 53 ? 1 : thisIsoWeek + 1;
  const nextYear = thisIsoWeek === 52 || thisIsoWeek === 53 ? thisIsoYear + 1 : thisIsoYear;
  const weekDeliveries = useMemo(() => {
    return (cases || []).filter(c =>
      (c.delivery_week === thisIsoWeek && c.delivery_year === thisIsoYear) ||
      (c.delivery_week === nextWeek && c.delivery_year === nextYear)
    ).sort((a, b) => {
      const av = (a.delivery_year || 0) * 100 + (a.delivery_week || 0);
      const bv = (b.delivery_year || 0) * 100 + (b.delivery_week || 0);
      return av - bv;
    });
  }, [cases, thisIsoWeek, thisIsoYear, nextWeek, nextYear]);

  const resolveDevMutation = useMutation({
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
      qc.invalidateQueries({ queryKey: ['coordinator-deviations'] });
    },
    onError: (e: any) => toast.error('Kunde inte markera löst: ' + e.message),
  });

  const isLoading = casesLoading || devsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-3 md:px-6 pb-12 max-w-screen-xl mx-auto">
      <div className="space-y-1 pt-2">
        <h1 className="text-2xl md:text-3xl font-bold">Min inkorg</h1>
        <p className="text-muted-foreground">Här är det som väntar på dig idag.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          {/* Section 1 — Att boka in */}
          <Section
            title="Att boka in"
            count={toBook.length}
            emptyText="✓ Inga obokade just nu"
            tone="amber"
          >
            <div className="space-y-2">
              {toBook.map(c => (
                <div
                  key={c.id}
                  className="rounded-xl border bg-card p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="font-semibold text-base md:text-lg flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {c.address}
                    </div>
                    <div className="text-sm text-muted-foreground">{c.customer_name}</div>
                    <PhoneLink phone={c.customer_phone} />
                    {c.delivery_week && (
                      <div className="text-xs text-muted-foreground">
                        Leveransvecka v{c.delivery_week}/{c.delivery_year}
                      </div>
                    )}
                  </div>
                  <Button size="lg" onClick={() => setBookingCase(c)} className="shrink-0 gap-2">
                    <CalendarPlus className="h-5 w-5" />
                    Boka in
                  </Button>
                </div>
              ))}
            </div>
          </Section>

          {/* Section 2 — Att beställa plåt för */}
          <Section
            title="Att beställa plåt för"
            count={toOrderSheet.length}
            emptyText="✓ Inga plåtbeställningar väntar"
            tone="blue"
          >
            <div className="space-y-2">
              {toOrderSheet.map(c => (
                <div
                  key={c.id}
                  className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-base">{c.address}</div>
                    <div className="text-xs text-muted-foreground">{c.customer_name} · {STATUS_LABELS[c.status] || c.status}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => navigate(`/case/${c.id}/sheet-metal-order`)}
                    className="shrink-0 gap-2"
                  >
                    <Hammer className="h-5 w-5" />
                    Beställ
                  </Button>
                </div>
              ))}
            </div>
          </Section>

          {/* Section 3 — Reklamationer */}
          <Section
            title="Reklamationer att följa upp"
            count={openDeviations.length}
            emptyText="✓ Inga öppna reklamationer"
            tone="red"
          >
            <div className="space-y-2">
              {openDeviations.map(d => {
                const c = caseById.get(d.case_id);
                const age = ageDays(d.created_at);
                const status = ((d as any).status as DeviationStatus) || 'ny';
                const statusMeta = DEVIATION_STATUS_META[status];
                const old = age > 14 && status === 'ny';
                return (
                  <div
                    key={d.id}
                    className={cn(
                      'rounded-xl border bg-card p-4 shadow-sm space-y-2',
                      old && 'border-red-300 bg-red-50/50'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-base">{c?.address || '(saknat ärende)'}</div>
                        <div className="text-xs text-muted-foreground">
                          {DEVIATION_TYPES.find(t => t.value === d.type)?.label || d.type}
                          {' · '}
                          {DEVIATION_RESPONSIBLE.find(r => r.value === d.responsible)?.label || d.responsible}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-xs font-semibold rounded-full px-2 py-1', statusMeta.className)}>
                          {statusMeta.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{age} d</span>
                      </div>
                    </div>
                    <p className="text-sm line-clamp-2">{d.description}</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm">
                        Kostnad: <strong>{Number(d.cost || 0).toLocaleString('sv-SE')} kr</strong>
                      </div>
                      <Button size="sm" onClick={() => setOpenDev(d)} className="gap-1.5">
                        <Wrench className="h-4 w-4" /> Åtgärda
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        {/* Side panel */}
        <aside className="space-y-3">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">
              Veckans leveranser
            </h3>
            {weekDeliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga leveranser denna eller nästa vecka.</p>
            ) : (
              <ul className="space-y-2">
                {weekDeliveries.map(c => (
                  <li key={c.id} className="text-sm">
                    <div className="font-medium">{c.address}</div>
                    <div className="text-xs text-muted-foreground">
                      v{c.delivery_week}/{c.delivery_year}{c.team ? ` · ${c.team}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <BookingSheet
        c={bookingCase}
        onClose={() => setBookingCase(null)}
        coordinatorName={coordinatorName}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ['coordinator-cases'] });
        }}
      />

      <DeviationActionSheet
        deviation={openDev}
        caseData={openDev ? caseById.get(openDev.case_id) : null}
        currentUser={coordinatorName}
        open={!!openDev}
        onClose={() => setOpenDev(null)}
      />
    </div>
  );
}

function Section({
  title, count, emptyText, tone, children,
}: { title: string; count: number; emptyText: string; tone: 'amber' | 'blue' | 'red'; children: React.ReactNode }) {
  const toneClass =
    tone === 'amber' ? 'bg-amber-100 text-amber-800' :
    tone === 'blue' ? 'bg-blue-100 text-blue-800' :
    'bg-red-100 text-red-800';
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg md:text-xl font-bold">{title}</h2>
        <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold', toneClass)}>
          {count}
        </span>
      </div>
      {count === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-center text-emerald-700">
          <Check className="h-6 w-6 inline-block mr-1.5" />
          {emptyText}
        </div>
      ) : children}
    </section>
  );
}

function BookingSheet({
  c, onClose, coordinatorName, onDone,
}: { c: CaseRow | null; onClose: () => void; coordinatorName: string; onDone: () => void }) {
  const [team, setTeam] = useState<string>(c?.team || '');
  const [kmTeam, setKmTeam] = useState<string>(c?.km_team || '');
  const [montageDate, setMontageDate] = useState<string>(c?.montage_date || '');
  const [montageTime, setMontageTime] = useState<string>(c?.montage_time || '');
  const [kmDate, setKmDate] = useState<string>(c?.km_date || '');

  // Reset on case change
  useEffect(() => {
    setTeam(c?.team || '');
    setKmTeam(c?.km_team || '');
    setMontageDate(c?.montage_date || '');
    setMontageTime(c?.montage_time || '');
    setKmDate(c?.km_date || '');
  }, [c?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!c) return;
      const updates: any = {};
      if (team) updates.team = team;
      if (kmTeam) updates.km_team = kmTeam;
      if (montageDate) updates.montage_date = montageDate;
      if (montageTime) updates.montage_time = montageTime;
      if (kmDate) updates.km_date = kmDate;
      if (montageDate && team && c.status !== 'montage_bokat' && c.status !== 'montage_pagar' && c.status !== 'montage_klart') {
        updates.status = 'montage_bokat';
      }
      await updateCase(c.id, updates);
      await createCaseEvent({
        case_id: c.id,
        event_type: 'booking',
        description: `Bokad av ${coordinatorName}${team ? ` — montör: ${team}` : ''}${montageDate ? `, montage ${montageDate}${montageTime ? ' ' + montageTime : ''}` : ''}${kmDate ? `, KM ${kmDate}` : ''}`,
        created_by: coordinatorName,
      });
    },
    onSuccess: () => {
      toast.success(`✓ Bokat${team ? ` — ${team}` : ''}${montageDate ? `, ${montageDate}${montageTime ? ' ' + montageTime.slice(0,5) : ''}` : ''}`);
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error('Kunde inte boka: ' + e.message),
  });

  return (
    <Sheet open={!!c} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Boka in {c?.address}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Montage-montör</Label>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger><SelectValue placeholder="Välj montör..." /></SelectTrigger>
              <SelectContent>
                {MONTORS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Montagedatum</Label>
              <Input type="date" value={montageDate} onChange={e => setMontageDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tid (valfritt)</Label>
              <Input type="time" value={montageTime} onChange={e => setMontageTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>KM-datum (valfritt)</Label>
            <Input type="date" value={kmDate} onChange={e => setKmDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>KM-montör (valfritt)</Label>
            <Select value={kmTeam} onValueChange={setKmTeam}>
              <SelectTrigger><SelectValue placeholder="Välj KM-montör..." /></SelectTrigger>
              <SelectContent>
                {MONTORS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Sparar...' : 'Spara bokning'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CostSheet({
  dev, onClose, coordinatorName, onDone,
}: { dev: DeviationRow | null; onClose: () => void; coordinatorName: string; onDone: () => void }) {
  const [amount, setAmount] = useState<string>(String(dev?.cost || ''));
  const [desc, setDesc] = useState('');

  useEffect(() => {
    setAmount(String(dev?.cost || ''));
    setDesc('');
  }, [dev?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dev) return;
      const num = Number(amount) || 0;
      await updateDeviation(dev.id, { cost: num } as any);
      if (desc.trim()) {
        await createCaseCost({
          case_id: dev.case_id,
          description: `Reklamation: ${desc.trim()}`,
          amount: num,
          created_by: coordinatorName,
        });
      }
      await createCaseEvent({
        case_id: dev.case_id,
        event_type: 'deviation_cost',
        description: `Kostnad för reklamation uppdaterad till ${num.toLocaleString('sv-SE')} kr av ${coordinatorName}`,
        created_by: coordinatorName,
      });
    },
    onSuccess: () => {
      toast.success('✓ Kostnad sparad');
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error('Kunde inte spara: ' + e.message),
  });

  return (
    <Sheet open={!!dev} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Justera kostnad</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Kostnad (kr)</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="text-lg" />
          </div>
          <div className="space-y-2">
            <Label>Beskrivning (valfritt — sparas som kostnadspost)</Label>
            <Textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="T.ex. Nytt glas, frakt..." />
          </div>
        </div>
        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Sparar...' : 'Spara'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
