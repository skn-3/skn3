// Orderdata för pipeline/besök/länkning.
// FAS 4 (juli 2026): läser LOKALA a_orders. Gamla n3prenad-databasen
// nås inte längre av systemet — den ligger kvar externt som passivt arkiv.

import { supabase } from '@/integrations/supabase/client';

export type OrderLineItem = {
  id?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  total?: number;
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
  windows_count?: number | null;
  doors_count?: number | null;
  // klient-flaggor:
  _orphan?: boolean;
  _orphanCaseId?: string | null;
};

const COLS =
  'id, order_number, invoice_number, customer_address, customer_name, customer_phone, total_amount, status, date, created_at, case_id, line_items, window_count, door_count';

function toRow(o: any): OrderRow {
  return {
    id: o.id,
    order_number: o.order_number ?? null,
    invoice_number: o.invoice_number ?? null,
    customer_address: o.customer_address ?? null,
    customer_name: o.customer_name ?? null,
    customer_phone: o.customer_phone ?? null,
    total_amount: o.total_amount ?? null,
    status: o.status ?? null,
    date: o.date ?? null,
    created_at: o.created_at ?? null,
    case_id: o.case_id ?? null,
    line_items: (o.line_items as OrderLineItem[] | null) ?? null,
    windows_count: o.window_count ?? null,
    doors_count: o.door_count ?? null,
  };
}

/** Olänkade ordrar (case_id saknas) + föräldralösa (case_id pekar på ärende som inte finns). */
export async function listUnlinkedOrders(knownCaseIds: string[]): Promise<OrderRow[]> {
  const { data, error } = await (supabase as any)
    .from('a_orders')
    .select(COLS)
    .order('date', { ascending: false });
  if (error) {
    console.error('[orderGateway] listUnlinkedOrders failed:', error);
    return [];
  }
  const known = new Set(knownCaseIds);
  return (data ?? [])
    .filter((o: any) => o.case_id == null || !known.has(o.case_id))
    .map((o: any) => ({
      ...toRow(o),
      _orphan: o.case_id != null && !known.has(o.case_id),
      _orphanCaseId: o.case_id ?? null,
    }));
}

/** Hämta order kopplad till ett specifikt ärende. */
export async function getOrderByCaseId(caseId: string): Promise<OrderRow | null> {
  const { data, error } = await (supabase as any)
    .from('a_orders')
    .select(COLS)
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[orderGateway] getOrderByCaseId failed:', error);
    return null;
  }
  return data ? toRow(data) : null;
}

/** Hämta ordrar för en lista case-id:n. */
export async function listOrdersByCaseIds(caseIds: string[]): Promise<OrderRow[]> {
  if (caseIds.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from('a_orders')
    .select(COLS)
    .in('case_id', caseIds);
  if (error) {
    console.error('[orderGateway] listOrdersByCaseIds failed:', error);
    return [];
  }
  return (data ?? []).map(toRow);
}

export async function updateOrderDate(orderId: string, date: string | null): Promise<boolean> {
  const { error } = await (supabase as any).from('a_orders').update({ date }).eq('id', orderId);
  if (error) console.error('[orderGateway] updateOrderDate failed:', error);
  return !error;
}

export async function linkCase(orderId: string, caseId: string): Promise<boolean> {
  const { error } = await (supabase as any).from('a_orders').update({ case_id: caseId }).eq('id', orderId);
  if (error) console.error('[orderGateway] linkCase failed:', error);
  return !error;
}

export async function unlinkCase(orderId: string): Promise<boolean> {
  const { error } = await (supabase as any).from('a_orders').update({ case_id: null }).eq('id', orderId);
  if (error) console.error('[orderGateway] unlinkCase failed:', error);
  return !error;
}

/** Sök ordrar på adress eller kundnamn (lokala a_orders). */
export async function searchOrders(term: string): Promise<OrderRow[]> {
  const t = term.trim();
  if (!t) return [];
  const { data, error } = await (supabase as any)
    .from('a_orders')
    .select(COLS)
    .or(`customer_address.ilike.%${t}%,customer_name.ilike.%${t}%`)
    .order('date', { ascending: false })
    .limit(10);
  if (error) {
    console.error('[orderGateway] searchOrders failed:', error);
    return [];
  }
  return (data ?? []).map(toRow);
}

/** ENDA kvarvarande proxy-funktionen: hämtar ALLA ordrar från gamla n3prenad
 *  (arkivet) för engångsimporten i N3prenadImportView. Tas bort i FAS 4 steg 2. */
export async function listAllOrders(): Promise<any[]> {
  const pageSize = 500;
  let offset = 0;
  const all: any[] = [];
  for (let i = 0; i < 200; i++) {
    const { data, error } = await supabase.functions.invoke('orders-proxy', {
      body: { action: 'list', limit: pageSize, offset },
    });
    if (error) {
      console.error('[orderGateway] listAllOrders failed:', error);
      break;
    }
    const batch = Array.isArray(data) ? data : (data && Array.isArray((data as any).data) ? (data as any).data : []);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += batch.length;
  }
  return all;
}
