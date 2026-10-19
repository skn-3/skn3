import { HOUR_RATE } from '@/lib/constants';

export type PayoutLineItem = {
  order_number: string | null;
  customer_name?: string | null;
  name: string | null;
  note: string | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
};

export const isKm = (line: PayoutLineItem) =>
  `${line.name ?? ''} ${line.note ?? ''}`.toLowerCase().includes('kontrollmätning');

/** KM behåller sitt befintliga urval; alla andra rader kräver aktivt godkännande. */
export function groupPayoutLines(items: PayoutLineItem[]) {
  const groups = new Map<string, { kind: 'km' | 'extra'; included: boolean; order_number: string; lines: PayoutLineItem[] }>();
  for (const line of items) {
    const kind = isKm(line) ? 'km' : 'extra';
    const order_number = (line.order_number ?? '').trim() || '—';
    const key = `${kind}|${order_number}`;
    let group = groups.get(key);
    if (!group) {
      group = { kind, included: kind === 'km', order_number, lines: [] };
      groups.set(key, group);
    }
    group.lines.push(line);
  }
  return [...groups.values()];
}

export interface PayoutFinancialRow {
  kind: 'km' | 'extra';
  included: boolean;
  teamId: string | null;
  invoice_number: string;
  order_number: string;
  customer_name: string;
  kmQty: number | null;
  bilRate: number;
  restidRate: number;
  grundavgift: number;
  enheterQty: number;
  enheterRate: number;
  lines: PayoutLineItem[];
}

export function selectedPayoutRows<T extends Pick<PayoutFinancialRow, 'kind' | 'included'>>(rows: T[]): T[] {
  return rows.filter(row => row.kind === 'km' || row.included);
}

export function payoutRowTotal(row: PayoutFinancialRow) {
  if (row.kind === 'extra') return row.lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  return Math.round((row.kmQty ?? 0) * (row.bilRate + row.restidRate) + row.grundavgift + row.enheterQty * row.enheterRate);
}

export function payoutRowWithHour(row: PayoutFinancialRow) {
  return payoutRowTotal(row) + (row.kind === 'km' ? HOUR_RATE : 0);
}

export function payoutInvoiceTitle(rows: Pick<PayoutFinancialRow, 'kind'>[]) {
  const km = rows.some(row => row.kind === 'km');
  const extra = rows.some(row => row.kind === 'extra');
  return km && extra ? 'Kontrollmätningar & extra arbeten' : km ? 'Kontrollmätningar' : 'Extra arbeten';
}

const extraDescription = (row: PayoutFinancialRow, names: string) =>
  `Extra arbete — ${names}, ${row.customer_name || 'Okänd kund'} (fsg.order ${row.order_number})`;
const lineName = (line: PayoutLineItem) => line.name || line.note || 'Extra arbete';

/** En plan per team, med detaljer som ensam beloppskälla för fakturamotor och PDF. */
export function planPayoutInvoices(rows: PayoutFinancialRow[]) {
  const byTeam = new Map<string, PayoutFinancialRow[]>();
  for (const row of selectedPayoutRows(rows)) {
    if (!row.teamId) continue;
    const group = byTeam.get(row.teamId) ?? [];
    group.push(row);
    byTeam.set(row.teamId, group);
  }
  return [...byTeam].map(([teamId, teamRows]) => {
    const lines = teamRows.map(row => ({
      name: row.kind === 'km'
        ? `Kontrollmätning — ${row.customer_name || 'Okänd kund'} (${row.kmQty ?? '—'} km, ${row.enheterQty} enh)`
        : extraDescription(row, row.lines.map(lineName).join(', ')),
      amount: payoutRowTotal(row),
    }));
    const detailedLines = teamRows.flatMap((row, index) => row.kind === 'km'
      ? [{ description: lines[index].name, qty: 1, unit: 'st', unit_price: payoutRowTotal(row), amount: payoutRowTotal(row) }]
      : row.lines.map(line => ({ description: extraDescription(row, lineName(line)), qty: 1, unit: 'st', unit_price: Number(line.amount) || 0, amount: Number(line.amount) || 0 })));
    const kmCount = teamRows.filter(row => row.kind === 'km').length;
    if (kmCount > 0) detailedLines.push({ description: 'Arbetstid kontrollmätning (1 tim per mätning)', qty: kmCount, unit: 'tim', unit_price: HOUR_RATE, amount: kmCount * HOUR_RATE });
    return {
      teamId,
      title: payoutInvoiceTitle(teamRows),
      description: `Avser Mockfjärds faktura ${[...new Set(teamRows.map(row => row.invoice_number).filter(Boolean))].join(', ')}`,
      lines,
      detailedLines,
      total: detailedLines.reduce((sum, line) => sum + line.amount, 0),
    };
  });
}