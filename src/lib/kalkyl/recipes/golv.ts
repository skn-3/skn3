import type { GolvInput, KalkylLine, KalkylSettings, RoomDims } from '../types';
import type { PriceIndex } from '../prices';
import { floorArea, sockelLength } from '../geometry';
import { packsNeeded, round2, withWaste } from '../packaging';
import { fmtQty, packLabel, priceLine } from '../lines';
import { resolveSlotCode, SLOT_DEFAULT_CODES } from '../slots';

/** Fasta koder i golvreceptet. underlag, sockel och tröskel är bara standardval – se resolveSlotCode. */
export const GOLV_CODES = {
  underlag: SLOT_DEFAULT_CODES['golv.underlag'],
  sockel: SLOT_DEFAULT_CODES['golv.sockel'],
  sockelMontering: 'golv.arb.sockel-montering',
  troskel: SLOT_DEFAULT_CODES['golv.troskel'],
  troskelMontering: 'golv.arb.troskel-montering',
  rivning: 'golv.arb.rivning',
  flytspackel: 'golv.mat.flytspackel',
  flytspackling: 'golv.arb.flytspackling',
  mobelflytt: 'gem.ovr.mobelflytt',
  bortforsling: 'gem.ovr.bortforsling',
} as const;

/** Behov med spill i hela förpackningar. Utan förpackningsstorlek: behovet avrundat till 2 decimaler. */
function packed(need: number, packSize: number | null | undefined, label: string | null | undefined, unit: string) {
  const size = Number(packSize) || 0;
  if (size > 0) {
    const count = packsNeeded(need, size);
    const qty = round2(count * size);
    return { qty, detail: `${count} ${packLabel(label, count)} (${fmtQty(qty)} ${unit})` };
  }
  return { qty: round2(need), detail: undefined as string | undefined };
}

export function computeGolv(dims: RoomDims, input: GolvInput, prices: PriceIndex, settings: KalkylSettings): KalkylLine[] {
  const area = floorArea(dims);
  const sockel = sockelLength(dims, settings);
  const doors = Math.max(0, Math.floor(Number(dims.doors) || 0));
  const lines: KalkylLine[] = [];

  const mat = prices[input.material_code];
  const matNeed = withWaste(area, mat?.waste_pct ?? 0);
  const m = packed(matNeed, mat?.pack_size, mat?.pack_label, mat?.unit ?? 'm²');
  lines.push(priceLine('golv.material', prices, input.material_code || null, m.qty,
    { description: 'Golvmaterial', unit: 'm²', rot_class: 'material' }, m.detail));

  const layCode = typeof mat?.meta?.lay_code === 'string' ? (mat.meta.lay_code as string) : null;
  lines.push(priceLine('golv.laggning', prices, layCode, area, { description: 'Läggning golv', unit: 'm²', rot_class: 'arbete' }));

  if (input.underlag) {
    const code = resolveSlotCode('golv.underlag', input.selections, prices);
    const it = prices[code];
    const u = packed(withWaste(area, it?.waste_pct ?? 0), it?.pack_size, it?.pack_label, it?.unit ?? 'm²');
    lines.push(priceLine('golv.underlag', prices, code, u.qty,
      { description: 'Underlag', unit: 'm²', rot_class: 'material' }, u.detail));
  }

  if (input.sockel) {
    const code = resolveSlotCode('golv.sockel', input.selections, prices);
    const it = prices[code];
    const s = packed(withWaste(sockel, it?.waste_pct ?? 0), it?.pack_size, it?.pack_label, it?.unit ?? 'm');
    lines.push(priceLine('golv.sockel', prices, code, s.qty,
      { description: 'Sockellist', unit: 'm', rot_class: 'material' }, s.detail));
    lines.push(priceLine('golv.sockel_montering', prices, GOLV_CODES.sockelMontering, sockel,
      { description: 'Montering sockellist', unit: 'm', rot_class: 'arbete' }));
  }

  if (input.troskel) {
    lines.push(priceLine('golv.troskel', prices, resolveSlotCode('golv.troskel', input.selections, prices), doors, { description: 'Tröskel', unit: 'st', rot_class: 'material' }));
    lines.push(priceLine('golv.troskel_montering', prices, GOLV_CODES.troskelMontering, doors,
      { description: 'Montering tröskel', unit: 'st', rot_class: 'arbete' }));
  }

  if (input.rivning) {
    lines.push(priceLine('golv.rivning', prices, GOLV_CODES.rivning, area, { description: 'Rivning befintligt golv', unit: 'm²', rot_class: 'arbete' }));
  }

  if (input.flytspackling) {
    lines.push(priceLine('golv.flytspackel', prices, GOLV_CODES.flytspackel, area, { description: 'Flytspackel', unit: 'm²', rot_class: 'material' }));
    lines.push(priceLine('golv.flytspackling', prices, GOLV_CODES.flytspackling, area, { description: 'Flytspackling', unit: 'm²', rot_class: 'arbete' }));
  }

  if (input.mobelflytt) {
    lines.push(priceLine('golv.mobelflytt', prices, GOLV_CODES.mobelflytt, 1, { description: 'Möbelflytt', unit: 'fast', rot_class: 'ovrigt' }));
  }
  if (input.bortforsling) {
    lines.push(priceLine('golv.bortforsling', prices, GOLV_CODES.bortforsling, 1, { description: 'Bortforsling', unit: 'fast', rot_class: 'ovrigt' }));
  }

  return lines;
}
