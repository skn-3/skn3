import type { GolvInput, KalkylData, KalkylLine, KalkylRow, KalkylSettings, MalningInput, PriceItem, PriceTrade } from './types';
import type { PriceIndex } from './prices';
import { isStale, priceAgeDays } from './prices';
import { rowLines, summarizeKalkyl } from './kalkyl';
import { paintNeeds, wallCoats } from './recipes/malning';
import { linesWithChangedPrice, listPricedCommon, listPricedLines } from './priceCheck';

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

export interface KontrollContext {
  /** Offertens status. Saknad status räknas som utkast. */
  status?: string | null;
  /** ROT på offerten. Bara uttryckligt false stänger av ROT-kontrollen för bostadsrätt. */
  rot_enabled?: boolean | null;
}

/** Grenar med utvändigt arbete som inte ger ROT i bostadsrätt. */
export const BRF_EXTERIOR_TRADES: PriceTrade[] = ['fasad', 'tak', 'altan', 'mark'];

/**
 * Golvraden saknar arbetsrad för läggning: golvmaterialet finns i prislistan men läggningsraden har ingen kod
 * (materialet saknar meta.lay_code). Då ersätter kontrollen laggning_saknas "pris saknas" för läggningsraden.
 */
export function golvLayMissing(row: KalkylRow, prices: PriceIndex): boolean {
  if (row.trade !== 'golv' || !row.input) return false;
  if (!prices[(row.input as GolvInput).material_code]) return false;
  return rowLines(row).some(l => l.key === 'golv.laggning' && !l.code);
}

/** Raderna som saknar pris och flaggas som "pris saknas" (läggningsrad utan arbetskod har en egen kontroll). */
export function missingPriceLines(row: KalkylRow | null, lines: KalkylLine[], prices: PriceIndex): KalkylLine[] {
  const layMissing = row ? golvLayMissing(row, prices) : false;
  return lines.filter(l => l.unit_price == null && !(layMissing && l.key === 'golv.laggning'));
}

/** Alla rader i kalkylen som saknar pris enligt missingPriceLines. */
export function kalkylMissingPriceLines(data: KalkylData, prices: PriceIndex): KalkylLine[] {
  return [
    ...(data.rows ?? []).flatMap(r => missingPriceLines(r, rowLines(r), prices)),
    ...missingPriceLines(null, data.common ?? [], prices),
  ];
}

/**
 * Färgprodukter i en målningsrad som saknar åtgång (m² per liter), för färgrader där ytan är större än 0.
 * Borttagna rader och rader där säljaren själv satt mängden räknas inte. Produkt som saknas helt flaggas av "pris saknas".
 */
export function paintCoverageMissing(row: KalkylRow, data: Pick<KalkylData, 'rooms'>, prices: PriceIndex, settings: KalkylSettings): PriceItem[] {
  if (row.trade !== 'malning' || !row.input) return [];
  const room = row.room_id ? (data.rooms ?? []).find(r => r.id === row.room_id) : undefined;
  if (!room) return [];
  const lines = rowLines(row);
  const out: PriceItem[] = [];
  for (const need of paintNeeds(room.dims, row.input as MalningInput, settings)) {
    if (!(need.area > 0)) continue;
    if (row.overrides?.[need.key]?.qty != null) continue;
    const line = lines.find(l => l.key === need.key);
    const item = line?.code ? prices[line.code] : undefined;
    if (item && !(Number(item.coverage) > 0) && !out.some(i => i.code === item.code)) out.push(item);
  }
  return out;
}

const tradeOf = (l: KalkylLine, prices: PriceIndex): PriceTrade | null => (l.code ? prices[l.code]?.trade ?? null : null);

/** Utkast (även saknad status): allt utom skickad och accepterad. */
export const isDraftStatus = (status: string | null | undefined) => status !== 'sent' && status !== 'accepted';

/** Version 1 av kontrollerna. Blockerande kontroller stoppar att offerten skickas. */
export function runKontroller(data: KalkylData, prices: PriceIndex, settings: KalkylSettings, today: Date | string, ctx?: KontrollContext): Kontroll[] {
  const out: Kontroll[] = [];
  const groups: { row_id?: string; row: KalkylRow | null; label: string; lines: KalkylLine[]; listed: KalkylLine[] }[] = [
    ...(data.rows ?? []).map(r => ({ row_id: r.id, row: r, label: r.title, lines: rowLines(r), listed: listPricedLines(r) })),
    { row_id: undefined, row: null, label: 'Gemensamt', lines: data.common ?? [], listed: listPricedCommon(data) },
  ];
  const scope = (row_id?: string) => row_id ?? 'gemensamt';
  const draft = isDraftStatus(ctx?.status);

  for (const g of groups) {
    const missing = missingPriceLines(g.row, g.lines, prices);
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

    // Det som skickas är prislistans godkända pris eller säljarens eget pris, aldrig ett gammalt listpris.
    const changed = draft ? linesWithChangedPrice(g.listed, prices) : [];
    if (changed.length) out.push({
      id: `pris_andrat:${scope(g.row_id)}`, level: 'atgard', blocking: true, row_id: g.row_id,
      title: 'Priset har ändrats', text: `${g.label}: ${names(changed)} har ett annat pris i prislistan än i kalkylen. Uppdatera priserna innan offerten skickas.`, source: 'Prislistan',
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
    if (golvLayMissing(row, prices)) out.push({
      id: `laggning_saknas:${row.id}`, level: 'atgard', blocking: true, row_id: row.id,
      title: 'Arbetsrad saknas', text: `${row.title}: golvmaterialet saknar arbetsrad för läggning. Välj arbetsrad på materialet i Prislista.`, source: 'Prislistan',
    });
    const noCoverage = paintCoverageMissing(row, data, prices, settings);
    if (noCoverage.length) out.push({
      id: `atgang_saknas:${row.id}`, level: 'atgard', blocking: true, row_id: row.id,
      title: 'Åtgång saknas', text: `${row.title}: ${noCoverage.map(i => i.name).join(', ')} saknar åtgång i prislistan, så färgmängden kan inte räknas. Lägg in åtgången i Prislista eller välj en annan produkt.`, source: 'Prislistan',
    });
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
      title: 'ROT och nybyggt hus', text: `Huset är byggt ${by}. I hus som är yngre än fem år ger bara återställande arbete (reparation) ROT, inte förbättringar eller om- och tillbyggnad. Kontrollera innan ROT dras.`, source: 'Skatteverket (ROT)',
    });
  }

  // Grenen kommer från radens prisrad via koden; rader utan kod berörs inte.
  const coded = [...(data.rows ?? []).flatMap(rowLines), ...(data.common ?? [])];
  if (data.premises?.house_type === 'bostadsratt' && ctx?.rot_enabled !== false
    && coded.some(l => l.rot_class === 'arbete' && BRF_EXTERIOR_TRADES.includes(tradeOf(l, prices) as PriceTrade))) out.push({
    id: 'rot_bostadsratt_utvandigt', level: 'atgard', blocking: false,
    title: 'ROT och bostadsrätt', text: 'ROT ges inte för utvändigt arbete i bostadsrätt (fasad, tak, balkong, altan, mark). Ändra radens ROT-klass eller stäng av ROT.', source: 'Skatteverket (ROT)',
  });
  if (coded.some(l => tradeOf(l, prices) === 'el')) out.push({
    id: 'el_behorighet', level: 'info', blocking: false,
    title: 'Elarbete', text: 'Elinstallationsarbete ska utföras av ett elinstallationsföretag som är registrerat hos Elsäkerhetsverket. Ange i offerten vilket företag som gör elarbetet.', source: 'Elsäkerhetsverket',
  });

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
