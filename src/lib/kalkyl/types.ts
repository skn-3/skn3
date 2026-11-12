// Kalkylmotorns typer. Alla belopp är exklusive moms.
// Etapp 2 (kalkylvyn) och etapp 3 (kundsida, AI-kontroll) bygger på dessa signaturer – håll dem stabila.

export type RotClass = 'arbete' | 'material' | 'ovrigt';
export type PriceTrade = 'golv' | 'malning' | 'tak' | 'fasad' | 'badrum' | 'kok' | 'altan' | 'renovering' | 'gemensamt';
export type PriceKind = 'arbete' | 'material' | 'tillbehor' | 'ovrigt';
export type PriceLevel = 'bas' | 'standard' | 'premium';
export type PriceStatus = 'utkast' | 'godkand' | 'arkiverad';
export type ColorSystem = 'NCS' | 'RAL';

export interface Swatch {
  color: string;
  line?: string;
  pattern?: 'plank' | 'fiskben' | 'solid' | string;
  step?: number;
}

/** En rad i prislistan (tabellen price_items). */
export interface PriceItem {
  id: string;
  code: string;
  trade: PriceTrade;
  kind: PriceKind;
  rot_class: RotClass;
  slot: string | null;
  name: string;
  spec: string | null;
  unit: string;
  /** Kundpris per enhet ex moms. NULL = pris saknas, hitta aldrig på ett. */
  price_ex_vat: number | null;
  /** Inköp eller UE-kostnad per enhet ex moms (internt). */
  cost_ex_vat: number | null;
  hours_per_unit: number | null;
  level: PriceLevel | null;
  pack_size: number | null;
  pack_label: string | null;
  waste_pct: number;
  /** Färgåtgång: m² per liter och strykning. */
  coverage: number | null;
  color_system: ColorSystem | null;
  color_code: string | null;
  color_hex: string | null;
  swatch: Swatch | null;
  image_path: string | null;
  article_no: string | null;
  supplier: string | null;
  source: string | null;
  price_date: string | null;
  status: PriceStatus;
  approved_by: string | null;
  approved_at: string | null;
  meta: Record<string, unknown>;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  updated_by: string | null;
}

export interface KalkylSettings {
  margin_target_pct: number;
  price_max_age_days: number;
  door_width_m: number;
  door_height_m: number;
  window_width_m: number;
  window_height_m: number;
}

export interface RoomDims { length: number; width: number; height: number; doors: number; windows: number }

export interface Kulor { system: ColorSystem; code: string; name?: string; hex?: string; dark?: boolean }

export interface KalkylLine {
  key: string;                 // stabil nyckel inom raden, t.ex. 'golv.material'
  code: string | null;         // price_items.code, null för fri rad
  description: string;         // kundtext
  detail?: string;             // t.ex. "9 paket (28,6 m²)"
  rot_class: RotClass;
  qty: number; unit: string;
  unit_price: number | null;   // ex moms, null = pris saknas
  amount: number;              // ex moms, avrundat till 2 decimaler, 0 när pris saknas
  cost?: number | null;        // ex moms, internt (radens totala kostnad)
  hours?: number | null;
  price_date?: string | null;
  price_status?: PriceStatus | null;
  manual?: boolean;            // säljaren har ändrat mängd eller pris
}

export interface GolvInput { material_code: string; direction: 'langs' | 'tvars'; underlag: boolean; sockel: boolean; troskel: boolean; rivning: boolean; flytspackling: boolean; mobelflytt: boolean; bortforsling: boolean }
export interface MalningInput { underarbete: 'latt' | 'normal' | 'omfattande'; tak: boolean; snickerier: boolean; coats?: 2 | 3; kulor_vagg?: Kulor | null; kulor_tak?: Kulor | null; kulor_snickerier?: Kulor | null }
export interface KalkylRoom { id: string; name: string; dims: RoomDims }
export type KalkylOverride = { qty?: number; unit_price?: number; removed?: boolean };
export interface KalkylRow { id: string; room_id: string | null; trade: 'golv' | 'malning' | 'fri'; title: string; input: GolvInput | MalningInput | null; lines: KalkylLine[]; overrides?: Record<string, KalkylOverride>; note?: string }
export interface KalkylAdjustment { id: string; label: string; amount: number; rot_class: RotClass }   // ex moms, negativt = rabatt
export interface KalkylData { version: 1; premises: { house_type: 'villa' | 'radhus' | 'bostadsratt' | 'fritidshus' | 'annat' | null; build_year: number | null; floors: number | null }; rooms: KalkylRoom[]; rows: KalkylRow[]; common: KalkylLine[]; adjustments: KalkylAdjustment[]; priced_at: string | null; /** Prisradskoder som kunden gillat. */ favorites?: string[] }

export const DEFAULT_KALKYL_SETTINGS: KalkylSettings = {
  margin_target_pct: 25,
  price_max_age_days: 60,
  door_width_m: 0.9,
  door_height_m: 2.1,
  window_width_m: 1.2,
  window_height_m: 1.3,
};
