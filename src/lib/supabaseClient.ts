import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { EMAIL_MAP } from '@/lib/constants';

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

export async function deleteCase(id: string) {
  const { error } = await supabase.from('cases').delete().eq('id', id);
  if (error) throw error;
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

export async function fetchAllCaseEvents() {
  const { data, error } = await supabase.from('case_events').select('*').order('created_at', { ascending: true });
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

export async function updateDeviation(id: string, updates: Partial<Database['public']['Tables']['deviations']['Update']>) {
  const { data, error } = await supabase.from('deviations').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export interface DeviationActionLogEntry {
  at: string;
  by: string;
  action: string;
  note?: string;
}

export async function appendDeviationLog(devId: string, entry: DeviationActionLogEntry) {
  const { error } = await supabase.rpc('append_deviation_log', {
    p_deviation_id: devId,
    p_entry: entry as any,
  });
  if (error) throw error;
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

export async function deleteVisit(id: string) {
  const { error } = await supabase.from('visits').delete().eq('id', id);
  if (error) throw error;
}

// Sanitize filename for storage
const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

// Upload images to case-images bucket — returns object paths (not public URLs)
export async function uploadDeviationImages(caseId: string, deviationId: string, files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const safeName = sanitizeFileName(file.name);
    const path = `${caseId}/${deviationId}/${safeName}`;
    const { error } = await supabase.storage.from('case-images').upload(path, file, { upsert: true });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

// Upload receipt image — returns object path (not public URL)
export async function uploadReceiptImage(caseId: string, costId: string, file: File): Promise<string> {
  const safeName = sanitizeFileName(file.name);
  const path = `${caseId}/receipts/${costId}_${safeName}`;
  const { error } = await supabase.storage.from('case-images').upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

// Case costs
export interface CaseCost {
  id: string;
  case_id: string;
  created_at: string;
  description: string;
  amount: number;
  receipt_url: string | null;
  created_by: string;
  category: 'ovrigt' | 'reklamation';
  responsible: string | null;
}

export async function fetchCaseCosts(caseId: string): Promise<CaseCost[]> {
  const { data, error } = await supabase
    .from('case_costs')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as CaseCost[];
}

export async function createCaseCost(cost: { case_id: string; description: string; amount: number; receipt_url?: string; created_by: string; category?: 'ovrigt' | 'reklamation'; responsible?: string | null }): Promise<CaseCost> {
  const payload: any = { ...cost, category: cost.category ?? 'ovrigt', responsible: cost.responsible ?? null };
  const { data, error } = await (supabase as any).from('case_costs').insert(payload).select().single();
  if (error) throw error;
  return data as CaseCost;
}

// Insight history (rotation memory, device-independent)
export interface InsightHistoryRow {
  insight_id: string;
  shown_at: number; // ms epoch
}

export async function fetchInsightHistory(userName: string): Promise<InsightHistoryRow[]> {
  if (!userName) return [];
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (supabase as any)
    .from('insight_history')
    .select('insight_id, shown_at')
    .eq('user_name', userName)
    .gte('shown_at', cutoff)
    .order('shown_at', { ascending: false });
  if (error) {
    console.error('fetchInsightHistory failed:', error);
    return [];
  }
  return (data || []).map((r: any) => ({
    insight_id: r.insight_id,
    shown_at: new Date(r.shown_at).getTime(),
  }));
}

export async function recordInsightsShown(userName: string, insightIds: string[]): Promise<void> {
  if (!userName || !insightIds.length) return;
  const now = new Date().toISOString();
  const rows = insightIds.map(id => ({ user_name: userName, insight_id: id, shown_at: now }));
  const { error } = await (supabase as any).from('insight_history').insert(rows);
  if (error) {
    console.error('recordInsightsShown failed:', error);
    return;
  }
  try {
    const oldCutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    await (supabase as any).from('insight_history').delete().eq('user_name', userName).lt('shown_at', oldCutoff);
  } catch {}
}



// Send notification email via edge function
export async function sendNotificationEmail(params: {
  to: string;
  cc?: string;
  subject: string;
  body?: string;
  heading?: string;
  rows?: Array<{ label: string; value: string; badge?: { color: string; bg: string } }>;
  callToAction?: string;
}) {
  const { data, error } = await supabase.functions.invoke('notify-email', {
    body: params,
  });
  if (error) throw error;
  return data;
}

/**
 * Skicka tilldelningsmail till montör (KM eller montage).
 * Skickas alltid om team finns och EMAIL_MAP har en mappning – även om montören
 * själv är den som bokar (fungerar då som bekräftelse, och kontoret får alltid
 * kopian via GLOBAL_CC i notify-email).
 * Loggar ett case_event av typen 'notification' efter lyckat utskick.
 */
export async function sendMontorAssignmentEmail(
  caseData: Pick<CaseRow, 'id' | 'address' | 'customer_name' | 'customer_phone' | 'team' | 'seller' | 'km_date' | 'montage_date'> & { montage_time?: string | null },
  kind: 'km' | 'montage',
  createdBy: string,
  overrides?: { km_date?: string; montage_date?: string; montage_time?: string | null }
): Promise<void> {
  try {
    const team = caseData.team;
    if (!team) return;
    const to = EMAIL_MAP[team];
    if (!to) return;

    const kmDate = overrides?.km_date ?? caseData.km_date ?? '';
    const montageDate = overrides?.montage_date ?? caseData.montage_date ?? '';
    const montageTime = overrides?.montage_time ?? caseData.montage_time ?? '';

    const phone = caseData.customer_phone || 'Ej angivet';

    let subject: string;
    let heading: string;
    let rows: Array<{ label: string; value: string }>;
    if (kind === 'km') {
      subject = `KONTROLLMÄTNING TILLDELAD — ${caseData.address}`;
      heading = 'Du har blivit tilldelad en kontrollmätning';
      rows = [
        { label: 'Adress', value: caseData.address },
        { label: 'Kund', value: caseData.customer_name },
        { label: 'Telefon', value: phone },
        { label: 'KM-datum', value: kmDate || 'Ej angivet' },
        { label: 'Säljare', value: caseData.seller || 'Ej angivet' },
      ];
    } else {
      subject = `MONTAGE TILLDELAT — ${caseData.address}`;
      heading = 'Du har blivit tilldelad ett montage';
      const datumValue = montageDate
        ? `${montageDate}${montageTime ? ' ' + String(montageTime).slice(0, 5) : ''}`
        : 'Ej angivet';
      rows = [
        { label: 'Adress', value: caseData.address },
        { label: 'Kund', value: caseData.customer_name },
        { label: 'Telefon', value: phone },
        { label: 'Montagedatum', value: datumValue },
        { label: 'Montör', value: team },
      ];
    }

    await sendNotificationEmail({
      to,
      subject,
      heading,
      rows,
      callToAction: 'Öppna appen för detaljer.',
    });

    await createCaseEvent({
      case_id: caseData.id,
      event_type: 'notification',
      description: `Tilldelningsmail skickat till montör (${to})`,
      created_by: createdBy,
    });
  } catch (err) {
    console.error('sendMontorAssignmentEmail failed:', err);
  }
}
