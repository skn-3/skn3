import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type CaseRow = Database['public']['Tables']['cases']['Row'];
export type CaseInsert = Database['public']['Tables']['cases']['Insert'];
export type CaseUpdate = Database['public']['Tables']['cases']['Update'];
export type CaseEventRow = Database['public']['Tables']['case_events']['Row'];
export type CaseEventInsert = Database['public']['Tables']['case_events']['Insert'];
export type DeviationRow = Database['public']['Tables']['deviations']['Row'];
export type DeviationInsert = Database['public']['Tables']['deviations']['Insert'];
export type VisitRow = Database['public']['Tables']['visits']['Row'];
export type VisitInsert = Database['public']['Tables']['visits']['Insert'];
export type VisitUpdate = Database['public']['Tables']['visits']['Update'];

export async function fetchCases(filters?: { seller?: string; team?: string }) {
  let query = supabase.from('cases').select('*').order('created_at', { ascending: false });
  if (filters?.seller) query = query.eq('seller', filters.seller);
  if (filters?.team) query = query.eq('team', filters.team);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchAllCases() {
  const { data, error } = await supabase.from('cases').select('*').order('created_at', { ascending: false });
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

export async function fetchAllDeviations() {
  const { data, error } = await supabase.from('deviations').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createDeviation(deviation: DeviationInsert) {
  const { data, error } = await supabase.from('deviations').insert(deviation).select().single();
  if (error) throw error;
  return data;
}

export async function updateDeviation(id: string, updates: { image_urls?: string[] }) {
  const { data, error } = await supabase.from('deviations').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Visits
export async function fetchVisits(filters?: { seller?: string }) {
  let query = supabase.from('visits').select('*').order('created_at', { ascending: false });
  if (filters?.seller) query = query.eq('seller', filters.seller);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchAllVisits() {
  const { data, error } = await supabase.from('visits').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createVisit(visit: VisitInsert) {
  const { data, error } = await supabase.from('visits').insert(visit).select().single();
  if (error) throw error;
  return data;
}

export async function updateVisit(id: string, updates: VisitUpdate) {
  const { data, error } = await supabase.from('visits').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Upload images to case-images bucket
export async function uploadDeviationImages(caseId: string, deviationId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const path = `${caseId}/${deviationId}/${file.name}`;
    const { error } = await supabase.storage.from('case-images').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('case-images').getPublicUrl(path);
    urls.push(urlData.publicUrl);
  }
  return urls;
}

// Send notification email via edge function
export async function sendNotificationEmail(params: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
}) {
  const { data, error } = await supabase.functions.invoke('notify-email', {
    body: params,
  });
  if (error) throw error;
  return data;
}
