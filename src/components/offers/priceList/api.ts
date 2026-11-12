import { supabase } from '@/integrations/supabase/client';
import { compressImageToBlob } from '@/lib/imageCompress';
import { parseKalkylSettings, type KalkylSettings, type PriceItem } from '@/lib/kalkyl';

export const PRICE_ITEMS_KEY = ['price_items'] as const;
export const KALKYL_SETTINGS_KEY = ['kalkyl_settings'] as const;
export const priceLogKey = (id: string) => ['price_log', id] as const;

/** Kolumner som får skrivas från prislistan (id, tidsstämplar sköts av databasen). */
const WRITABLE: (keyof PriceItem)[] = [
  'code', 'trade', 'kind', 'rot_class', 'slot', 'name', 'spec', 'unit', 'price_ex_vat', 'cost_ex_vat', 'hours_per_unit',
  'level', 'pack_size', 'pack_label', 'waste_pct', 'coverage', 'color_system', 'color_code', 'color_hex', 'swatch',
  'image_path', 'article_no', 'supplier', 'source', 'price_date', 'status', 'approved_by', 'approved_at', 'meta',
  'sort_order', 'updated_by',
];

function toRow(item: Partial<PriceItem>) {
  const row: Record<string, unknown> = {};
  for (const k of WRITABLE) if (k in item) row[k] = item[k] ?? null;
  if ('meta' in row && row.meta == null) row.meta = {};
  if ('waste_pct' in row && row.waste_pct == null) row.waste_pct = 0;
  if ('sort_order' in row && row.sort_order == null) row.sort_order = 0;
  return row;
}

export async function fetchPriceItems(): Promise<PriceItem[]> {
  const { data, error } = await supabase.from('price_items').select('*').order('sort_order').order('name');
  if (error) throw error;
  return (data ?? []) as unknown as PriceItem[];
}

export async function fetchKalkylSettings(): Promise<KalkylSettings> {
  const { data, error } = await supabase.from('kalkyl_settings').select('data').eq('id', 1).maybeSingle();
  if (error) throw error;
  return parseKalkylSettings(data?.data);
}

export async function saveKalkylSettings(settings: KalkylSettings, user: string) {
  const { error } = await supabase.from('kalkyl_settings')
    .upsert({ id: 1, data: settings as unknown as Record<string, number>, updated_by: user }, { onConflict: 'id' });
  if (error) throw error;
}

export async function insertPriceItems(items: Partial<PriceItem>[]) {
  if (!items.length) return;
  const { error } = await supabase.from('price_items').insert(items.map(toRow) as never);
  if (error) throw error;
}

export async function updatePriceItem(id: string, item: Partial<PriceItem>) {
  const { error } = await supabase.from('price_items').update(toRow(item) as never).eq('id', id);
  if (error) throw error;
}

export interface PriceLogRow { id: string; changed_at: string; changed_by: string | null; field: string; old_value: string | null; new_value: string | null }

export async function fetchPriceLog(id: string): Promise<PriceLogRow[]> {
  const { data, error } = await supabase.from('price_log').select('*').eq('price_item_id', id)
    .order('changed_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as PriceLogRow[];
}

const safeSegment = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_');

/** Komprimerar och laddar upp en produktbild. Returnerar sökvägen i catalog-images. */
export async function uploadCatalogImage(file: File, code: string): Promise<string> {
  const { blob } = await compressImageToBlob(file, 1200, 0.82);
  const base = safeSegment(file.name.replace(/\.[^.]+$/, '')) || 'bild';
  const path = `${safeSegment(code || 'utan-kod')}/${Date.now()}_${base}.jpg`;
  const { error } = await supabase.storage.from('catalog-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}
