// Serviceorder: bantad A-order (order_kind 'service') för små montörsjobb.

export type ServicePayer = 'mockfjards' | 'n3prenad' | 'kund';

export const PAYER_LABEL: Record<ServicePayer, string> = {
  mockfjards: 'Mockfjärds',
  n3prenad: 'N3prenad',
  kund: 'Kund',
};

export const ORDER_KIND_LABEL: Record<string, string> = {
  standard: 'Montage',
  komplettering: 'Komplettering',
  service: 'Service',
};

export interface ParsedMockfjardsInvoice {
  invoice_number: string | null;
  invoice_date: string | null;
  sales_order_number: string | null;
  customer_name: string | null;
  team_prefix: string | null;
  total_amount?: number | null;
  line_items: Array<{ name: string; unit_price: number; qty: number; amount: number }>;
}

export interface ServiceOrderPrefill {
  line_items: Array<{ name: string; unit_price: number; qty: number; amount: number }>;
  customer_name: string | null;
  date: string | null;
  mockfjards_invoice_number: string | null;
  mockfjards_order_number: string | null;
  payer: ServicePayer;
  team_id: string | null;
  description_line: string;
}

/** Bygger prefill för en serviceorder ur en avläst Mockfjärds-faktura. */
export function serviceOrderPrefillFromInvoice(
  parsed: ParsedMockfjardsInvoice,
  teams: Array<{ id: string; invoice_prefix?: string | null }>,
): ServiceOrderPrefill {
  const prefix = (parsed.team_prefix || '').trim().toLowerCase();
  const team = prefix ? teams.find(t => (t.invoice_prefix || '').trim().toLowerCase() === prefix) : undefined;
  return {
    line_items: (parsed.line_items || []).map(l => ({
      name: String(l.name ?? ''),
      unit_price: Number(l.unit_price) || 0,
      qty: Number(l.qty) || 0,
      amount: Number(l.amount) || 0,
    })),
    customer_name: parsed.customer_name || null,
    date: parsed.invoice_date || null,
    mockfjards_invoice_number: parsed.invoice_number || null,
    mockfjards_order_number: parsed.sales_order_number || null,
    payer: 'mockfjards',
    team_id: team?.id ?? null,
    description_line: `Enligt Mockfjärds faktura ${parsed.invoice_number || '—'}`,
  };
}
