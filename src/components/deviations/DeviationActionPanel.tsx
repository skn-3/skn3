import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  updateDeviation,
  appendDeviationLog,
  createCaseEvent,
  sendNotificationEmail,
  type DeviationRow,
  type CaseRow,
  type DeviationActionLogEntry,
} from '@/lib/supabaseClient';
import {
  DEVIATION_TYPES,
  DEVIATION_RESPONSIBLE,
  COORDINATOR_CC,
  ADMIN_USERS,
} from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Mail,
  Package,
  CheckCircle2,
  AlertCircle,
  Clock,
  StickyNote,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type DeviationStatus =
  | 'ny'
  | 'under_atgard'
  | 'vantar_leverans'
  | 'klar'
  | 'avskriven';

export const DEVIATION_STATUS_META: Record<
  DeviationStatus,
  { label: string; className: string }
> = {
  ny: { label: 'Ny', className: 'bg-muted text-muted-foreground' },
  under_atgard: { label: 'Under åtgärd', className: 'bg-blue-100 text-blue-800' },
  vantar_leverans: {
    label: 'Väntar leverans',
    className: 'bg-orange-100 text-orange-800',
  },
  klar: { label: 'Klar', className: 'bg-emerald-100 text-emerald-800' },
  avskriven: { label: 'Avskriven', className: 'bg-zinc-200 text-zinc-700' },
};

const STATUS_OPTIONS: DeviationStatus[] = [
  'ny',
  'under_atgard',
  'vantar_leverans',
  'klar',
  'avskriven',
];

export function canActOnDeviations(user: string, role: 'seller' | 'montor' | 'coordinator'): boolean {
  if (role === 'coordinator') return true;
  if (role === 'seller' && ADMIN_USERS.includes(user)) return true;
  return false;
}

interface Props {
  deviation: DeviationRow;
  caseData?: CaseRow | null;
  currentUser: string;
  onDone?: () => void;
}

export function DeviationActionPanel({ deviation, caseData, currentUser, onDone }: Props) {
  const qc = useQueryClient();
  const [factoryOpen, setFactoryOpen] = useState(false);
  const [del1Open, setDel1Open] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [costInput, setCostInput] = useState(String(deviation.cost ?? 0));
  const [responsible, setResponsible] = useState(deviation.responsible);

  const status = ((deviation as any).status as DeviationStatus) || 'ny';
  const statusMeta = DEVIATION_STATUS_META[status] || DEVIATION_STATUS_META.ny;
  const log: DeviationActionLogEntry[] = Array.isArray((deviation as any).action_log)
    ? (deviation as any).action_log
    : [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['coordinator-all-deviations'] });
    qc.invalidateQueries({ queryKey: ['coordinator-deviations'] });
    qc.invalidateQueries({ queryKey: ['deviations', deviation.case_id] });
    onDone?.();
  };

  const statusMut = useMutation({
    mutationFn: async (newStatus: DeviationStatus) => {
      const updates: any = { status: newStatus };
      if (newStatus === 'klar') updates.resolved = true;
      if (newStatus !== 'klar' && deviation.resolved) updates.resolved = false;
      await updateDeviation(deviation.id, updates);
      await appendDeviationLog(deviation.id, {
        at: new Date().toISOString(),
        by: currentUser,
        action: `Status → ${DEVIATION_STATUS_META[newStatus].label}`,
      });
      await createCaseEvent({
        case_id: deviation.case_id,
        event_type: 'deviation_status',
        description: `Reklamationsstatus ändrad till "${DEVIATION_STATUS_META[newStatus].label}" av ${currentUser}`,
        created_by: currentUser,
      });
    },
    onSuccess: () => {
      toast.success('✓ Status uppdaterad');
      invalidate();
    },
    onError: (e: any) => toast.error('Kunde inte uppdatera status: ' + e.message),
  });

  const noteMut = useMutation({
    mutationFn: async () => {
      if (!noteText.trim()) return;
      await appendDeviationLog(deviation.id, {
        at: new Date().toISOString(),
        by: currentUser,
        action: 'Anteckning',
        note: noteText.trim(),
      });
    },
    onSuccess: () => {
      toast.success('✓ Anteckning sparad');
      setNoteText('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const costMut = useMutation({
    mutationFn: async () => {
      const num = Number(costInput) || 0;
      await updateDeviation(deviation.id, { cost: num } as any);
      await appendDeviationLog(deviation.id, {
        at: new Date().toISOString(),
        by: currentUser,
        action: 'Kostnad uppdaterad',
        note: `${num.toLocaleString('sv-SE')} kr`,
      });
    },
    onSuccess: () => {
      toast.success('✓ Kostnad sparad');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const respMut = useMutation({
    mutationFn: async (newResp: string) => {
      await updateDeviation(deviation.id, { responsible: newResp } as any);
      await appendDeviationLog(deviation.id, {
        at: new Date().toISOString(),
        by: currentUser,
        action: `Ansvar → ${DEVIATION_RESPONSIBLE.find(r => r.value === newResp)?.label || newResp}`,
      });
    },
    onSuccess: () => {
      toast.success('✓ Ansvar uppdaterat');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const typLabel = DEVIATION_TYPES.find(t => t.value === deviation.type)?.label || deviation.type;
  const respLabel = DEVIATION_RESPONSIBLE.find(r => r.value === deviation.responsible)?.label || deviation.responsible;

  // Delivery countdown (status vantar_leverans + del1 data)
  const deliveryInfo = useMemo(() => {
    const w = (deviation as any).del1_delivery_week as number | null;
    const y = (deviation as any).del1_delivery_year as number | null;
    if (!w || !y) return null;
    // ISO week monday
    const simple = new Date(y, 0, 1 + (w - 1) * 7);
    const dow = simple.getDay() || 7;
    const monday = new Date(simple);
    monday.setDate(simple.getDate() + (1 - dow));
    const days = Math.ceil((monday.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { week: w, year: y, days };
  }, [deviation]);

  return (
    <div className="space-y-5">
      {/* Status badge + meta */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
            statusMeta.className,
          )}
        >
          {statusMeta.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {typLabel} · Ansvar: {respLabel}
        </span>
        {deliveryInfo && status === 'vantar_leverans' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200 px-2.5 py-1 text-xs font-semibold">
            <Truck className="h-3.5 w-3.5" />
            Leverans v{deliveryInfo.week} {deliveryInfo.year}
            {deliveryInfo.days >= 0
              ? ` · om ${deliveryInfo.days} d`
              : ` · ${Math.abs(deliveryInfo.days)} d sen`}
          </span>
        )}
      </div>

      {/* Description */}
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <div className="text-xs text-muted-foreground mb-1">Beskrivning</div>
        {deviation.description}
      </div>

      {/* Action by responsible */}
      {deviation.responsible === 'fabrik' && status !== 'klar' && status !== 'avskriven' && (
        <Button size="lg" className="w-full gap-2" onClick={() => setFactoryOpen(true)}>
          <Mail className="h-5 w-5" />
          Skicka reklamation till Mockfjärds
        </Button>
      )}

      {(deviation.responsible === 'saljare' || deviation.responsible === 'montor') &&
        status !== 'klar' && status !== 'avskriven' && (
          <Button
            size="lg"
            className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => setDel1Open(true)}
          >
            <Package className="h-5 w-5" />
            Skapa DEL1-order hos Mockfjärds
          </Button>
        )}

      {deviation.responsible === 'okant' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
            <AlertCircle className="h-4 w-4" />
            Sätt ansvar först för att kunna åtgärda
          </div>
          <Select
            value={responsible}
            onValueChange={(v) => {
              setResponsible(v);
              respMut.mutate(v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Välj ansvar..." />
            </SelectTrigger>
            <SelectContent>
              {DEVIATION_RESPONSIBLE.filter(r => r.value !== 'okant').map(r => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Status selector */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
        <Select value={status} onValueChange={(v) => statusMut.mutate(v as DeviationStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s} value={s}>{DEVIATION_STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cost */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Kostnad (kr)</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            value={costInput}
            onChange={(e) => setCostInput(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="outline"
            disabled={costMut.isPending || Number(costInput) === Number(deviation.cost ?? 0)}
            onClick={() => costMut.mutate()}
          >
            Spara
          </Button>
        </div>
      </div>

      {/* Note */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Lägg till anteckning
        </Label>
        <div className="flex gap-2">
          <Textarea
            rows={2}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="T.ex. ringt fabriken, lovat svar imorgon..."
            className="flex-1"
          />
          <Button
            disabled={!noteText.trim() || noteMut.isPending}
            onClick={() => noteMut.mutate()}
            className="gap-1.5 self-start"
          >
            <StickyNote className="h-4 w-4" />
            Spara
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Händelser
        </Label>
        <ol className="space-y-2 border-l-2 border-muted pl-3">
          <li className="text-sm">
            <div className="text-xs text-muted-foreground">
              {new Date(deviation.created_at).toLocaleString('sv-SE', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </div>
            <div>
              <span className="font-medium">Rapporterad</span>
              <span className="text-muted-foreground"> — {deviation.created_by}</span>
            </div>
          </li>
          {log.map((entry, i) => (
            <li key={i} className="text-sm">
              <div className="text-xs text-muted-foreground">
                {new Date(entry.at).toLocaleString('sv-SE', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </div>
              <div>
                <span className="font-medium">{entry.action}</span>
                <span className="text-muted-foreground"> — {entry.by}</span>
                {entry.note && (
                  <div className="text-muted-foreground text-xs mt-0.5">{entry.note}</div>
                )}
              </div>
            </li>
          ))}
          {(deviation as any).action_taken_at && log.length === 0 && (
            <li className="text-sm text-muted-foreground italic">Inga ytterligare händelser.</li>
          )}
        </ol>
      </div>

      <FactoryClaimSheet
        open={factoryOpen}
        onClose={() => setFactoryOpen(false)}
        deviation={deviation}
        caseData={caseData}
        currentUser={currentUser}
        onDone={invalidate}
      />

      <Del1OrderSheet
        open={del1Open}
        onClose={() => setDel1Open(false)}
        deviation={deviation}
        caseData={caseData}
        currentUser={currentUser}
        onDone={invalidate}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Factory claim email Sheet
// ───────────────────────────────────────────────────────────────────────

function buildFactoryMail(
  deviation: DeviationRow,
  caseData: CaseRow | null | undefined,
  currentUser: string,
) {
  const typLabel = DEVIATION_TYPES.find(t => t.value === deviation.type)?.label || deviation.type;
  const address = caseData?.address || '(adress saknas)';
  const customer = caseData?.customer_name || '(kund saknas)';
  const orderNr = caseData?.offer_number ? `, ordernr ${caseData.offer_number}` : '';
  const montage = caseData?.montage_date || '—';
  const delivery = caseData?.delivery_date
    ? caseData.delivery_date
    : caseData?.delivery_week
    ? `v${caseData.delivery_week} ${caseData.delivery_year || ''}`.trim()
    : '—';

  return {
    subject: `Reklamation – ${address}${orderNr ? ',' + orderNr : ''}`,
    body: `Hej,

Vi har en reklamation gällande ${address} (${customer}).

Typ av fel: ${typLabel}

Beskrivning:
${deviation.description}

Montagedatum: ${montage}
Levererad: ${delivery}

Återkom gärna med åtgärdsförslag.

Mvh,
${currentUser}
Smart Klimat`,
  };
}

function FactoryClaimSheet({
  open, onClose, deviation, caseData, currentUser, onDone,
}: {
  open: boolean; onClose: () => void; deviation: DeviationRow;
  caseData: CaseRow | null | undefined; currentUser: string; onDone: () => void;
}) {
  const initial = useMemo(
    () => buildFactoryMail(deviation, caseData, currentUser),
    [deviation, caseData, currentUser],
  );
  const [to, setTo] = useState('info@mockfjards.se');
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);

  // Reset when reopening
  useMemo(() => {
    if (open) {
      setTo('info@mockfjards.se');
      setSubject(initial.subject);
      setBody(initial.body);
    }
  }, [open, initial.subject, initial.body]);

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!to.trim()) throw new Error('Mottagare krävs');
      // Use a neutral heading so notify-email doesn't append a "Visa reklamation" CTA
      const htmlBody = body
        .split('\n')
        .map(line => line.length === 0 ? '<br/>' : line)
        .join('<br/>');
      await sendNotificationEmail({
        to: to.trim(),
        cc: COORDINATOR_CC,
        subject,
        heading: `Ärende från Smart Klimat`,
        body: htmlBody,
      });
      await updateDeviation(deviation.id, {
        action_type: 'fabriksreklamation',
        status: 'under_atgard',
        action_taken_at: new Date().toISOString(),
        factory_email_sent_at: new Date().toISOString(),
        factory_email_to: to.trim(),
      } as any);
      await appendDeviationLog(deviation.id, {
        at: new Date().toISOString(),
        by: currentUser,
        action: 'Mail skickat till fabrik',
        note: `Till: ${to.trim()}`,
      });
      await createCaseEvent({
        case_id: deviation.case_id,
        event_type: 'deviation_factory_mail',
        description: `Reklamation mailad till ${to.trim()} av ${currentUser}`,
        created_by: currentUser,
      });
    },
    onSuccess: () => {
      toast.success(`✓ Mail skickat till ${to.trim()}`);
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error('Kunde inte skicka mail: ' + e.message),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Skicka reklamation till Mockfjärds</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          <div className="space-y-2">
            <Label>Till</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>CC (alltid)</Label>
            <Input value={COORDINATOR_CC} readOnly className="bg-muted text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <Label>Ämne</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Meddelande</Label>
            <Textarea
              rows={16}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending} className="gap-1.5">
            <Mail className="h-4 w-4" />
            {sendMut.isPending ? 'Skickar...' : 'Skicka mail'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────────────────────────────────────────────────────
// DEL1 order Sheet
// ───────────────────────────────────────────────────────────────────────

function Del1OrderSheet({
  open, onClose, deviation, caseData, currentUser, onDone,
}: {
  open: boolean; onClose: () => void; deviation: DeviationRow;
  caseData: CaseRow | null | undefined; currentUser: string; onDone: () => void;
}) {
  const thisYear = new Date().getFullYear();
  const [orderNr, setOrderNr] = useState('');
  const [week, setWeek] = useState('');
  const [year, setYear] = useState(String(thisYear));
  const [cost, setCost] = useState(String(deviation.cost ?? ''));
  const [note, setNote] = useState('');

  useMemo(() => {
    if (open) {
      setOrderNr('');
      setWeek('');
      setYear(String(thisYear));
      setCost(String(deviation.cost ?? ''));
      setNote('');
    }
  }, [open, deviation.cost, thisYear]);

  const valid =
    orderNr.trim().length > 0 &&
    Number(week) >= 1 && Number(week) <= 53 &&
    Number(year) >= 2020 &&
    Number(cost) > 0;

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error('Fyll i ordernummer, vecka, år och kostnad');
      const w = Number(week);
      const y = Number(year);
      const c = Number(cost);
      await updateDeviation(deviation.id, {
        action_type: 'del1_order',
        status: 'vantar_leverans',
        action_taken_at: new Date().toISOString(),
        del1_order_number: orderNr.trim(),
        del1_delivery_week: w,
        del1_delivery_year: y,
        cost: c,
      } as any);
      await appendDeviationLog(deviation.id, {
        at: new Date().toISOString(),
        by: currentUser,
        action: 'DEL1-order skapad',
        note: `Ordernr ${orderNr.trim()}, leverans v${w} ${y}, kostnad ${c.toLocaleString('sv-SE')} kr${note.trim() ? ` — ${note.trim()}` : ''}`,
      });
      await createCaseEvent({
        case_id: deviation.case_id,
        event_type: 'deviation_del1',
        description: `DEL1-order skapad (${orderNr.trim()}) av ${currentUser}, leverans v${w} ${y}`,
        created_by: currentUser,
      });
    },
    onSuccess: () => {
      toast.success(`✓ DEL1 skapad — leverans v${week} ${year}`);
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Skapa DEL1-order</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            Fyll i uppgifterna som Mockfjärds har tilldelat ordern.
          </p>
          <div className="space-y-2">
            <Label>Ordernummer *</Label>
            <Input value={orderNr} onChange={(e) => setOrderNr(e.target.value)} placeholder="t.ex. M123456" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Leveransvecka *</Label>
              <Input type="number" min={1} max={53} value={week} onChange={(e) => setWeek(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>År *</Label>
              <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Kostnad (kr) *</Label>
            <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Anteckning (valfritt)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!valid || saveMut.isPending}
            className="gap-1.5 bg-blue-600 hover:bg-blue-700"
          >
            <Package className="h-4 w-4" />
            {saveMut.isPending ? 'Sparar...' : 'Skapa DEL1'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Reusable wrapper Sheet to host the panel from any card click
// ───────────────────────────────────────────────────────────────────────

export function DeviationActionSheet({
  deviation, caseData, currentUser, open, onClose,
}: {
  deviation: DeviationRow | null;
  caseData?: CaseRow | null;
  currentUser: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open && !!deviation} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>
            Reklamation — {caseData?.address || '(ärende saknas)'}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4">
          {deviation && (
            <DeviationActionPanel
              deviation={deviation}
              caseData={caseData}
              currentUser={currentUser}
              onDone={() => { /* parent invalidates */ }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
