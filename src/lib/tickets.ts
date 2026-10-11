// Ärendecenter — datamodell, härledda fält och databasanrop.
// Ett "ärende" är en rad i deviations (reklamationer, felmätningar, kundtjänst ...).
// Grundidén: listan grupperas efter vem som har bollen (ball), varje öppet ärende har ett
// nästa steg med datum och ägare, och tystnad (inga händelser) flaggas.

import { supabase } from '@/integrations/supabase/client';
import { DEVIATION_TYPES } from '@/lib/constants';

export type Ball = 'oss' | 'fabrik' | 'montor' | 'kund';
export type Priority = 'hog' | 'medium' | 'lag';
export type TicketStatus = 'ny' | 'under_atgard' | 'vantar_leverans' | 'klar' | 'avskriven';

export const BALLS: Array<{
  value: Ball; label: string; heading: string; blurb: string;
  color: string; bg: string; border: string; text: string;
}> = [
  { value: 'oss', label: 'Oss', heading: 'Hos oss', blurb: 'Vi har nästa steg. Det här är dagens lista.', color: '#0E5C63', bg: '#DDEFF0', border: '#C5E0E2', text: '#083F44' },
  { value: 'fabrik', label: 'Fabriken', heading: 'Väntar på fabriken', blurb: 'Mockfjärds har bollen. Vi påminner när datumet passerar.', color: '#5B3FB8', bg: '#E8E3F8', border: '#D6CDF0', text: '#3F2A8A' },
  { value: 'montor', label: 'Montören', heading: 'Väntar på montören', blurb: 'Montören ser nästa steg i sin app.', color: '#1F5FBF', bg: '#DFE8F8', border: '#C9D7F0', text: '#1A4A96' },
  { value: 'kund', label: 'Kunden', heading: 'Väntar på kunden', blurb: 'Kunden ska svara eller välja tid.', color: '#C77A00', bg: '#FBEBD0', border: '#F0D9A8', text: '#7A4800' },
];
export const BALL_BY_VALUE = Object.fromEntries(BALLS.map((b) => [b.value, b])) as Record<Ball, (typeof BALLS)[number]>;

export const PRIORITIES: Array<{ value: Priority; label: string; dot: string }> = [
  { value: 'hog', label: 'Hög', dot: '#B42318' },
  { value: 'medium', label: 'Normal', dot: '#8A97A8' },
  { value: 'lag', label: 'Låg', dot: '#C3CBD6' },
];

export const TICKET_STATUSES: Array<{ value: TicketStatus; label: string; bg: string; text: string; open: boolean }> = [
  { value: 'ny', label: 'Ny', bg: '#EEF1F4', text: '#0F1B2D', open: true },
  { value: 'under_atgard', label: 'Pågår', bg: '#DDEFF0', text: '#0E5C63', open: true },
  { value: 'vantar_leverans', label: 'Väntar leverans', bg: '#FBEBD0', text: '#9A5B00', open: true },
  { value: 'klar', label: 'Löst', bg: '#DCF3E3', text: '#1E7A3C', open: false },
  { value: 'avskriven', label: 'Avskriven', bg: '#EEF1F4', text: '#5B6B7F', open: false },
];
export const STATUS_BY_VALUE = Object.fromEntries(TICKET_STATUSES.map((s) => [s.value, s])) as Record<TicketStatus, (typeof TICKET_STATUSES)[number]>;

/** Kategorier = befintliga avvikelsetyper + kundtjänst. */
export const TICKET_CATEGORIES: Array<{ value: string; label: string }> = [
  ...DEVIATION_TYPES.map((t) => ({ value: t.value as string, label: t.label as string })),
  { value: 'kundtjanst', label: 'Kundtjänst' },
];
export const CATEGORY_LABEL = (value: string | null | undefined) => TICKET_CATEGORIES.find((c) => c.value === value)?.label || value || '—';

export const SILENT_DAYS = 5;

export interface Ticket {
  id: string;
  ticket_no: number | null;
  case_id: string;
  created_at: string;
  created_by: string;
  type: string;
  title: string | null;
  description: string;
  responsible: string | null;
  status: TicketStatus | null;
  resolved: boolean;
  resolved_at: string | null;
  priority: Priority | null;
  ball: Ball | null;
  owner: string | null;
  next_step: string | null;
  next_step_due: string | null;
  next_step_owner: string | null;
  last_event_at: string | null;
  merged_into_id: string | null;
  cost: number | null;
  image_urls: string[] | null;
  del1_order_number: string | null;
  del1_delivery_week: number | null;
  del1_delivery_year: number | null;
  factory_email_sent_at: string | null;
  factory_email_to: string | null;
  reminder_count: number | null;
  action_log: Array<{ at: string; by: string; action: string }> | null;
  cases?: { id: string; address: string; customer_name: string | null; customer_phone: string | null; customer_email?: string | null; team: string | null; km_team?: string | null; seller: string | null; status: string | null; montage_date: string | null; offer_number?: string | null; order_number?: string | null; delivery_date?: string | null; delivery_week?: number | null; delivery_year?: number | null } | null;
}

export interface TicketEvent {
  id: string;
  created_at: string;
  event_type: string;
  description: string;
  created_by: string;
  deviation_id?: string | null;
}

// ---------- Härledda fält (rena funktioner, testade i __tests__/tickets.test.ts) ----------

const MS_DAY = 86_400_000;

export function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  return Math.floor((db.getTime() - da.getTime()) / MS_DAY);
}

export function isOpen(t: Pick<Ticket, 'resolved' | 'status' | 'merged_into_id'>): boolean {
  if (t.merged_into_id) return false;
  if (t.resolved) return false;
  const s = t.status ? STATUS_BY_VALUE[t.status] : null;
  return s ? s.open : true;
}

export function ageDays(t: Pick<Ticket, 'created_at'>, now: Date = new Date()): number {
  return Math.max(0, daysBetween(t.created_at, now));
}

/** Dagar sedan senaste händelse. */
export function silentDays(t: Pick<Ticket, 'last_event_at' | 'created_at'>, now: Date = new Date()): number {
  return Math.max(0, daysBetween(t.last_event_at || t.created_at, now));
}

export function isSilent(t: Pick<Ticket, 'last_event_at' | 'created_at'>, now: Date = new Date()): boolean {
  return silentDays(t, now) >= SILENT_DAYS;
}

/** Negativt = kvar till förfall, 0 = i dag, positivt = dagar försenat. null = inget datum. */
export function dueDelta(t: Pick<Ticket, 'next_step_due'>, now: Date = new Date()): number | null {
  if (!t.next_step_due) return null;
  const due = new Date(t.next_step_due + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return daysBetween(due, today);
}

export function isOverdue(t: Pick<Ticket, 'next_step_due'>, now: Date = new Date()): boolean {
  const d = dueDelta(t, now);
  return d !== null && d > 0;
}

export function missingNextStep(t: Pick<Ticket, 'next_step' | 'ball'>): boolean {
  // Hos oss kräver ett nästa steg. När bollen ligger hos någon annan är nästa steg ändå önskvärt men inte rött.
  return !t.next_step?.trim();
}

export type Grouping = 'ball' | 'status' | 'category' | 'owner';

export function groupKey(t: Ticket, grouping: Grouping): string {
  switch (grouping) {
    case 'ball': return t.ball || 'oss';
    case 'status': return t.status || 'ny';
    case 'category': return t.type || 'ovrigt';
    case 'owner': return t.owner || '__none__';
  }
}

export function groupLabel(key: string, grouping: Grouping): { heading: string; blurb?: string; color: string; bg: string; border: string; text: string } {
  if (grouping === 'ball') {
    const b = BALL_BY_VALUE[key as Ball] || BALL_BY_VALUE.oss;
    return { heading: b.heading, blurb: b.blurb, color: b.color, bg: b.bg, border: b.border, text: b.text };
  }
  if (grouping === 'status') {
    const s = STATUS_BY_VALUE[key as TicketStatus] || STATUS_BY_VALUE.ny;
    return { heading: s.label, color: s.text, bg: s.bg, border: '#D9DEE5', text: s.text };
  }
  if (grouping === 'category') {
    return { heading: CATEGORY_LABEL(key), color: '#5B3FB8', bg: '#E8E3F8', border: '#D6CDF0', text: '#3F2A8A' };
  }
  return { heading: key === '__none__' ? 'Ingen ägare' : key, color: '#0E5C63', bg: '#DDEFF0', border: '#C5E0E2', text: '#083F44' };
}

export const GROUP_ORDER: Record<Grouping, string[]> = {
  ball: ['oss', 'fabrik', 'montor', 'kund'],
  status: ['ny', 'under_atgard', 'vantar_leverans', 'klar', 'avskriven'],
  category: TICKET_CATEGORIES.map((c) => c.value),
  owner: [],
};

export type SortKey = 'next_step' | 'last_event' | 'age' | 'priority';

const PRIO_RANK: Record<Priority, number> = { hog: 0, medium: 1, lag: 2 };

/** Sorterar: försenade först, sedan saknat nästa steg, sedan enligt vald nyckel. */
export function sortTickets(list: Ticket[], key: SortKey, now: Date = new Date()): Ticket[] {
  const rank = (t: Ticket) => {
    const over = isOverdue(t, now) ? 0 : 1;
    const missing = missingNextStep(t) ? 0 : 1;
    return [over, missing];
  };
  return [...list].sort((a, b) => {
    const [oa, ma] = rank(a); const [ob, mb] = rank(b);
    if (oa !== ob) return oa - ob;
    if (ma !== mb) return ma - mb;
    switch (key) {
      case 'next_step': {
        const da = a.next_step_due || '9999-12-31'; const db = b.next_step_due || '9999-12-31';
        return da.localeCompare(db);
      }
      case 'last_event': return (b.last_event_at || b.created_at).localeCompare(a.last_event_at || a.created_at);
      case 'age': return a.created_at.localeCompare(b.created_at);
      case 'priority': return PRIO_RANK[a.priority || 'medium'] - PRIO_RANK[b.priority || 'medium'];
    }
  });
}

export interface TicketKpis {
  open: number; oss: number; overdue: number; silent: number; resolved30: number; missingNextStep: number;
}

export function computeKpis(all: Ticket[], now: Date = new Date()): TicketKpis {
  const open = all.filter(isOpen);
  const since30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();
  return {
    open: open.length,
    oss: open.filter((t) => (t.ball || 'oss') === 'oss').length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    silent: open.filter((t) => isSilent(t, now)).length,
    missingNextStep: open.filter(missingNextStep).length,
    resolved30: all.filter((t) => !isOpen(t) && (t.resolved_at || '') >= since30).length,
  };
}

/** Relativ tid på svenska: "i dag 14:02", "i går", "ons 8 okt", "2 okt". */
export function relTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  const hhmm = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `i dag ${hhmm}`;
  const yesterday = new Date(now.getTime() - MS_DAY);
  if (d.toDateString() === yesterday.toDateString()) return `i går ${hhmm}`;
  if (daysBetween(d, now) < 7) return d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '');
}

export function fmtDue(due: string | null | undefined): string {
  if (!due) return '';
  return new Date(due + 'T00:00:00').toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
}

/** Ärendenummer som det visas: Ä-142. */
export function ticketNo(t: Pick<Ticket, 'ticket_no' | 'id'>): string {
  return t.ticket_no != null ? `Ä-${t.ticket_no}` : `Ä-${t.id.slice(0, 4).toUpperCase()}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

// ---------- Databas ----------

const TICKET_SELECT = '*, cases!deviations_case_id_fkey(id, address, customer_name, customer_phone, customer_email, team, km_team, seller, status, montage_date, offer_number, order_number, delivery_date, delivery_week, delivery_year)';

export async function fetchTickets(): Promise<Ticket[]> {
  const { data, error } = await (supabase as any)
    .from('deviations')
    .select(TICKET_SELECT)
    .is('merged_into_id', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Ticket[];
}

export async function fetchTicket(id: string): Promise<Ticket | null> {
  const { data, error } = await (supabase as any).from('deviations').select(TICKET_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Ticket | null;
}

export async function fetchTicketEvents(ticketId: string): Promise<TicketEvent[]> {
  const { data, error } = await (supabase as any)
    .from('case_events')
    .select('id, created_at, event_type, description, created_by, deviation_id')
    .eq('deviation_id', ticketId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TicketEvent[];
}

/** Andra öppna ärenden på samma adress (för "Slå ihop"). */
export async function fetchSiblingTickets(ticket: Pick<Ticket, 'id' | 'case_id'>): Promise<Ticket[]> {
  const { data, error } = await (supabase as any)
    .from('deviations')
    .select(TICKET_SELECT)
    .eq('case_id', ticket.case_id)
    .neq('id', ticket.id)
    .is('merged_into_id', null)
    .eq('resolved', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Ticket[];
}

export type TicketEventKind = 'ticket_note' | 'ticket_call' | 'ticket_email_customer' | 'ticket_email_factory' | 'ticket_booking' | 'ticket_cost' | 'ticket_change' | 'ticket_merge' | 'ticket_resolved' | 'ticket_system';

export async function addTicketEvent(ticket: Pick<Ticket, 'id' | 'case_id'>, kind: TicketEventKind, description: string, by: string): Promise<void> {
  const { error } = await (supabase as any).from('case_events').insert({
    case_id: ticket.case_id,
    deviation_id: ticket.id,
    event_type: kind,
    description,
    created_by: by,
  });
  if (error) throw error;
}

export type TicketPatch = Partial<Pick<Ticket, 'title' | 'description' | 'type' | 'responsible' | 'status' | 'resolved' | 'resolved_at' | 'priority' | 'ball' | 'owner' | 'next_step' | 'next_step_due' | 'next_step_owner' | 'cost' | 'merged_into_id'>>;

/** Uppdaterar ärendet. Ändringar av status/bollen/ägare/nästa steg loggas av databasen (trigger deviations_log_changes). */
export async function updateTicket(id: string, patch: TicketPatch): Promise<void> {
  const { error } = await (supabase as any).from('deviations').update(patch).eq('id', id);
  if (error) throw error;
}

export async function resolveTicket(ticket: Pick<Ticket, 'id' | 'case_id'>, by: string, note?: string): Promise<void> {
  await updateTicket(ticket.id, { status: 'klar', resolved: true, resolved_at: new Date().toISOString(), ball: 'oss', next_step: null, next_step_due: null, next_step_owner: null });
  await addTicketEvent(ticket, 'ticket_resolved', note?.trim() ? `Ärendet löst: ${note.trim()}` : 'Ärendet löst', by);
}

export async function reopenTicket(ticket: Pick<Ticket, 'id' | 'case_id'>, by: string): Promise<void> {
  await updateTicket(ticket.id, { status: 'under_atgard', resolved: false, resolved_at: null, ball: 'oss' });
  await addTicketEvent(ticket, 'ticket_change', 'Ärendet återöppnat', by);
}

/** Slår ihop `from` in i `into`: from markeras merged_into_id, händelser flyttas, bilder och kostnad summeras. */
export async function mergeTickets(from: Ticket, into: Ticket, by: string): Promise<void> {
  const images = [...(into.image_urls || []), ...(from.image_urls || [])];
  const cost = (Number(into.cost) || 0) + (Number(from.cost) || 0);
  const descr = from.description?.trim() && from.description.trim() !== into.description?.trim()
    ? `${into.description || ''}\n\n[Sammanslaget från ${new Date(from.created_at).toLocaleDateString('sv-SE')}] ${from.description}`
    : into.description;
  await updateTicket(into.id, { image_urls: images, cost, description: descr } as any);
  const { error } = await (supabase as any).from('case_events').update({ deviation_id: into.id }).eq('deviation_id', from.id);
  if (error) throw error;
  await updateTicket(from.id, { merged_into_id: into.id, resolved: true, resolved_at: new Date().toISOString(), status: 'avskriven' });
  await addTicketEvent(into, 'ticket_merge', `Slog ihop ett dubblettärende (${from.title || from.description?.slice(0, 60)})`, by);
}

export interface NewTicketInput {
  case_id: string;
  title: string;
  type: string;
  description: string;
  responsible: string | null;
  priority: Priority;
  ball: Ball;
  owner: string | null;
  next_step: string | null;
  next_step_due: string | null;
  created_by: string;
}

export async function createTicket(input: NewTicketInput): Promise<Ticket> {
  const { data, error } = await (supabase as any)
    .from('deviations')
    .insert({
      case_id: input.case_id,
      title: input.title.trim().slice(0, 80),
      type: input.type,
      description: input.description,
      responsible: input.responsible,
      priority: input.priority,
      ball: input.ball,
      owner: input.owner,
      next_step: input.next_step,
      next_step_due: input.next_step_due,
      next_step_owner: input.next_step ? (input.owner || input.created_by) : null,
      status: 'ny',
      resolved: false,
      created_by: input.created_by,
      action_log: [{ at: new Date().toISOString(), by: input.created_by, action: 'Skapad i Ärendecenter' }],
    })
    .select(TICKET_SELECT)
    .single();
  if (error) throw error;
  const t = data as Ticket;
  await addTicketEvent(t, 'ticket_note', `Ärende skapat: ${CATEGORY_LABEL(input.type)} — ${input.title}`, input.created_by);
  return t;
}

export const TICKET_QUERY_KEYS = (ticketId?: string | null, caseId?: string | null) => [
  ['tickets'],
  ['ticket', ticketId ?? null],
  ['ticket_events', ticketId ?? null],
  ['deviations', caseId ?? null],
  ['deviations_bulk'],
  ['case_events', caseId ?? null],
  ['coordinator-all-deviations'],
  ['coordinator-deviations'],
];
