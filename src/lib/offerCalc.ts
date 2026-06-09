// Offer line item & totals shared types and calc helpers
export interface OfferLineItem {
  id: string;
  description: string;
  is_labor: boolean;
  qty: number;
  unit: string;
  unit_price: number;
  amount: number;
}

export interface OfferTotals {
  labor_ex_vat: number;
  total_ex_vat: number;
  total_vat: number;
  total_incl_vat: number;
  rot_base: number;
  rot_amount: number;
  total_after_rot: number;
  handpenning: number;
  slutfaktura: number;
}

const round = (n: number) => Math.round(n);

export function calcOfferTotals(
  items: OfferLineItem[],
  opts: { vat_mode: 'vanlig' | 'omvand'; rot_enabled: boolean; rot_percent: number; handpenning_percent?: number }
): OfferTotals {
  const labor_ex_vat = items.filter(i => i.is_labor).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const total_ex_vat = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const hp = Number(opts.handpenning_percent ?? 25);

  if (opts.vat_mode === 'omvand') {
    const total_after_rot = total_ex_vat;
    const handpenning = round(total_after_rot * hp / 100);
    return {
      labor_ex_vat,
      total_ex_vat,
      total_vat: 0,
      total_incl_vat: total_ex_vat,
      rot_base: 0,
      rot_amount: 0,
      total_after_rot,
      handpenning,
      slutfaktura: total_after_rot - handpenning,
    };
  }

  const total_vat = total_ex_vat * 0.25;
  const total_incl_vat = total_ex_vat + total_vat;
  const rot_base = labor_ex_vat * 1.25;
  const rot_amount = opts.rot_enabled ? round(rot_base * (opts.rot_percent / 100)) : 0;
  const total_after_rot = total_incl_vat - rot_amount;
  const handpenning = round(total_after_rot * hp / 100);

  return {
    labor_ex_vat,
    total_ex_vat,
    total_vat,
    total_incl_vat,
    rot_base,
    rot_amount,
    total_after_rot,
    handpenning,
    slutfaktura: total_after_rot - handpenning,
  };
}

export const fmtKr = (n: number | null | undefined) =>
  (Number(n ?? 0)).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) + ' kr';

export const fmtKr2 = (n: number | null | undefined) =>
  (Number(n ?? 0)).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr';
