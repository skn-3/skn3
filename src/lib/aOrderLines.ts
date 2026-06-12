// Auto-generation of A-order line items based on case parameters.
// Per-facade pricing follows the production catalogue.

export type FacadeType = 'tra' | 'sten' | 'puts';

export interface AOrderLine {
  id: string;
  name: string;
  unit_price: number;
  qty: number;
  amount: number;
}

export interface AutoLineInput {
  windowCount: number;
  doorCount: number;
  roofWindowCount: number;
  facadeType: FacadeType;
  kmDistance: number;
}

function makeId() {
  return 'al_' + Math.random().toString(36).slice(2, 10);
}

function r(n: number) {
  return Math.round(n);
}

function line(name: string, price: number, qty: number): AOrderLine {
  return { id: makeId(), name, unit_price: price, qty, amount: r(price * qty) };
}

const WINDOW_PRICE: Record<FacadeType, number> = { tra: 352, sten: 624, puts: 352 };
// Dörr inkl ädelträlist
const DOOR_PRICE: Record<FacadeType, number> = { tra: 764.8, sten: 1078.8, puts: 764.8 };
const RIVNING_PRICE: Record<FacadeType, number> = { tra: 154.8, sten: 154.8, puts: 186.7 };
const BLECK_PRICE: Record<FacadeType, number> = { tra: 79.8, sten: 131.8, puts: 131.8 };

export function generateAutoLines(input: AutoLineInput): AOrderLine[] {
  const { windowCount, doorCount, roofWindowCount, facadeType, kmDistance } = input;
  const totalUnits = (windowCount || 0) + (doorCount || 0) + (roofWindowCount || 0);
  const kmRT = (kmDistance || 0) * 2;
  const lines: AOrderLine[] = [];

  if (kmRT > 0) lines.push(line('Etablering Bilersättning', 6.63, kmRT));
  if (kmRT > 0) lines.push(line('Etablering restid', 11.73, kmRT));
  lines.push(line('Etablering Grundpris', 703, 1));

  if (windowCount > 0) lines.push(line('Montering Fönster', WINDOW_PRICE[facadeType], windowCount));
  if (doorCount > 0) lines.push(line('Montering Dörr (+Ädelträlist)', DOOR_PRICE[facadeType], doorCount));
  if (roofWindowCount > 0) lines.push(line('Montering Takfönster inkl plåt & inv. smyg', 6803.4, roofWindowCount));

  if (totalUnits > 0) {
    lines.push(line('Byggavfall per enhet återvinning', 40.8, totalUnits));
    lines.push(line('Ersättning Infästnings material', 40.8, totalUnits));
    lines.push(line(facadeType === 'puts' ? 'Rivning putsfasad' : 'Rivning dörr/fönster', RIVNING_PRICE[facadeType], totalUnits));
    lines.push(line(facadeType === 'tra' ? 'Montering Bleck Trähus' : 'Montering Bleck Puts/Stenhus', BLECK_PRICE[facadeType], totalUnits));
  }

  return lines.filter(l => l.qty > 0);
}

export function sumLines(lines: AOrderLine[]): number {
  return lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

export const FACADE_LABEL: Record<FacadeType, string> = {
  tra: 'Trä',
  sten: 'Sten/Betong',
  puts: 'Puts',
};
