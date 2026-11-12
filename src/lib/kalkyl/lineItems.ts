import type { OfferLineItem } from '@/lib/offerCalc';
import type { KalkylData, RotClass } from './types';
import { rowLines, adjustmentLines } from './kalkyl';
import { round2 } from './packaging';

const CLASS_LABEL: Record<RotClass, string> = { arbete: 'arbete', material: 'material', ovrigt: 'övrigt' };
const CLASS_ORDER: RotClass[] = ['arbete', 'material', 'ovrigt'];
const MAX_NAMES = 4;

/**
 * Gör om kalkylen till offertrader som går rakt in i calcOfferTotals.
 * En offertrad per kalkylrad och ROT-klass med belopp, en per gemensam rad och en per justering.
 */
export function toOfferLineItems(data: KalkylData): OfferLineItem[] {
  const roomName = new Map((data.rooms ?? []).map(r => [r.id, r.name]));
  const out: OfferLineItem[] = [];

  for (const row of data.rows ?? []) {
    const lines = rowLines(row);
    const prefix = row.room_id && roomName.get(row.room_id) ? `${roomName.get(row.room_id)} – ${row.title}` : row.title;
    for (const klass of CLASS_ORDER) {
      const ofClass = lines.filter(l => l.rot_class === klass);
      const sum = round2(ofClass.reduce((s, l) => s + (Number(l.amount) || 0), 0));
      if (sum === 0) continue;
      const names = [...new Set(ofClass.filter(l => (Number(l.amount) || 0) !== 0).map(l => l.description))];
      const list = names.slice(0, MAX_NAMES).join(', ') + (names.length > MAX_NAMES ? ' m.fl.' : '');
      out.push({
        id: `${row.id}:${klass}`,
        description: `${prefix}: ${CLASS_LABEL[klass]}${list ? ` (${list})` : ''}`,
        is_labor: klass === 'arbete',
        qty: 1,
        unit: 'st',
        unit_price: sum,
        amount: sum,
      });
    }
  }

  for (const l of data.common ?? []) {
    out.push({
      id: `common:${l.key}`,
      description: l.description,
      is_labor: l.rot_class === 'arbete',
      qty: l.qty,
      unit: l.unit,
      unit_price: l.unit_price ?? 0,
      amount: round2(Number(l.amount) || 0),
    });
  }

  for (const a of adjustmentLines(data)) {
    out.push({
      id: `adj:${a.key.slice(4)}`,
      description: a.description,
      is_labor: a.rot_class === 'arbete',
      qty: 1,
      unit: 'st',
      unit_price: a.amount,
      amount: a.amount,
    });
  }

  return out;
}
