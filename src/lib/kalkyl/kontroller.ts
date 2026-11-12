import type { GolvInput, KalkylData, KalkylLine, KalkylSettings, MalningInput } from './types';
import type { PriceIndex } from './prices';
import { isStale, priceAgeDays } from './prices';
import { rowLines, summarizeKalkyl } from './kalkyl';
import { wallCoats } from './recipes/malning';

export type KontrollLevel = 'atgard' | 'info' | 'ok';

export interface Kontroll {
  id: string;
  level: KontrollLevel;
  blocking: boolean;
  row_id?: string;
  title: string;
  text: string;
  source: string;
}

const MANUAL_DEVIATION = 0.15;
const ROT_NEW_BUILD_YEARS = 5;

const names = (lines: KalkylLine[]) => [...new Set(lines.map(l => l.description))].join(', ');
const toDate = (v: Date | string) => (typeof v === 'string' ? new Date(v.length === 10 ? `${v}T00:00:00Z` : v) : v);

/** Version 1 av kontrollerna. Blockerande kontroller stoppar att offerten skickas. */
export function runKontroller(data: KalkylData, prices: PriceIndex, settings: KalkylSettings, today: Date | string): Kontroll[] {
  const out: Kontroll[] = [];
  const groups: { row_id?: string; label: string; lines: KalkylLine[] }[] = [
    ...(data.rows ?? []).map(r => ({ row_id: r.id, label: r.title, lines: rowLines(r) })),
    { row_id: undefined, label: 'Gemensamt', lines: data.common ?? [] },
  ];
  const scope = (row_id?: string) => row_id ?? 'gemensamt';

  for (const g of groups) {
    const missing = g.lines.filter(l => l.unit_price == null);
    if (missing.length) out.push({
      id: `pris_saknas:${scope(g.row_id)}`, level: 'atgard', blocking: true, row_id: g.row_id,
      title: 'Pris saknas', text: `${g.label}: ${names(missing)} saknar pris i prislistan. Lägg in priset innan offerten skickas.`, source: 'Prislistan',
    });

    const notApproved = g.lines.filter(l => {
      if (!l.code) return false;
      const status = prices[l.code]?.status ?? l.price_status ?? null;
      return status != null && status !== 'godkand';
    });
    if (notApproved.length) out.push({
      id: `pris_ej_godkant:${scope(g.row_id)}`, level: 'atgard', blocking: true, row_id: g.row_id,
      title: 'Pris inte godkänt', text: `${g.label}: ${names(notApproved)} har ett pris som inte är godkänt i prislistan.`, source: 'Prislistan',
    });

    const stale = g.lines.filter(l => {
      const item = l.code ? prices[l.code] : undefined;
      const date = item?.price_date ?? l.price_date ?? null;
      return date != null && isStale({ price_date: date }, today, settings.price_max_age_days);
    });
    if (stale.length) {
      const ages = stale.map(l => priceAgeDays({ price_date: (l.code ? prices[l.code]?.price_date : null) ?? l.price_date ?? null }, today) ?? 0);
      out.push({
        id: `pris_gammalt:${scope(g.row_id)}`, level: 'atgard', blocking: false, row_id: g.row_id,
        title: 'Gammalt pris', text: `${g.label}: ${names(stale)} har prisdatum äldre än ${settings.price_max_age_days} dagar (upp till ${Math.max(...ages)} dagar).`, source: 'Kalkylinställningar',
      });
    }

    for (const row of (data.rows ?? []).filter(r => r.id === g.row_id)) {
      for (const [key, o] of Object.entries(row.overrides ?? {})) {
        if (o.removed || o.qty == null) continue;
        const base = row.lines.find(l => l.key === key);
        if (!base) continue;
        const dev = base.qty > 0 ? Math.abs(Number(o.qty) - base.qty) / base.qty : Number(o.qty) > 0 ? Infinity : 0;
        if (dev > MANUAL_DEVIATION) out.push({
          id: `mangd_manuell:${row.id}:${key}`, level: 'info', blocking: false, row_id: row.id,
          title: 'Manuell mängd', text: `${row.title}: ${base.description} är ändrad till ${o.qty} ${base.unit} (beräknat ${base.qty} ${base.unit}).`, source: 'Kalkylen',
        });
      }
    }
  }

  for (const row of data.rows ?? []) {
    if (row.trade === 'golv' && row.input) {
      const inp = row.input as GolvInput;
      if (!inp.underlag) out.push({
        id: `golv_underlag_saknas:${row.id}`, level: 'atgard', blocking: false, row_id: row.id,
        title: 'Underlag saknas', text: `${row.title}: flytande golv behöver underlag med ångspärr om det inte redan finns.`, source: 'Regel i kalkylen',
      });
      if (!inp.sockel) out.push({
        id: `golv_sockel_saknas:${row.id}`, level: 'info', blocking: false, row_id: row.id,
        title: 'Ingen sockellist', text: `${row.title}: ingen sockellist är vald. Kontrollera att befintlig sockel ska sitta kvar.`, source: 'Kalkylen',
      });
      if (inp.rivning && !inp.flytspackling) out.push({
        id: `golv_avjamning:${row.id}`, level: 'info', blocking: false, row_id: row.id,
        title: 'Avjämning', text: `${row.title}: rivning är vald men inte flytspackling. Kontrollera att undergolvet är plant.`, source: 'Regel i kalkylen',
      });
    }
    if (row.trade === 'malning' && row.input) {
      const inp = row.input as MalningInput;
      if (inp.kulor_vagg?.dark && wallCoats(inp) < 3) out.push({
        id: `malning_mork_kulor:${row.id}`, level: 'atgard', blocking: false, row_id: row.id,
        title: 'Mörk kulör', text: `${row.title}: ${inp.kulor_vagg.code} är en mörk kulör och brukar behöva 3 strykningar.`, source: 'Regel i kalkylen',
      });
    }
  }

  const by = data.premises?.build_year;
  if (by != null && Number.isFinite(Number(by))) {
    const age = toDate(today).getUTCFullYear() - Number(by);
    if (age <= ROT_NEW_BUILD_YEARS) out.push({
      id: 'rot_femarsregeln', level: 'atgard', blocking: false,
      title: 'ROT och nybyggt hus', text: `Huset är byggt ${by}. ROT-avdrag gäller inte arbete på hus som tagits i bruk de senaste fem åren. Kontrollera innan ROT dras.`, source: 'Skatteverket (ROT)',
    });
  }

  const sum = summarizeKalkyl(data);
  if (sum.total_ex_vat > 0) {
    if (!sum.cost_known) out.push({
      id: 'kostnad_saknas', level: 'info', blocking: false,
      title: 'Kostnad saknas', text: 'Några rader saknar inköpskostnad, så täckningsbidraget kan inte räknas säkert.', source: 'Prislistan',
    });
    else if (sum.tb_pct != null && sum.tb_pct < settings.margin_target_pct) out.push({
      id: 'marginal_under_mal', level: 'atgard', blocking: false,
      title: 'Marginal under mål', text: `Täckningsbidraget är ${sum.tb_pct.toLocaleString('sv-SE')} %, under målet ${settings.margin_target_pct} %.`, source: 'Kalkylinställningar',
    });
    else if (sum.tb_pct != null) out.push({
      id: 'marginal_ok', level: 'ok', blocking: false,
      title: 'Marginal', text: `Täckningsbidraget är ${sum.tb_pct.toLocaleString('sv-SE')} % (mål ${settings.margin_target_pct} %).`, source: 'Kalkylinställningar',
    });
  }

  return out;
}

export function canSend(kontroller: Kontroll[]): boolean {
  return !kontroller.some(k => k.blocking);
}
