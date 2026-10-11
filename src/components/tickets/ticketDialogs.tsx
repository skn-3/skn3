import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { sendNotificationEmail, createCaseCost } from '@/lib/supabaseClient';
import {
  BALLS, CATEGORY_LABEL, PRIORITIES, TICKET_QUERY_KEYS, addTicketEvent, initials, resolveTicket, updateTicket,
  type Ball, type Ticket,
} from '@/lib/tickets';

// ---------- Delade småkomponenter ----------

function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function lighten(hex: string, amt = 0.55) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}
function useIsDark() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** Färger för en grupp/boll: ljust läge som i tickets.ts, mörkt läge samma hue med transparent bg och ljusare text. */
export function useToneStyle() {
  const dark = useIsDark();
  return (tone: { color: string; bg: string; border: string; text: string }) => dark
    ? { color: lighten(tone.color, 0.35), bg: hexToRgba(tone.color, 0.25), border: hexToRgba(tone.color, 0.45), text: lighten(tone.color, 0.55) }
    : tone;
}

export function PrioDot({ priority }: { priority: Ticket['priority'] }) {
  const p = PRIORITIES.find((x) => x.value === (priority || 'medium')) || PRIORITIES[1];
  return <span className="tc-dot" style={{ background: p.dot }} title={`${p.label} prioritet`} aria-label={`${p.label} prioritet`} />;
}

export function CategoryChip({ type }: { type: string }) {
  return <span className={`tc-chip ${type === 'kundtjanst' ? 'tc-chip-cs' : 'tc-chip-cat'}`}>{CATEGORY_LABEL(type)}</span>;
}

export function Avatar({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="tc-avatar tc-avatar-none" title="Ingen ägare">?</span>;
  return <span className="tc-avatar" title={name}>{initials(name)}</span>;
}

/** Personal för Ägare-listor. Faller tillbaka på [currentUser] om läsningen nekas. */
export function useStaff(currentUser: string): string[] {
  const { data } = useQuery({
    queryKey: ['staff_names'],
    queryFn: async () => {
      const { data: roles, error } = await supabase.from('user_roles').select('user_id, role').in('role', ['seller', 'coordinator']);
      if (error || !roles?.length) return [] as string[];
      const { data: profs, error: e2 } = await supabase.from('profiles').select('id, name').in('id', roles.map((r) => r.user_id));
      if (e2) return [] as string[];
      return Array.from(new Set((profs || []).map((p) => p.name).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'sv'));
    },
    staleTime: 10 * 60_000,
  });
  const list = data && data.length ? data : [];
  return list.includes(currentUser) ? list : [currentUser, ...list];
}

function useInvalidate(ticket: Pick<Ticket, 'id' | 'case_id'>) {
  const qc = useQueryClient();
  return () => TICKET_QUERY_KEYS(ticket.id, ticket.case_id).forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

const todayPlus = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface BaseProps { ticket: Ticket; open: boolean; onOpenChange: (o: boolean) => void; currentUser: string }

function useRunner(ticket: Ticket, onOpenChange: (o: boolean) => void) {
  const invalidate = useInvalidate(ticket);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try { await fn(); invalidate(); if (ok) toast.success(ok); onOpenChange(false); }
    catch (e: any) { toast.error(e?.message || 'Något gick fel'); }
    finally { setBusy(false); }
  };
  return { busy, run };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

// ---------- NextStepDialog ----------

export function NextStepDialog({ ticket, mode, open, onOpenChange, currentUser, staff }: BaseProps & { mode: 'set' | 'done'; staff: string[] }) {
  const [step, setStep] = useState('');
  const [due, setDue] = useState(todayPlus(3));
  const [owner, setOwner] = useState(ticket.owner || currentUser);
  const [ball, setBall] = useState<Ball>(ticket.ball || 'oss');
  const { busy, run } = useRunner(ticket, onOpenChange);

  useEffect(() => {
    if (!open) return;
    const prefill = mode === 'set' && ticket.next_step;
    setStep(prefill ? ticket.next_step || '' : '');
    setDue(prefill && ticket.next_step_due ? ticket.next_step_due : todayPlus(3));
    setOwner(ticket.owner || currentUser);
    setBall(ticket.ball || 'oss');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const owners = staff.includes(owner) ? staff : [owner, ...staff];
  const save = () => run(async () => {
    if (!step.trim()) throw new Error('Skriv vad nästa steg är');
    if (mode === 'done' && ticket.next_step) await addTicketEvent(ticket, 'ticket_change', `Klart: ${ticket.next_step}`, currentUser);
    await updateTicket(ticket.id, { next_step: step.trim(), next_step_due: due || null, next_step_owner: owner || null, ball, owner: owner || null });
  }, 'Nästa steg sparat');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'done' ? 'Klart – sätt nästa steg' : 'Nästa steg'}</DialogTitle>
          {mode === 'done' && ticket.next_step && <DialogDescription>Markerar "{ticket.next_step}" som klart.</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nästa steg *"><Input value={step} onChange={(e) => setStep(e.target.value)} placeholder="T.ex. Ring kunden och boka tid" autoFocus /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Förfaller"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            <Field label="Ägare">
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{owners.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Bollen ligger hos">
            <Select value={ball} onValueChange={(v) => setBall(v as Ball)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BALLS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={save} disabled={busy}>Spara</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- CallDialog ----------

const CALL_WITH = ['Kunden', 'Fabriken', 'Montören', 'Annan'];

export function CallDialog({ ticket, open, onOpenChange, currentUser }: BaseProps) {
  const [who, setWho] = useState('Kunden');
  const [note, setNote] = useState('');
  const { busy, run } = useRunner(ticket, onOpenChange);
  useEffect(() => { if (open) { setWho('Kunden'); setNote(''); } }, [open]);
  const save = () => run(async () => {
    if (!note.trim()) throw new Error('Skriv en anteckning om samtalet');
    await addTicketEvent(ticket, 'ticket_call', `Samtal med ${who.toLowerCase()}: ${note.trim()}`, currentUser);
  }, 'Samtal loggat');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Logga samtal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Med vem?">
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CALL_WITH.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Anteckning"><Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={save} disabled={busy}>Spara</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- EmailCustomerDialog ----------

export function EmailCustomerDialog({ ticket, open, onOpenChange, currentUser }: BaseProps) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const { busy, run } = useRunner(ticket, onOpenChange);
  useEffect(() => {
    if (!open) return;
    setTo(ticket.cases?.customer_email || '');
    setSubject(`Angående ${ticket.cases?.address || ''} – ${ticket.title || ''}`);
    setBody('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = () => run(async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) throw new Error('Ange en giltig e-postadress');
    if (!body.trim()) throw new Error('Skriv ett meddelande');
    await sendNotificationEmail({ to: to.trim(), subject, body, heading: subject });
    await addTicketEvent(ticket, 'ticket_email_customer', `Mejl till kunden: ${subject}`, currentUser);
  }, 'Mejlet skickat');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mejla kunden</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Till">
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} />
            {!ticket.cases?.customer_email && <p className="text-xs text-destructive">Ärendet saknar kundens e-post — fyll i adressen.</p>}
          </Field>
          <Field label="Ämne"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Meddelande"><Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={send} disabled={busy}>Skicka</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- BookMontorDialog ----------

export function BookMontorDialog({ ticket, open, onOpenChange, currentUser }: BaseProps) {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const { busy, run } = useRunner(ticket, onOpenChange);
  useEffect(() => { if (open) { setDate(todayPlus(7)); setNote(''); } }, [open]);
  const save = () => run(async () => {
    if (!date) throw new Error('Välj datum');
    await updateTicket(ticket.id, { ball: 'montor', status: 'under_atgard', next_step: 'Återbesök/åtgärd på plats', next_step_due: date, next_step_owner: ticket.cases?.team || null });
    await addTicketEvent(ticket, 'ticket_booking', `Montör bokad ${date}${note.trim() ? `: ${note.trim()}` : ''}`, currentUser);
  }, 'Montör bokad');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Boka montör</DialogTitle>
          <DialogDescription>Team: {ticket.cases?.team || 'inget team på ärendet'}. Montören ser steget i sin app.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Datum"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Anteckning"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={save} disabled={busy}>Boka</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- CostDialog ----------

export function CostDialog({ ticket, open, onOpenChange, currentUser }: BaseProps) {
  const qc = useQueryClient();
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const { busy, run } = useRunner(ticket, onOpenChange);
  useEffect(() => { if (open) { setDesc(''); setAmount(''); } }, [open]);
  const save = () => run(async () => {
    const amt = Number(amount.replace(',', '.'));
    if (!desc.trim()) throw new Error('Skriv en beskrivning');
    if (!Number.isFinite(amt) || amt <= 0) throw new Error('Ange ett belopp');
    await createCaseCost({ case_id: ticket.case_id, description: desc.trim(), amount: amt, created_by: currentUser });
    await addTicketEvent(ticket, 'ticket_cost', `Kostnad: ${desc.trim()} — ${amt.toLocaleString('sv-SE')} kr`, currentUser);
    qc.invalidateQueries({ queryKey: ['case_costs', ticket.case_id] });
    qc.invalidateQueries({ queryKey: ['unhandled_costs_by_case'] });
  }, 'Kostnad tillagd');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Lägg till kostnad</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Beskrivning"><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label="Belopp (kr ex moms)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={save} disabled={busy}>Spara</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- NoteDialog ----------

export function NoteDialog({ ticket, open, onOpenChange, currentUser }: BaseProps) {
  const [note, setNote] = useState('');
  const { busy, run } = useRunner(ticket, onOpenChange);
  useEffect(() => { if (open) setNote(''); }, [open]);
  const save = () => run(async () => {
    if (!note.trim()) throw new Error('Skriv en anteckning');
    await addTicketEvent(ticket, 'ticket_note', note.trim(), currentUser);
  }, 'Anteckning sparad');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Anteckning</DialogTitle></DialogHeader>
        <Textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={save} disabled={busy}>Spara</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- ResolveDialog ----------

export function ResolveDialog({ ticket, open, onOpenChange, currentUser }: BaseProps) {
  const [note, setNote] = useState('');
  const { busy, run } = useRunner(ticket, onOpenChange);
  useEffect(() => { if (open) setNote(''); }, [open]);
  const save = () => run(() => resolveTicket(ticket, currentUser, note), 'Ärendet löst');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lös ärendet</DialogTitle>
          <DialogDescription>Lägg gärna till hur det löstes (valfritt).</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="T.ex. Ny båge monterad, kunden nöjd" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={save} disabled={busy}>Lös ärendet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
