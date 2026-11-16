import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AOrderLike, DebitLike, SettlementItemLike } from '@/lib/montorSettlement';

const db = supabase as any;
const A_COLS = 'id, team_id, status, total_amount, paid_at, invoice_number, invoice_sent_at, date, credited_from_order_id, customer_address, order_kind, order_number';
const D_COLS = 'id, team_id, kind, status, total, subtotal, vat_mode, paid_at, invoice_number, date, created_at, credited_from_invoice_id, settle_mode, title, description, debit_type, related_a_order_id, related_order:a_orders!related_a_order_id(invoice_number, order_number, order_kind, customer_address)';

export interface SettlementTeam { id: string; name: string; company_name: string | null; bankgiro: string | null; email: string | null; invoice_email: string | null; is_active: boolean }

/** Underlag för Utbetala till montör: fakturor, montörsfakturor, aktiva specifikationsrader och team. Bara personal. */
export function useMontorSettlementData(enabled = true) {
  return useQuery({
    queryKey: ['montor_settlement_data'],
    enabled,
    queryFn: async () => {
      const [a, d, i, t] = await Promise.all([
        db.from('a_orders').select(A_COLS).in('status', ['invoiced', 'credited']),
        db.from('montor_debit_invoices').select(D_COLS),
        db.from('montor_settlement_items').select('item_kind, a_order_id, debit_invoice_id, amount, active, settlement_id, montor_settlements(settlement_number, status)').eq('active', true),
        db.from('montor_teams').select('id, name, company_name, bankgiro, email, invoice_email, is_active').order('name'),
      ]);
      for (const r of [a, d, i, t]) if (r.error) throw r.error;
      const items: SettlementItemLike[] = (i.data ?? []).map((x: any) => ({
        ...x, settlement_number: x.montor_settlements?.settlement_number ?? null, settlement_status: x.montor_settlements?.status ?? null,
      }));
      return { aOrders: (a.data ?? []) as AOrderLike[], debits: (d.data ?? []) as DebitLike[], items, teams: (t.data ?? []) as SettlementTeam[] };
    },
  });
}

export function useMontorSettlementList(enabled = true) {
  return useQuery({
    queryKey: ['montor_settlements'],
    enabled,
    queryFn: async () => {
      const { data, error } = await db.from('montor_settlements')
        .select('*, montor_teams(name), montor_settlement_items(id, item_kind, amount)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Aktiva specifikationer per dokument (A-order eller montörsfaktura) för "Ingår i UTB-xxx". */
export function useActiveSettlementItems(enabled = true) {
  return useQuery({
    queryKey: ['montor_settlement_data', 'active-items'],
    enabled,
    queryFn: async () => {
      const { data, error } = await db.from('montor_settlement_items')
        .select('item_kind, a_order_id, debit_invoice_id, amount, active, settlement_id, montor_settlements(settlement_number, status)').eq('active', true);
      if (error) throw error;
      return (data ?? []).map((x: any) => ({ ...x, settlement_number: x.montor_settlements?.settlement_number ?? null, settlement_status: x.montor_settlements?.status ?? null })) as SettlementItemLike[];
    },
  });
}
