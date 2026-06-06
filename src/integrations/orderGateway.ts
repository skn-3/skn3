// Gateway-wrapper för n3prenad's orders-tabell.
// n3prenad har RLS aktiverat på orders → direkt anon-access ger 0 rader.
// All access går via CaseFlow edge function 'orders-proxy' som håller den delade
// secreten server-side och vidarebefordrar till n3prenads orders-gateway.

import { supabase } from '@/integrations/supabase/client';

type Action =
  | 'list_unlinked'
  | 'get_by_case_id'
  | 'list_by_case_ids'
  | 'update_date'
  | 'link_case'
  | 'unlink_case'
  | 'search'
  | 'list'
  | 'insert'
  | 'update'
  | 'check_duplicate';

async function callGateway<T = any>(action: Action, params: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke('orders-proxy', {
      body: { action, ...params },
    });
    if (error) {
      console.error(`[orderGateway] ${action} failed:`, error);
      return null;
    }
    return data as T;
  } catch (err) {
    console.error(`[orderGateway] ${action} threw:`, err);
    return null;
  }
}

export type OrderLineItem = {
  id?: string | number;
  name?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  amount?: number | null;
  [key: string]: unknown;
};

export type OrderRow = {
  id: string;
  order_number?: number | string | null;
  invoice_number?: string | null;
  customer_address?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  total_amount?: number | null;
  status?: string | null;
  date?: string | null;
  created_at?: string | null;
  case_id?: string | null;
  line_items?: OrderLineItem[] | null;
  // klient-flaggor:
  _orphan?: boolean;
  _orphanCaseId?: string | null;
};

function unwrap(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  if (res && Array.isArray(res.orders)) return res.orders;
  return [];
}

function unwrapSingle(res: any): any | null {
  if (!res) return null;
  if (Array.isArray(res)) return res[0] ?? null;
  if (res.data !== undefined) {
    return Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
  }
  if (res.order) return res.order;
  return res;
}

/** Hämta okopplade ordrar + orphans (case_id pekar på ärende som inte finns). */
export async function listUnlinkedOrders(knownCaseIds: string[]): Promise<OrderRow[]> {
  const res = await callGateway('list_unlinked', { known_case_ids: knownCaseIds });
  return unwrap(res).map((o: any) => ({
    ...o,
    _orphan: o._orphan ?? (o.case_id != null && !knownCaseIds.includes(o.case_id)),
    _orphanCaseId: o._orphanCaseId ?? (o.case_id ?? null),
  }));
}

/** Hämta order kopplad till ett specifikt ärende. */
export async function getOrderByCaseId(caseId: string): Promise<OrderRow | null> {
  const res = await callGateway('get_by_case_id', { case_id: caseId });
  return unwrapSingle(res);
}

/** Hämta ordrar för en lista case-id:n. Fallback per-id om gatewayen saknar batch. */
export async function listOrdersByCaseIds(caseIds: string[]): Promise<OrderRow[]> {
  if (caseIds.length === 0) return [];
  const res = await callGateway('list_by_case_ids', { case_ids: caseIds });
  if (res !== null) return unwrap(res);
  // Fallback
  const results: OrderRow[] = [];
  for (const id of caseIds) {
    const o = await getOrderByCaseId(id);
    if (o) results.push(o);
  }
  return results;
}

export async function updateOrderDate(orderId: string, date: string | null): Promise<boolean> {
  const res = await callGateway('update_date', { order_id: orderId, date });
  return res !== null;
}

export async function linkCase(orderId: string, caseId: string): Promise<boolean> {
  const res = await callGateway('link_case', { order_id: orderId, case_id: caseId });
  return res !== null;
}

export async function unlinkCase(orderId: string): Promise<boolean> {
  const res = await callGateway('unlink_case', { order_id: orderId });
  return res !== null;
}

/** Sök ordrar (gateway-side). Returnerar [] vid fel. */
export async function searchOrders(term: string): Promise<OrderRow[]> {
  const res = await callGateway('search', { term });
  return unwrap(res);
}
