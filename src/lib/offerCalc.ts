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
  /** Avdraget utan tak: rot_base × procent */
  rot_uncapped: number;
  /** Kundens avdragsutrymme: personer × tak − redan utnyttjat */
  rot_room: number;
  /** Faktiskt avdrag = min(rot_uncapped, rot_room) */
  rot_amount: number;
  /** true när taket begränsar avdraget */
  rot_capped: boolean;
  total_after_rot: number;
  handpenning: number;
  slutfaktura: number;
}

/** Skatteverkets tak för ROT-avdrag per person och år (kr). Kan ändras per offert i formuläret. */
export const ROT_CAP_PER_PERSON = 50000;

export interface OfferCalcOptions {
  vat_mode: 'vanlig' | 'omvand';
  rot_enabled: boolean;
  rot_percent: number;
  handpenning_percent?: number;
  /** Antal personer med avdragsrätt (ägare av fastigheten). Standard 1. */
  rot_persons?: number | null;
  /** Tak per person och år. Standard ROT_CAP_PER_PERSON. */
  rot_cap_per_person?: number | null;
  /** ROT-avdrag kunden redan utnyttjat i år (kr). Standard 0. */
  rot_used?: number | null;
}

const round = (n: number) => Math.round(n);

/** Avdragsutrymme = personer × tak − redan utnyttjat, aldrig under 0. */
export function rotRoom(opts: Pick<OfferCalcOptions, 'rot_persons' | 'rot_cap_per_person' | 'rot_used'>): number {
  const persons = Math.max(1, Math.floor(Number(opts.rot_persons ?? 1) || 1));
  const cap = Math.max(0, Number(opts.rot_cap_per_person ?? ROT_CAP_PER_PERSON) || 0);
  const used = Math.max(0, Number(opts.rot_used ?? 0) || 0);
  return Math.max(0, persons * cap - used);
}

export function calcOfferTotals(items: OfferLineItem[], opts: OfferCalcOptions): OfferTotals {
  const labor_ex_vat = items.filter(i => i.is_labor).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const total_ex_vat = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const hp = Number(opts.handpenning_percent ?? 25);

  if (opts.vat_mode === 'omvand') {
    const total_after_rot = total_ex_vat;
    const handpenning = round(total_ex_vat * hp / 100); // före ROT (ROT ej tillämpligt vid omvänd moms)
    return {
      labor_ex_vat,
      total_ex_vat,
      total_vat: 0,
      total_incl_vat: total_ex_vat,
      rot_base: 0,
      rot_uncapped: 0,
      rot_room: 0,
      rot_amount: 0,
      rot_capped: false,
      total_after_rot,
      handpenning,
      slutfaktura: total_after_rot - handpenning,
    };
  }

  const total_vat = total_ex_vat * 0.25;
  const total_incl_vat = total_ex_vat + total_vat;
  const rot_base = labor_ex_vat * 1.25;
  const rot_uncapped = opts.rot_enabled ? round(rot_base * (opts.rot_percent / 100)) : 0;
  const rot_room = opts.rot_enabled ? rotRoom(opts) : 0;
  // Skatteverkets tak: avdraget kan aldrig överstiga kundens avdragsutrymme
  const rot_amount = opts.rot_enabled ? Math.min(rot_uncapped, rot_room) : 0;
  const rot_capped = opts.rot_enabled && rot_uncapped > rot_room;
  const total_after_rot = total_incl_vat - rot_amount;
  // Handpenning beräknas på ordersumman FÖRE ROT-avdrag — hela ROT-avdraget dras på slutfakturan.
  const handpenning = round(total_incl_vat * hp / 100);

  return {
    labor_ex_vat,
    total_ex_vat,
    total_vat,
    total_incl_vat,
    rot_base,
    rot_uncapped,
    rot_room,
    rot_amount,
    rot_capped,
    total_after_rot,
    handpenning,
    slutfaktura: total_after_rot - handpenning,
  };
}

export const fmtKr = (n: number | null | undefined) =>
  (Number(n ?? 0)).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) + ' kr';

export const fmtKr2 = (n: number | null | undefined) =>
  (Number(n ?? 0)).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr';
