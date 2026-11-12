import { supabase } from '@/integrations/supabase/client';
import {
  kalkylInsertDefaults, localDraftKey, localDraftKeysToRemove, stripLocalMeta, LOCAL_DRAFT_PREFIX,
  type KalkylData, type KalkylSaveFields, type OfferMeta,
} from '@/lib/kalkyl';

export interface SavedOffer { id: string; offer_number: string | null; status: string; updated_at: string | null }

export async function fetchOfferRow(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from('offers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * Skriver kalkylens fält. Ny offert skapas som utkast med källan 'kalkyl' och standardvillkoren.
 * clearPdf: en befintlig offert med ändringar får pdf_path = null i samma sparning.
 */
export async function saveKalkylOffer(id: string | null, fields: KalkylSaveFields, currentUser: string, clearPdf = false): Promise<SavedOffer> {
  const row = { ...fields, calc_data: fields.calc_data as unknown, ...(clearPdf ? { pdf_path: null } : {}) } as never;
  if (id) {
    const { data, error } = await supabase.from('offers').update(row).eq('id', id).select('id, offer_number, status, updated_at').single();
    if (error) throw error;
    return data as SavedOffer;
  }
  const insert = { ...fields, calc_data: fields.calc_data as unknown, ...kalkylInsertDefaults(currentUser) } as never;
  const { data, error } = await supabase.from('offers').insert(insert).select('id, offer_number, status, updated_at').single();
  if (error) throw error;
  return data as SavedOffer;
}

// ── Lokal kopia på enheten ──────────────────────────────────────────────────
// Nyckeln innehåller användaren, personnummer sparas aldrig och versioner äldre än 14 dagar tas bort vid läsning.

export interface LocalDraft { saved_at: string; data: KalkylData; meta: OfferMeta }

/** Tar bort gamla nycklar utan användare och utgångna versioner. */
function sweepLocalDrafts() {
  const entries: [string, string | null][] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LOCAL_DRAFT_PREFIX)) entries.push([k, localStorage.getItem(k)]);
  }
  for (const k of localDraftKeysToRemove(entries, new Date())) localStorage.removeItem(k);
}

export function readLocalDraft(user: string, id: string | null): LocalDraft | null {
  try {
    sweepLocalDrafts();
    const raw = localStorage.getItem(localDraftKey(user, id));
    if (!raw) return null;
    const v = JSON.parse(raw) as LocalDraft;
    return v && v.data && v.meta && v.saved_at ? stripLocalMeta(v) : null;
  } catch { return null; }
}
export function writeLocalDraft(user: string, id: string | null, draft: LocalDraft) {
  try { localStorage.setItem(localDraftKey(user, id), JSON.stringify(stripLocalMeta(draft))); } catch { /* fullt lagringsutrymme: hoppa över */ }
}
export function clearLocalDraft(user: string, id: string | null) {
  try { localStorage.removeItem(localDraftKey(user, id)); } catch { /* ignorera */ }
}
