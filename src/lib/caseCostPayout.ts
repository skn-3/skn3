// Koppling mellan kostnader på ett ärende (case_costs, oftast registrerade av montören)
// och A-ordern/fakturan som ersätter dem.
//
// En kostnad har tre lägen:
//   - obehandlad: a_order_id är null och payout_excluded_at är null → ska hanteras på A-ordern
//   - tillagd:    a_order_id pekar på A-ordern och a_order_line_id på raden (line_items[].id)
//   - ersätts inte: payout_excluded_at är satt (säljaren har beslutat att kostnaden inte ska på A-ordern)
//
// Raden på A-ordern bär cost_id, så kopplingen kan räknas fram från line_items vid varje sparning
// (planCostLinkSync). Tas raden bort blir kostnaden obehandlad igen.

import { supabase } from '@/integrations/supabase/client';
import type { AOrderLine } from './aOrderLines';

export interface PayoutCost {
  id: string;
  case_id: string;
  created_at: string;
  description: string;
  amount: number;
  receipt_url: string | null;
  created_by: string;
  category: 'ovrigt' | 'reklamation' | null;
  responsible: string | null;
  a_order_id: string | null;
  a_order_line_id: string | null;
  payout_excluded_at: string | null;
  payout_excluded_by: string | null;
}

export type PayoutState = 'pending' | 'added' | 'excluded';

export function payoutState(c: Pick<PayoutCost, 'a_order_id' | 'payout_excluded_at'>): PayoutState {
  if (c.a_order_id) return 'added';
  if (c.payout_excluded_at) return 'excluded';
  return 'pending';
}

export const COST_LINE_PREFIX = 'Utlägg: ';

/** Bygger A-orderraden för en kostnad. Raden bär cost_id så kopplingen överlever sparning/omladdning. */
export function costToLine(c: Pick<PayoutCost, 'id' | 'description' | 'amount'>, makeId: () => string): AOrderLine {
  const amount = Math.round(Number(c.amount) || 0);
  return {
    id: makeId(),
    name: `${COST_LINE_PREFIX}${String(c.description || '').trim()}`,
    unit_price: amount,
    qty: 1,
    amount,
    auto: false,
    cost_id: c.id,
  };
}

/** Kostnads-id:n som ligger som rader i en radlista. */
export function linkedCostIds(lines: Array<Pick<AOrderLine, 'cost_id'>>): Set<string> {
  const s = new Set<string>();
  for (const l of lines) if (l.cost_id) s.add(l.cost_id);
  return s;
}

/**
 * Ren beräkning av vad som ska kopplas/kopplas isär när en order sparas med `lines`.
 * `currentlyLinked` = kostnader som i databasen redan pekar på denna order.
 */
export function planCostLinkSync(
  lines: Array<Pick<AOrderLine, 'id' | 'cost_id'>>,
  currentlyLinked: Array<{ id: string; a_order_line_id: string | null }>,
): { link: Array<{ costId: string; lineId: string }>; unlink: string[] } {
  const link: Array<{ costId: string; lineId: string }> = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (!l.cost_id || seen.has(l.cost_id)) continue; // samma kostnad på två rader → första raden gäller
    seen.add(l.cost_id);
    const existing = currentlyLinked.find((c) => c.id === l.cost_id);
    if (!existing || existing.a_order_line_id !== l.id) link.push({ costId: l.cost_id, lineId: l.id });
  }
  const unlink = currentlyLinked.filter((c) => !seen.has(c.id)).map((c) => c.id);
  return { link, unlink };
}

const COST_COLUMNS = 'id, case_id, created_at, description, amount, receipt_url, created_by, category, responsible, a_order_id, a_order_line_id, payout_excluded_at, payout_excluded_by';

/** Obehandlade kostnader på ett ärende (ej på A-order, ej undantagna). */
export async function fetchUnhandledCaseCosts(caseId: string): Promise<PayoutCost[]> {
  const { data, error } = await (supabase as any)
    .from('case_costs')
    .select(COST_COLUMNS)
    .eq('case_id', caseId)
    .is('a_order_id', null)
    .is('payout_excluded_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PayoutCost[];
}

export interface UnhandledSummary { count: number; sum: number }

/** Obehandlade kostnader för alla ärenden, grupperat per case_id — för flaggor i listor. */
export async function fetchUnhandledCostsByCase(): Promise<Map<string, UnhandledSummary>> {
  const { data, error } = await (supabase as any)
    .from('case_costs')
    .select('case_id, amount')
    .is('a_order_id', null)
    .is('payout_excluded_at', null);
  if (error) throw error;
  const m = new Map<string, UnhandledSummary>();
  for (const r of (data ?? []) as Array<{ case_id: string; amount: number }>) {
    const prev = m.get(r.case_id) ?? { count: 0, sum: 0 };
    m.set(r.case_id, { count: prev.count + 1, sum: prev.sum + (Number(r.amount) || 0) });
  }
  return m;
}

/**
 * Synkar kostnadskopplingarna för en sparad order utifrån dess rader.
 * Körs efter att line_items skrivits. Returnerar antal kopplade/isärkopplade.
 */
export async function syncCostLinksForOrder(orderId: string, lines: AOrderLine[]): Promise<{ linked: number; unlinked: number }> {
  const { data, error } = await (supabase as any)
    .from('case_costs')
    .select('id, a_order_line_id')
    .eq('a_order_id', orderId);
  if (error) throw error;
  const plan = planCostLinkSync(lines, (data ?? []) as Array<{ id: string; a_order_line_id: string | null }>);
  for (const { costId, lineId } of plan.link) {
    const { error: e } = await (supabase as any)
      .from('case_costs')
      .update({ a_order_id: orderId, a_order_line_id: lineId, payout_excluded_at: null, payout_excluded_by: null })
      .eq('id', costId);
    if (e) throw e;
  }
  if (plan.unlink.length) {
    const { error: e } = await (supabase as any)
      .from('case_costs')
      .update({ a_order_id: null, a_order_line_id: null })
      .in('id', plan.unlink);
    if (e) throw e;
  }
  return { linked: plan.link.length, unlinked: plan.unlink.length };
}

export async function excludeCostFromPayout(costId: string, by: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('case_costs')
    .update({ payout_excluded_at: new Date().toISOString(), payout_excluded_by: by })
    .eq('id', costId);
  if (error) throw error;
}

export async function restoreCostToPayout(costId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('case_costs')
    .update({ payout_excluded_at: null, payout_excluded_by: null })
    .eq('id', costId);
  if (error) throw error;
}

/** Query-nycklar som ska invalideras när kopplingar ändras. */
export const COST_PAYOUT_QUERY_KEYS = (caseId?: string | null) => [
  ['unhandled_costs_by_case'],
  ['unhandled_case_costs', caseId ?? null],
  ['case_costs', caseId ?? null],
];
