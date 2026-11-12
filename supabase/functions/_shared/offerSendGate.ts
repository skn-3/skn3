// Serverspärr för offerter med kalkyl (calc_data). Ren funktion utan Deno-importer så att den kan testas.
// Samma grundregel som skicka-spärren i webbläsaren: inga rader utan pris och bara godkända priser från prislistan.
// Receptet räknas inte om här; raderna läses som de är sparade, med säljarens ändringar ovanpå.

interface GateLine { key?: string; code?: string | null; unit_price?: number | null; price_status?: string | null; description?: string }
interface GateOverride { unit_price?: number | null; removed?: boolean }
interface GateRow { lines?: GateLine[]; overrides?: Record<string, GateOverride> | null }
interface GateCalc { rows?: GateRow[]; common?: GateLine[] }

export interface OfferSendGateResult { ok: boolean; missing: number; not_approved: string[]; error: string | null }

const isNum = (v: unknown) => v != null && v !== '' && Number.isFinite(Number(v));

/** Raderna som skickas: removed hoppas över, ett ändrat à-pris gäller före det sparade. */
export function effectiveCalcLines(calc: unknown): GateLine[] {
  if (!calc || typeof calc !== 'object') return [];
  const c = calc as GateCalc;
  const out: GateLine[] = [];
  for (const row of Array.isArray(c.rows) ? c.rows : []) {
    const ov = (row?.overrides ?? {}) as Record<string, GateOverride>;
    for (const l of Array.isArray(row?.lines) ? row.lines : []) {
      const o = l?.key ? ov[l.key] : undefined;
      if (o?.removed) continue;
      out.push(isNum(o?.unit_price) ? { ...l, unit_price: Number(o!.unit_price) } : l);
    }
  }
  for (const l of Array.isArray(c.common) ? c.common : []) out.push(l);
  return out;
}

/** Prislistekoderna i kalkylen, för att slå upp aktuell status. */
export function calcPriceCodes(calc: unknown): string[] {
  return [...new Set(effectiveCalcLines(calc).map(l => l.code).filter((c): c is string => typeof c === 'string' && c.length > 0))];
}

/**
 * statusByCode: status i price_items för koderna som finns kvar. Saknas koden används radens sparade price_status.
 * Status null räknas inte som ej godkänd (samma som i webbläsaren).
 */
export function checkOfferSendGate(calc: unknown, statusByCode: Record<string, string | null | undefined>): OfferSendGateResult {
  if (!calc || typeof calc !== 'object') return { ok: true, missing: 0, not_approved: [], error: null };
  const lines = effectiveCalcLines(calc);
  const missing = lines.filter(l => !isNum(l.unit_price)).length;
  const notApproved = new Set<string>();
  for (const l of lines) {
    if (!l.code) continue;
    const status = Object.prototype.hasOwnProperty.call(statusByCode, l.code) ? statusByCode[l.code] : l.price_status;
    if (status != null && status !== 'godkand') notApproved.add(l.code);
  }
  const parts: string[] = [];
  if (missing) parts.push(`${missing} ${missing === 1 ? 'rad saknar' : 'rader saknar'} pris`);
  if (notApproved.size) parts.push(`${notApproved.size} ${notApproved.size === 1 ? 'pris är inte godkänt' : 'priser är inte godkända'} i prislistan`);
  const ok = parts.length === 0;
  return {
    ok,
    missing,
    not_approved: [...notApproved],
    error: ok ? null : `Offerten kan inte skickas: ${parts.join(' och ')}. Öppna kalkylen och rätta innan du skickar.`,
  };
}
