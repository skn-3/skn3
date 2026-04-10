import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type CaseRow = Database['public']['Tables']['cases']['Row'];
export type CaseInsert = Database['public']['Tables']['cases']['Insert'];
export type CaseUpdate = Database['public']['Tables']['cases']['Update'];
export type CaseEventRow = Database['public']['Tables']['case_events']['Row'];
export type CaseEventInsert = Database['public']['Tables']['case_events']['Insert'];
export type DeviationRow = Database['public']['Tables']['deviations']['Row'];
export type DeviationInsert = Database['public']['Tables']['deviations']['Insert'];

export async function fetchCases(filters?: { seller?: string; team?: string }) {
  let query = supabase.from('cases').select('*').order('created_at', { ascending: false });
  if (filters?.seller) query = query.eq('seller', filters.seller);
  if (filters?.team) query = query.eq('team', filters.team);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchCaseById(id: string) {
  const { data, error } = await supabase.from('cases').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createCase(caseData: CaseInsert) {
  const { data, error } = await supabase.from('cases').insert(caseData).select().single();
  if (error) throw error;
  return data;
}

export async function updateCase(id: string, updates: CaseUpdate) {
  const { data, error } = await supabase.from('cases').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function fetchCaseEvents(caseId: string) {
  const { data, error } = await supabase
    .from('case_events')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCaseEvent(event: CaseEventInsert) {
  const { data, error } = await supabase.from('case_events').insert(event).select().single();
  if (error) throw error;
  return data;
}

export async function fetchDeviations(caseId: string) {
  const { data, error } = await supabase
    .from('deviations')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createDeviation(deviation: DeviationInsert) {
  const { data, error } = await supabase.from('deviations').insert(deviation).select().single();
  if (error) throw error;
  return data;
}
