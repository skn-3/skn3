import type { KalkylLine, KalkylSettings, MalningInput, RoomDims } from '../types';
import type { PriceIndex } from '../prices';
import { floorArea, sockelLength, wallArea } from '../geometry';
import { ceilUnits } from '../packaging';
import { priceLine } from '../lines';

export const MALNING_CODES = {
  vagg: { latt: 'malning.arb.vagg-latt', normal: 'malning.arb.vagg-normal', omfattande: 'malning.arb.vagg-omfattande' },
  vaggExtra: 'malning.arb.vagg-extra-strykning',
  vaggfarg: 'malning.mat.vaggfarg',
  tak: 'malning.arb.tak',
  takfarg: 'malning.mat.takfarg',
  forbrukning: 'malning.mat.forbrukning',
  foder: 'malning.arb.foder',
  sockelmalning: 'malning.arb.sockelmalning',
  snickerifarg: 'malning.mat.snickerifarg',
} as const;

/** Ytschabloner för snickerifärg: m² per foder (dörr eller fönster) och m² per meter sockel. */
export const FODER_M2 = 0.6;
export const SOCKEL_M2_PER_M = 0.06;
const TAK_COATS = 2;
const SNICKERI_COATS = 2;

/** Antal strykningar: angivet, annars 3 för mörk väggkulör, annars 2. */
export function wallCoats(input: MalningInput): 2 | 3 {
  if (input.coats === 2 || input.coats === 3) return input.coats;
  return input.kulor_vagg?.dark ? 3 : 2;
}

/** Liter färg uppåtavrundat. Saknas åtgång blir mängden 0 (ingen gissning). */
function litres(area: number, coats: number, coverage: number | null | undefined): number {
  const c = Number(coverage) || 0;
  if (!(c > 0)) return 0;
  return ceilUnits((area * coats) / c);
}

const kulorDetail = (k?: { system: string; code: string; name?: string } | null) =>
  k ? `${k.code}${k.name ? ` ${k.name}` : ''}` : undefined;

export function computeMalning(dims: RoomDims, input: MalningInput, prices: PriceIndex, settings: KalkylSettings): KalkylLine[] {
  const walls = wallArea(dims, settings);
  const floor = floorArea(dims);
  const sockel = sockelLength(dims, settings);
  const openings = Math.max(0, Math.floor(Number(dims.doors) || 0)) + Math.max(0, Math.floor(Number(dims.windows) || 0));
  const coats = wallCoats(input);
  const lines: KalkylLine[] = [];

  lines.push(priceLine('malning.vagg', prices, MALNING_CODES.vagg[input.underarbete] ?? MALNING_CODES.vagg.normal, walls,
    { description: 'Målning väggar', unit: 'm²', rot_class: 'arbete' }));
  if (coats === 3) {
    lines.push(priceLine('malning.vagg_extra', prices, MALNING_CODES.vaggExtra, walls,
      { description: 'Extra strykning väggar', unit: 'm²', rot_class: 'arbete' }));
  }
  lines.push(priceLine('malning.vaggfarg', prices, MALNING_CODES.vaggfarg,
    litres(walls, coats, prices[MALNING_CODES.vaggfarg]?.coverage),
    { description: 'Väggfärg', unit: 'l', rot_class: 'material' }, kulorDetail(input.kulor_vagg)));

  if (input.tak) {
    lines.push(priceLine('malning.tak', prices, MALNING_CODES.tak, floor, { description: 'Målning tak', unit: 'm²', rot_class: 'arbete' }));
    lines.push(priceLine('malning.takfarg', prices, MALNING_CODES.takfarg,
      litres(floor, TAK_COATS, prices[MALNING_CODES.takfarg]?.coverage),
      { description: 'Takfärg', unit: 'l', rot_class: 'material' }, kulorDetail(input.kulor_tak)));
  }

  lines.push(priceLine('malning.forbrukning', prices, MALNING_CODES.forbrukning, 1,
    { description: 'Förbrukningsmaterial', unit: 'fast', rot_class: 'material' }));

  if (input.snickerier) {
    lines.push(priceLine('malning.foder', prices, MALNING_CODES.foder, openings, { description: 'Målning foder', unit: 'st', rot_class: 'arbete' }));
    lines.push(priceLine('malning.sockelmalning', prices, MALNING_CODES.sockelmalning, sockel,
      { description: 'Målning sockel', unit: 'm', rot_class: 'arbete' }));
    const snickeriArea = openings * FODER_M2 + sockel * SOCKEL_M2_PER_M;
    lines.push(priceLine('malning.snickerifarg', prices, MALNING_CODES.snickerifarg,
      litres(snickeriArea, SNICKERI_COATS, prices[MALNING_CODES.snickerifarg]?.coverage),
      { description: 'Snickerifärg', unit: 'l', rot_class: 'material' }, kulorDetail(input.kulor_snickerier)));
  }

  return lines;
}
