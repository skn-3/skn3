import { supabase } from '@/integrations/supabase/client';
import type { KalkylData, KalkylSaveFields, OfferMeta } from '@/lib/kalkyl';

export interface SavedOffer { id: string; offer_number: string | null; status: string; updated_at: string | null }

export async function fetchOfferRow(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from('offers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

/** Skriver kalkylens fält. Ny offert skapas som utkast med källan 'kalkyl'. */
export async function saveKalkylOffer(id: string | null, fields: KalkylSaveFields, currentUser: string): Promise<SavedOffer> {
  const row = { ...fields, calc_data: fields.calc_data as unknown } as never;
  if (id) {
    const { data, error } = await supabase.from('offers').update(row).eq('id', id).select('id, offer_number, status, updated_at').single();
    if (error) throw error;
    return data as SavedOffer;
  }
  const insert = { ...fields, calc_data: fields.calc_data as unknown, status: 'draft', created_by: currentUser, source: 'kalkyl' } as never;
  const { data, error } = await supabase.from('offers').insert(insert).select('id, offer_number, status, updated_at').single();
  if (error) throw error;
  return data as SavedOffer;
}

// ── Lokal kopia på enheten ──────────────────────────────────────────────────

export interface LocalDraft { saved_at: string; data: KalkylData; meta: OfferMeta }
const key = (id: string | null) => `n3prenad-kalkyl:${id ?? 'ny'}`;

export function readLocalDraft(id: string | null): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const v = JSON.parse(raw) as LocalDraft;
    return v && v.data && v.meta && v.saved_at ? v : null;
  } catch { return null; }
}
export function writeLocalDraft(id: string | null, draft: LocalDraft) {
  try { localStorage.setItem(key(id), JSON.stringify(draft)); } catch { /* fullt lagringsutrymme: hoppa över */ }
}
export function clearLocalDraft(id: string | null) {
  try { localStorage.removeItem(key(id)); } catch { /* ignorera */ }
}
