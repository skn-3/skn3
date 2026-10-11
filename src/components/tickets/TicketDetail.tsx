import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, CalendarDays, Check, Clock, Factory, Link2, Mail, NotebookPen, Pencil, Phone, Printer,
  Receipt, RotateCcw, SlidersHorizontal, Truck, Wrench, X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SignedImage } from '@/components/shared/SignedImage';
import { CostPayoutChip } from '@/components/shared/CostPayoutChip';
import { FactoryClaimSheet, Del1OrderSheet } from '@/components/deviations/DeviationActionPanel';
import { fetchCaseCosts, type CaseRow } from '@/lib/supabaseClient';
import { DEVIATION_RESPONSIBLE, STATUS_LABELS } from '@/lib/constants';
import {
  BALLS, BALL_BY_VALUE, PRIORITIES, TICKET_CATEGORIES, TICKET_QUERY_KEYS, TICKET_STATUSES, ageDays, fetchSiblingTickets,
  fetchTicket, fetchTicketEvents, fmtDue, isOpen, isOverdue, mergeTickets, relTime, reopenTicket, resolveTicket,
  ticketNo, updateTicket, type Ball, type Ticket, type TicketPatch,
} from '@/lib/tickets';
import {
  BookMontorDialog, CallDialog, CategoryChip, CostDialog, EmailCustomerDialog, NextStepDialog, NoteDialog, ResolveDialog,
  useStaff, useToneStyle,
} from './ticketDialogs';
import './ticketTheme.css';

interface Props {
  ticketId: string | null;
  open: boolean;
  onClose: () => void;
  currentUser: string;
  onSelectCase: (c: CaseRow) => void;
}

const NONE = '__none__';
const RESP_LABEL = (v: string | null) => DEVIATION_RESPONSIBLE.find((r) => r.value === v)?.label || v;

function isoMonday(week: number, year: number) {
  const jan4 = new Date(year, 0, 4);
  const mon = new Date(jan4);
  mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return mon;
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function eventIcon(type: string) {
  if (type.startsWith('ticket_email') || type === 'deviation_factory_mail') return Mail;
  if (type === 'ticket_call') return Phone;
  if (type === 'ticket_booking') return CalendarDays;
  if (type === 'ticket_cost') return Receipt;
  if (type === 'ticket_change' || type === 'deviation_status') return SlidersHorizontal;
  if (type === 'ticket_system') return Clock;
  if (type === 'ticket_note' || type === 'note') return Pencil;
  if (type === 'ticket_resolved') return Check;
  if (type === 'ticket_merge') return Link2;
  return AlertTriangle;
}

export function TicketDetail({ ticketId, open, onClose, currentUser, onSelectCase }: Props) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[1100px] p-0 overflow-y-auto">
        <SheetTitle className="sr-only">Ärende</SheetTitle>
        {ticketId && <TicketDetailBody ticketId={ticketId} onClose={onClose} currentUser={currentUser} onSelectCase={onSelectCase} />}
      </SheetContent>
    </Sheet>
  );
}

function TicketDetailBody({ ticketId, onClose, currentUser, onSelectCase }: Omit<Props, 'open'> & { ticketId: string }) {
  const qc = useQueryClient();
  const tone = useToneStyle();
  const staff = useStaff(currentUser);
  const { data: ticket, isLoading } = useQuery({ queryKey: ['ticket', ticketId], queryFn: () => fetchTicket(ticketId) });
  const { data: events = [] } = useQuery({ queryKey: ['ticket_events', ticketId], queryFn: () => fetchTicketEvents(ticketId) });
  const { data: siblings = [] } = useQuery({ queryKey: ['ticket_siblings', ticketId], queryFn: () => fetchSiblingTickets(ticket!), enabled: !!ticket });
  const { data: costs = [] } = useQuery({ queryKey: ['case_costs', ticket?.case_id], queryFn: () => fetchCaseCosts(ticket!.case_id), enabled: !!ticket });

  const [dialog, setDialog] = useState<null | 'next_set' | 'next_done' | 'call' | 'email' | 'book' | 'cost' | 'note' | 'resolve' | 'factory' | 'del1'>(null);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const invalidate = (t: Pick<Ticket, 'id' | 'case_id'>) => {
    TICKET_QUERY_KEYS(t.id, t.case_id).forEach((k) => qc.invalidateQueries({ queryKey: k }));
    qc.invalidateQueries({ queryKey: ['ticket_siblings'] });
    qc.invalidateQueries({ queryKey: ['ticket_latest_events'] });
  };
  const mutate = async (fn: () => Promise<void>, ok: string) => {
    if (!ticket) return;
    try { await fn(); invalidate(ticket); toast.success(ok); } catch (e: any) { toast.error(e?.message || 'Något gick fel'); }
  };
  const patch = (p: TicketPatch, ok = 'Sparat') => mutate(() => updateTicket(ticket!.id, p), ok);

  if (isLoading) return <div className="tc p-8 text-sm tc-muted">Laddar ärende…</div>;
  if (!ticket) return <div className="tc p-8 text-sm tc-muted">Ärendet hittades inte.</div>;

  const open = isOpen(ticket);
  const c = ticket.cases;
  const ball = BALL_BY_VALUE[(ticket.ball || 'oss') as Ball];
  const bt = tone(ball);
  const overdue = isOverdue(ticket);
  const missing = !ticket.next_step?.trim();
  const dialogProps = { ticket, currentUser };

  // Tidslinje
  type Item = { key: string; at: string; by: string; text: string; type: string; images?: string[] };
  const items: Item[] = [
    ...events.map((e) => ({ key: e.id, at: e.created_at, by: e.created_by, text: e.description, type: e.event_type })),
    ...(ticket.action_log || []).filter((a) => a?.at).map((a, i) => ({ key: `al${i}`, at: a.at, by: a.by, text: a.action, type: 'action_log' })),
    { key: 'created', at: ticket.created_at, by: ticket.created_by, text: 'Avvikelse rapporterad', type: 'deviation', images: ticket.image_urls || [] },
  ].sort((a, b) => b.at.localeCompare(a.at));

  const onFactoryDone = async () => {
    setDialog(null);
    await patch({
      ball: 'fabrik', status: 'vantar_leverans',
      next_step: ticket.next_step || 'Invänta svar från fabriken',
      next_step_due: ticket.next_step_due || ymd(new Date(Date.now() + 7 * 86_400_000)),
    }, 'Bollen ligger hos fabriken');
  };
  const onDel1Done = async () => {
    setDialog(null);
    try {
      const fresh = await fetchTicket(ticket.id);
      if (fresh?.del1_delivery_week && fresh.del1_delivery_year) {
        const sun = isoMonday(fresh.del1_delivery_week, fresh.del1_delivery_year);
        sun.setDate(sun.getDate() + 6);
        await updateTicket(ticket.id, { ball: 'fabrik', status: 'vantar_leverans', next_step: `Invänta leverans v.${fresh.del1_delivery_week}`, next_step_due: ymd(sun) });
      }
      invalidate(ticket);
    } catch (e: any) { toast.error(e?.message || 'Kunde inte uppdatera ärendet'); }
  };
  const onStatus = (v: string) => {
    if (v === 'klar') return mutate(() => resolveTicket(ticket, currentUser), 'Ärendet löst');
    return patch({ status: v as Ticket['status'], ...(ticket.resolved && v !== 'avskriven' ? { resolved: false, resolved_at: null } : {}), ...(v === 'avskriven' ? { resolved: true, resolved_at: new Date().toISOString() } : {}) }, 'Status ändrad');
  };

  const owners = ticket.owner && !staff.includes(ticket.owner) ? [ticket.owner, ...staff] : staff;
  const fieldLabel = 'tc-label block mb-1.5';

  return (
    <div className="tc">
      <div className="p-4 md:p-6 space-y-5">
        {/* 1. Huvud */}
        <div className="flex flex-wrap items-center gap-2 tc-noprint">
          <button className="tc-btn" onClick={onClose}><ArrowLeft className="h-4 w-4" /> Alla öppna</button>
          <span className="tc-mono text-sm tc-muted">{ticketNo(ticket)}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="tc-btn" onClick={() => window.print()}><Printer className="h-4 w-4" /> Skriv ut</button>
            {open
              ? <button className="tc-btn tc-btn-ok" onClick={() => setDialog('resolve')}><Check className="h-4 w-4" /> Lös ärendet</button>
              : <button className="tc-btn" onClick={() => mutate(() => reopenTicket(ticket, currentUser), 'Ärendet återöppnat')}><RotateCcw className="h-4 w-4" /> Återöppna</button>}
          </div>
        </div>

        {/* 2. Titel + kopplat ärende */}
        <div className="flex flex-wrap gap-5">
          <div className="flex-[999_1_480px] min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryChip type={ticket.type} />
              {ticket.responsible && <span className="tc-chip tc-chip-neutral">Ansvar: {RESP_LABEL(ticket.responsible)}</span>}
              {ticket.priority === 'hog' && <span className="tc-chip tc-chip-danger">Hög prioritet</span>}
              <span className="text-xs tc-muted">Skapat {relTime(ticket.created_at)} av {ticket.created_by} · {ageDays(ticket)} dagar gammalt</span>
            </div>
            {editTitle === null ? (
              <div className="flex items-start gap-2">
                <h2 className="tc-title text-[28px] leading-tight font-bold break-words min-w-0">{ticket.title || 'Utan titel'}</h2>
                <button className="tc-btn tc-noprint !min-h-[36px] !px-2.5 shrink-0" aria-label="Redigera titel" onClick={() => setEditTitle(ticket.title || '')}><Pencil className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Input className="tc-input flex-1 min-w-[200px]" maxLength={80} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
                <button className="tc-btn tc-btn-accent" onClick={async () => { if (!editTitle.trim()) return toast.error('Titeln får inte vara tom'); await patch({ title: editTitle.trim() }, 'Titel sparad'); setEditTitle(null); }}>Spara</button>
                <button className="tc-btn" onClick={() => setEditTitle(null)}>Avbryt</button>
              </div>
            )}
            {editDesc === null ? (
              <div className="max-w-[760px]">
                <p className="text-[15px] whitespace-pre-wrap">{ticket.description}</p>
                <button className="text-sm font-semibold tc-noprint mt-1 min-h-[44px]" style={{ color: 'var(--tc-accent)' }} onClick={() => setEditDesc(ticket.description || '')}>Redigera</button>
              </div>
            ) : (
              <div className="max-w-[760px] space-y-2">
                <Textarea className="tc-input" rows={5} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                <div className="flex gap-2">
                  <button className="tc-btn tc-btn-accent" onClick={async () => { await patch({ description: editDesc }, 'Beskrivning sparad'); setEditDesc(null); }}>Spara</button>
                  <button className="tc-btn" onClick={() => setEditDesc(null)}>Avbryt</button>
                </div>
              </div>
            )}
          </div>
          {c && (
            <div className="tc-card p-4 flex-[1_1_300px] max-w-[380px] space-y-2">
              <div className="tc-label">Kopplat ärende</div>
              <button className="tc-title text-left text-lg font-bold underline-offset-2 hover:underline min-h-[44px]" style={{ color: 'var(--tc-accent)' }}
                onClick={() => { onSelectCase(c as unknown as CaseRow); onClose(); }}>{c.address}</button>
              <div className="text-sm">
                {c.customer_name}{c.customer_phone && <> · <a className="underline" href={`tel:${c.customer_phone}`}>{c.customer_phone}</a></>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                <div><div className="tc-label">Montageteam</div>{c.team || '—'}</div>
                <div><div className="tc-label">Montagedatum</div>{c.montage_date || '—'}</div>
                <div><div className="tc-label">Säljare</div>{c.seller || '—'}</div>
                <div><div className="tc-label">Status i pipeline</div>{(c.status && STATUS_LABELS[c.status]) || c.status || '—'}</div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Styrfält */}
        <div className="tc-card p-4 grid gap-3 tc-noprint" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div><span className={fieldLabel}>Status</span>
            <Select value={ticket.status || 'ny'} onValueChange={onStatus}><SelectTrigger className="tc-input min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>{TICKET_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><span className={fieldLabel}>Bollen ligger hos</span>
            <Select value={ticket.ball || 'oss'} onValueChange={(v) => patch({ ball: v as Ball }, 'Bollen flyttad')}>
              <SelectTrigger className="tc-input min-h-[44px]" style={{ borderColor: bt.color, borderWidth: 2 }}><SelectValue /></SelectTrigger>
              <SelectContent>{BALLS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><span className={fieldLabel}>Ägare</span>
            <Select value={ticket.owner || NONE} onValueChange={(v) => patch({ owner: v === NONE ? null : v }, 'Ägare ändrad')}><SelectTrigger className="tc-input min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Ingen</SelectItem>{owners.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><span className={fieldLabel}>Prioritet</span>
            <Select value={ticket.priority || 'medium'} onValueChange={(v) => patch({ priority: v as Ticket['priority'] }, 'Prioritet ändrad')}><SelectTrigger className="tc-input min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><span className={fieldLabel}>Kategori</span>
            <Select value={ticket.type} onValueChange={(v) => patch({ type: v }, 'Kategori ändrad')}><SelectTrigger className="tc-input min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>{TICKET_CATEGORIES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><span className={fieldLabel}>Ansvar</span>
            <Select value={ticket.responsible || 'okant'} onValueChange={(v) => patch({ responsible: v }, 'Ansvar ändrat')}><SelectTrigger className="tc-input min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>{DEVIATION_RESPONSIBLE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>

        {/* 4. Nästa steg */}
        {open && (
          <div className="p-4 md:p-5 space-y-2" style={{ borderRadius: 14, border: '1px solid', background: missing ? 'var(--tc-danger-bg)' : 'var(--tc-accent-bg)', borderColor: missing ? 'var(--tc-danger)' : 'var(--tc-accent)' }}>
            {missing ? (
              <>
                <div className="tc-title text-lg font-bold" style={{ color: 'var(--tc-danger)' }}>Nästa steg saknas — vad ska hända härnäst?</div>
                <button className="tc-btn tc-btn-accent tc-noprint" onClick={() => setDialog('next_set')}>Sätt nästa steg</button>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="tc-label" style={{ color: 'var(--tc-accent)' }}>Nästa steg</span>
                  <span style={{ color: overdue ? 'var(--tc-danger)' : undefined, fontWeight: overdue ? 600 : undefined }}>
                    Ägare: {ticket.next_step_owner || ticket.owner || '—'}{ticket.next_step_due && <> · förfaller {fmtDue(ticket.next_step_due)}</>}
                  </span>
                </div>
                <div className="tc-title text-xl font-bold">{ticket.next_step}</div>
                <div className="flex flex-wrap gap-2 tc-noprint">
                  <button className="tc-btn tc-btn-accent" onClick={() => setDialog('next_done')}><Check className="h-4 w-4" /> Klart – sätt nästa</button>
                  <button className="tc-btn" onClick={() => setDialog('next_set')}>Ändra</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 5. Åtgärder */}
        <div className="grid gap-2 tc-noprint" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <button className="tc-btn" onClick={() => setDialog('call')}><Phone className="h-4 w-4" /> Logga samtal</button>
          <button className="tc-btn" onClick={() => setDialog('email')}><Mail className="h-4 w-4" /> Mejla kunden</button>
          <button className="tc-btn" onClick={() => setDialog('factory')}><Factory className="h-4 w-4" /> Mejla fabriken</button>
          <button className="tc-btn" onClick={() => setDialog('del1')}><Truck className="h-4 w-4" /> DEL1-order</button>
          <button className="tc-btn" onClick={() => setDialog('book')}><Wrench className="h-4 w-4" /> Boka montör</button>
          <button className="tc-btn" onClick={() => setDialog('cost')}><Receipt className="h-4 w-4" /> Lägg till kostnad</button>
          <button className="tc-btn" onClick={() => setDialog('note')}><NotebookPen className="h-4 w-4" /> Anteckning</button>
        </div>

        <div className="flex flex-wrap gap-5 items-start">
          {/* 6. Vad har hänt */}
          <div className="tc-card p-4 flex-[999_1_480px] min-w-0">
            <h2 className="text-lg font-bold mb-3">Vad har hänt</h2>
            <ol className="space-y-3">
              {items.map((it) => {
                const Icon = it.type === 'action_log' ? SlidersHorizontal : eventIcon(it.type);
                const danger = it.type === 'deviation';
                const ok = it.type === 'ticket_resolved';
                return (
                  <li key={it.key} className="flex gap-3">
                    <span className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: danger ? 'var(--tc-danger-bg)' : ok ? 'var(--tc-ok-bg)' : 'var(--tc-accent-bg)', color: danger ? 'var(--tc-danger)' : ok ? 'var(--tc-ok)' : 'var(--tc-accent)' }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold break-words whitespace-pre-wrap">{it.text}</div>
                      <div className="text-xs tc-muted"><span className="tc-mono">{relTime(it.at)}</span> · {it.by}</div>
                      {!!it.images?.length && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {it.images.map((p) => (
                            <button key={p} onClick={() => setZoom(p)} className="h-14 w-14 rounded-md overflow-hidden border" style={{ borderColor: 'var(--tc-border)' }} aria-label="Förstora bild">
                              <SignedImage value={p} className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* 7. Höger kolumn */}
          <div className="flex-[1_1_300px] max-w-full md:max-w-[380px] space-y-4">
            {(ticket.factory_email_sent_at || ticket.del1_order_number) && (
              <div className="tc-card p-4 space-y-2 text-sm">
                <h2 className="text-base font-bold">Hos fabriken</h2>
                <Row label="DEL1-order" value={ticket.del1_order_number || '—'} />
                <Row label="Leveransvecka" value={ticket.del1_delivery_week && ticket.del1_delivery_year
                  ? `v.${ticket.del1_delivery_week} (${isoMonday(ticket.del1_delivery_week, ticket.del1_delivery_year).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })})` : '—'} />
                <Row label="Mejl till fabrik" value={ticket.factory_email_sent_at ? new Date(ticket.factory_email_sent_at).toLocaleDateString('sv-SE') : '—'} />
                <Row label="Påminnelser" value={`${ticket.reminder_count || 0} av 3`} />
                <p className="text-xs tc-muted">Passerar leveransveckan utan händelse flyttas bollen automatiskt till oss.</p>
                <button className="tc-btn w-full tc-noprint" onClick={() => setDialog('factory')}>Påminn fabriken</button>
              </div>
            )}
            <div className="tc-card p-4 space-y-2 text-sm">
              <h2 className="text-base font-bold">Ekonomi</h2>
              {Number(ticket.cost) > 0 && <Row label="Uppskattad kostnad" value={`${Number(ticket.cost).toLocaleString('sv-SE')} kr`} />}
              {costs.length === 0 && !(Number(ticket.cost) > 0) && <p className="tc-muted">Inga kostnader registrerade.</p>}
              {costs.map((k) => (
                <div key={k.id} className="flex flex-wrap items-center gap-2 py-1 border-t" style={{ borderColor: 'var(--tc-border)' }}>
                  <span className="flex-1 min-w-0 truncate">{k.description}</span>
                  <span className="tc-mono">{Number(k.amount).toLocaleString('sv-SE')} kr</span>
                  <CostPayoutChip cost={{ a_order_id: k.a_order_id ?? null, payout_excluded_at: k.payout_excluded_at ?? null, payout_excluded_by: k.payout_excluded_by ?? null }} />
                </div>
              ))}
              {ticket.responsible === 'fabrik' && <p className="text-xs tc-muted">Ansvar fabrik: kostnaden faktureras Mockfjärds.</p>}
              {ticket.responsible === 'montor' && <p className="text-xs tc-muted">Ansvar montör: belastar montörens ersättning.</p>}
            </div>
            {siblings.length > 0 && (
              <div className="tc-card p-4 space-y-2 text-sm">
                <h2 className="text-base font-bold">Samma adress</h2>
                <p className="tc-muted">{siblings.length} öppna ärenden till på samma adress.</p>
                {siblings.map((s) => (
                  <div key={s.id} className="border-t pt-2 space-y-1" style={{ borderColor: 'var(--tc-border)' }}>
                    <div className="font-semibold">{s.title || s.description.slice(0, 60)}</div>
                    <div className="text-xs tc-muted"><span className="tc-mono">{ticketNo(s)}</span> · {new Date(s.created_at).toLocaleDateString('sv-SE')}</div>
                    <button className="tc-btn w-full tc-noprint" onClick={() => {
                      if (!window.confirm(`Slå ihop ${ticketNo(s)} in i ${ticketNo(ticket)}? Händelser, bilder och kostnad flyttas hit.`)) return;
                      mutate(async () => { await mergeTickets(s, ticket, currentUser); invalidate(s); }, 'Ärendena sammanslagna');
                    }}><Link2 className="h-4 w-4" /> Slå ihop in i det här ärendet</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <button className="absolute top-4 right-4 h-11 w-11 rounded-full bg-background/90 flex items-center justify-center" aria-label="Stäng bild"><X className="h-5 w-5" /></button>
          <SignedImage value={zoom} className="max-h-full max-w-full object-contain rounded-lg" />
        </div>
      )}

      <NextStepDialog {...dialogProps} mode={dialog === 'next_done' ? 'done' : 'set'} open={dialog === 'next_set' || dialog === 'next_done'} onOpenChange={(o) => !o && setDialog(null)} staff={staff} />
      <CallDialog {...dialogProps} open={dialog === 'call'} onOpenChange={(o) => !o && setDialog(null)} />
      <EmailCustomerDialog {...dialogProps} open={dialog === 'email'} onOpenChange={(o) => !o && setDialog(null)} />
      <BookMontorDialog {...dialogProps} open={dialog === 'book'} onOpenChange={(o) => !o && setDialog(null)} />
      <CostDialog {...dialogProps} open={dialog === 'cost'} onOpenChange={(o) => !o && setDialog(null)} />
      <NoteDialog {...dialogProps} open={dialog === 'note'} onOpenChange={(o) => !o && setDialog(null)} />
      <ResolveDialog {...dialogProps} open={dialog === 'resolve'} onOpenChange={(o) => !o && setDialog(null)} />
      {dialog === 'factory' && (
        <FactoryClaimSheet open onClose={() => setDialog(null)} deviation={ticket as any} caseData={c as unknown as CaseRow} currentUser={currentUser} onDone={onFactoryDone} />
      )}
      {dialog === 'del1' && (
        <Del1OrderSheet open onClose={() => setDialog(null)} deviation={ticket as any} caseData={c as unknown as CaseRow} currentUser={currentUser} onDone={onDel1Done} />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="tc-muted">{label}</span><span className="font-medium text-right">{value}</span></div>;
}
