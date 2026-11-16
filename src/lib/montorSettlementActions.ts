// Klientåtgärder för utbetalningsspecifikationer. Beloppen räknas och sparas
// alltid av databasfunktionerna; PDF:en byggs från de sparade raderna.
import { supabase } from '@/integrations/supabase/client';
import { loadAOrderLogo } from '@/lib/aOrderPdf';
import { buildMontorSettlementPdf } from '@/lib/montorSettlementPdf';
import { settlementPdfName } from '@/lib/pdfNames';
import { openDocumentInNewTab } from '@/lib/openDocument';
import { logActivity } from '@/lib/activityLog';

const db = supabase as any;

export const SETTLEMENT_QUERY_KEYS = [['montor_settlement_data'], ['montor_settlements'], ['a_orders_all'], ['montor_debit_invoices']] as const;

export function settlementPdfPath(id: string) { return `montor-settlements/${id}.pdf`; }

/** Felmeddelandet från databasfunktionen (svenska texter ur RAISE EXCEPTION). */
export function rpcMessage(error: any, fallback: string): string {
  return String(error?.message || fallback).replace(/^.*?ERROR:\s*/, '');
}

export async function fetchSettlement(id: string) {
  const [{ data: s, error: sErr }, { data: items, error: iErr }] = await Promise.all([
    db.from('montor_settlements').select('*').eq('id', id).maybeSingle(),
    db.from('montor_settlement_items').select('*').eq('settlement_id', id).order('sort_order'),
  ]);
  if (sErr) throw sErr;
  if (iErr) throw iErr;
  if (!s) throw new Error('Utbetalningen hittades inte');
  return { settlement: s, items: (items ?? []) as any[] };
}

export interface CreateSettlementParams {
  teamId: string; invoiceIds: string[]; selfBillingIds: string[]; creditNoteIds: string[]; deductionIds: string[]; date: string;
}

export async function createMontorSettlement(p: CreateSettlementParams) {
  const { data, error } = await db.rpc('create_montor_settlement', {
    p_team_id: p.teamId,
    p_invoice_ids: p.invoiceIds,
    p_self_billing_ids: p.selfBillingIds,
    p_credit_note_ids: p.creditNoteIds,
    p_deduction_ids: p.deductionIds,
    p_date: p.date,
  });
  if (error) throw new Error(rpcMessage(error, 'Kunde inte skapa utbetalningen'));
  const row = Array.isArray(data) ? data[0] : data;
  try { await ensureSettlementPdf(row.id); } catch (e) { console.error('PDF för utbetalningen kunde inte sparas', e); }
  return row;
}

/** Bygger PDF:en från de sparade värdena, sparar den på den fasta sökvägen och sätter pdf_path. */
export async function ensureSettlementPdf(id: string): Promise<string> {
  const { settlement, items } = await fetchSettlement(id);
  if (settlement.pdf_path) return settlement.pdf_path;
  const doc = buildMontorSettlementPdf(settlement, items, await loadAOrderLogo());
  const blob = doc.output('blob');
  const path = settlementPdfPath(id);
  const { error: upErr } = await supabase.storage.from('case-documents').upload(path, blob, { contentType: 'application/pdf', upsert: false });
  // En tidigare uppladdning som inte hann registreras räknas som klar.
  if (upErr && !/exist|duplicate|409/i.test(`${upErr.message} ${(upErr as any).statusCode ?? ''}`)) throw upErr;
  const { error } = await db.rpc('set_montor_settlement_pdf', { p_id: id });
  if (error) throw new Error(rpcMessage(error, 'Kunde inte spara PDF:en'));
  return path;
}

export async function openSettlementPdf(s: { id: string; pdf_path: string | null; settlement_number: string | null; company_name: string | null; settlement_date: string; status?: string }) {
  const name = settlementPdfName(s);
  if (s.pdf_path) {
    const ok = await openDocumentInNewTab(async () => {
      const { data } = await supabase.storage.from('case-documents').createSignedUrl(s.pdf_path as string, 600, { download: name });
      return data?.signedUrl ?? null;
    });
    if (ok) return;
  }
  const { settlement, items } = await fetchSettlement(s.id);
  buildMontorSettlementPdf(settlement, items, await loadAOrderLogo()).save(name);
}

export async function sendSettlement(id: string) {
  await ensureSettlementPdf(id);
  const { data, error } = await supabase.functions.invoke('send-montor-settlement', { body: { settlement_id: id } });
  if (error) {
    let msg = error.message;
    try { const body = await (error as any).context?.json?.(); if (body?.error) msg = body.error; } catch { /* standardtext */ }
    throw new Error(msg || 'Kunde inte skicka');
  }
  void logActivity({ action: 'montor_settlement_sent', category: 'email', description: `Utbetalningsspecifikation skickad till ${(data as any)?.to?.join(', ') ?? 'montören'}`, metadata: { settlement_id: id, skipped: (data as any)?.skipped ?? null } });
  return data as { ok: boolean; to: string[]; skipped?: string };
}

export async function markSettlementPaid(id: string, date: string) {
  const { error } = await db.rpc('mark_montor_settlement_paid', { p_id: id, p_date: date });
  if (error) throw new Error(rpcMessage(error, 'Kunde inte markera som betald'));
}
export async function undoSettlementPaid(id: string) {
  const { error } = await db.rpc('undo_montor_settlement_paid', { p_id: id });
  if (error) throw new Error(rpcMessage(error, 'Kunde inte ångra'));
}
export async function cancelSettlement(id: string) {
  const { error } = await db.rpc('cancel_montor_settlement', { p_id: id });
  if (error) throw new Error(rpcMessage(error, 'Kunde inte makulera'));
}
