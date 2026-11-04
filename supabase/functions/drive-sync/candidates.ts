import { invoicePdfName, creditPdfName, montorInvoicePdfName, offerPdfName, uppdragInvoicePdfName, orderConfirmationPdfName, receiptArchiveName, sheetMetalArchiveName, uploadedInvoiceArchiveName } from '../_shared/pdfNames.ts';
import { eligibleSync, routeCaseDocument, assertArchivableSource, checkDocumentDate, stockholmDate, accountingFolders, sameYearFolder, type DateCheck, type Destination, type DriveKind } from '../_shared/driveFolders.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type Bucket = 'case-documents' | 'case-images' | 'ai-receipts';
export interface Candidate {
  source_table: string; source_id: string; doc_kind: DriveKind; bucket: Bucket; storage_path: string;
  file_name: string; number: string | null; date: string | null; destination: Destination | null; address?: string;
  /** Uppladdningstidpunkt för uppladdade dokument (rimlighetsfönster ±150/7 dagar). */
  uploaded_at?: string | null;
  /** Orsak att alltid hålla dokumentet för granskning (okänd typ, flaggat vid uppladdning). */
  hold_reason?: string | null; hold_code?: 'unknown_type' | 'flagged' | 'unlinked_cost' | null;
  amount?: number | null; can_fix_date?: boolean;
}
export interface Hold { status: 'review' | 'out_of_range'; reason: string; code: string }
export interface Settings { root_folder_id: string; kunder_folder_id: string; earliest_open_date: string; enabled: boolean }

export const candidateKey = (c: { source_table: string; source_id: string; doc_kind: string }) => `${c.source_table}:${c.source_id}:${c.doc_kind}`;
export async function allRows(query: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  const rows: any[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

/** Lagringssökväg ur ett äldre publikt/signerat URL-värde eller en ren sökväg. */
export function storagePathOf(stored: string, bucket: string): string {
  for (const marker of [`/object/public/${bucket}/`, `/object/sign/${bucket}/`]) {
    const i = stored.indexOf(marker);
    if (i !== -1) return decodeURIComponent(stored.slice(i + marker.length).split('?')[0]);
  }
  return stored;
}

export const UNLINKED_COST_REASON = 'Kostnaden är inte kopplad till någon A-order – avgör om kvittot är bolagets egen utgift (Arkivera ändå) eller hör till en kommande självfaktura';

export interface CostReceiptSource {
  id: string; created_at: string; amount: number | null; receipt_path: string | null; receipt_url: string | null; a_order_id: string | null;
  a_orders?: { status: string | null; invoice_number: string | null; invoice_sent_at: string | null; date: string | null } | null;
  cases?: { address: string | null } | null;
}
/**
 * Kostnadskvitton är oftast underlag för en självfaktura. Kopplad + fakturerad
 * A-order: bilaga med fakturans datum och nummer. Kopplad men ofakturerad:
 * ingen kandidat (väntar tyst). Okopplad: granskas.
 */
export function costReceiptCandidate(c: CostReceiptSource): Candidate | null {
  const raw = c.receipt_path || c.receipt_url;
  if (!raw) return null;
  const bucket: Bucket = c.receipt_path ? 'ai-receipts' : 'case-images';
  const storage_path = storagePathOf(raw, bucket);
  const base = { source_table:'case_costs', source_id:c.id, doc_kind:'cost_receipt' as const, bucket, storage_path, number:null, destination:'outgoing' as const, amount:c.amount };
  if (c.a_order_id) {
    const o = c.a_orders;
    const invoiced = o && (o.status === 'invoiced' || o.status === 'credited') && o.invoice_number;
    if (!invoiced) return null;
    // Samma datum som självfakturan (invoice_sent_at, annars date) så att bilagan hamnar i samma månadsmapp.
    const date = (o.invoice_sent_at || o.date)?.slice(0, 10) ?? null;
    return { ...base, date, file_name: receiptArchiveName({ date, address:c.cases?.address, amount:c.amount, storage_path, a_order_number:o.invoice_number }) };
  }
  const date = stockholmDate(c.created_at);
  return { ...base, date, file_name: receiptArchiveName({ date, address:c.cases?.address, amount:c.amount, storage_path }),
    hold_code:'unlinked_cost', hold_reason:UNLINKED_COST_REASON };
}

/** Granskning/utanför intervall för en kandidat, eller null om den får arkiveras. */
export function holdFor(c: Candidate, settings: Pick<Settings, 'earliest_open_date'>, today: string, override = false): Hold | null {
  if (c.hold_code === 'unknown_type' || !c.destination) return { status: 'review', reason: c.hold_reason || 'Okänd dokumenttyp', code: 'unknown_type' };
  if (override) return null;
  if (c.hold_code === 'flagged') return { status: 'review', reason: c.hold_reason || 'Flaggad vid uppladdning', code: 'flagged' };
  if (c.destination === 'customers') return null; // Kundmappar är inte periodindelade.
  const check: DateCheck = checkDocumentDate({ date: c.date, earliestOpen: settings.earliest_open_date, today, uploadedAt: c.uploaded_at ?? null });
  if (c.hold_code === 'unlinked_cost') {
    if (check.state === 'out_of_range') return { status: 'out_of_range', reason: check.reason, code: 'out_of_range' };
    return { status: 'review', reason: c.hold_reason || UNLINKED_COST_REASON, code: 'unlinked_cost' };
  }
  if (check.state === 'ok') return null;
  return { status: check.state, reason: check.reason, code: check.state === 'out_of_range' ? 'out_of_range' : 'date' };
}

/**
 * year_missing-rader som kan släppas till vanlig synk eftersom årsmappen nu
 * finns bland rotmappens undermappar. Skapar aldrig något själv.
 */
export function releasableYearMissing(
  syncRows: { id: string; status: string; review_code?: string | null; source_table: string; source_id: string; doc_kind: string }[],
  candidates: Candidate[], rootFolderNames: string[],
): string[] {
  const byKey = new Map(candidates.map(c => [candidateKey(c), c]));
  return syncRows.flatMap(r => {
    if (r.status !== 'review' || r.review_code !== 'year_missing') return [];
    const c = byKey.get(candidateKey(r));
    if (!c?.date || (c.destination !== 'outgoing' && c.destination !== 'incoming')) return [];
    let yearFolder: string;
    try { yearFolder = accountingFolders(c.date, c.destination).yearFolder; } catch { return []; }
    return rootFolderNames.some(n => sameYearFolder(n, yearFolder)) ? [r.id] : [];
  });
}

export async function collectCandidates(admin: SupabaseClient, settings: Pick<Settings, 'earliest_open_date'>, today = stockholmDate(new Date())) {
  const [aOrders, montor, documents, costs, uppdrag, offers, syncRows] = await Promise.all([
    allRows((a,b) => admin.from('a_orders').select('id,status,invoice_number,pdf_path,invoice_sent_at,date,credited_from_order_id,customer_address,total_amount,montor_teams(name)').in('status',['invoiced','credited']).not('invoice_number','is',null).not('pdf_path','is',null).order('id').range(a,b)),
    allRows((a,b) => admin.from('montor_debit_invoices').select('id,kind,invoice_number,pdf_path,date,title,total,credited_from_invoice_id,montor_teams(name)').order('id').range(a,b)),
    allRows((a,b) => admin.from('case_documents').select('id,doc_type,file_path,file_name,invoice_number,invoice_date,total_amount,created_at,drive_review_reason').not('file_path','is',null).order('id').range(a,b)),
    allRows((a,b) => admin.from('case_costs').select('id,created_at,amount,receipt_path,receipt_url,a_order_id,a_orders(status,invoice_number,invoice_sent_at,date),cases(address)').or('receipt_path.not.is.null,receipt_url.not.is.null').order('id').range(a,b)),
    allRows((a,b) => admin.from('uppdrag').select('id,customer_name,customer_address,title,handpenning_pdf_path,handpenning_invoice_no,handpenning_sent_at,slutfaktura_pdf_path,slutfaktura_invoice_no,slutfaktura_sent_at,created_at').or('handpenning_pdf_path.not.is.null,slutfaktura_pdf_path.not.is.null').order('id').range(a,b)),
    allRows((a,b) => admin.from('offers').select('id,signed_pdf_path,confirmation_pdf_path,confirmation_sent_at,offer_number,customer_name,customer_address,title,accepted_at,created_at').or('signed_pdf_path.not.is.null,confirmation_pdf_path.not.is.null').order('id').range(a,b)),
    allRows((a,b) => admin.from('drive_sync').select('*').order('id').range(a,b)),
  ]);
  const candidates: Candidate[] = [];
  for (const o of aOrders) candidates.push({ source_table:'a_orders',source_id:o.id,doc_kind:'a_order_invoice',bucket:'case-documents',storage_path:o.pdf_path,file_name:o.credited_from_order_id ? creditPdfName(o) : invoicePdfName(o),number:o.invoice_number,date:(o.invoice_sent_at || o.date)?.slice(0,10) ?? null,destination:'outgoing',amount:o.total_amount });
  const montorById = new Map(montor.map(o => [o.id,o]));
  for (const o of montor.filter(o => o.pdf_path)) {
    const original = o.credited_from_invoice_id ? montorById.get(o.credited_from_invoice_id) : null;
    candidates.push({source_table:'montor_debit_invoices',source_id:o.id,doc_kind:'montor_invoice',bucket:'case-documents',storage_path:o.pdf_path,file_name:montorInvoicePdfName(o),number:o.invoice_number,date:o.date,destination:(original?.kind || o.kind) === 'self_billing' ? 'outgoing' : 'incoming',amount:o.total});
  }

  // Uppladdade dokument: samma fil kan ha flera rader (en per ärende). Arkivera filen en gång.
  const byFile = new Map<string, any[]>();
  for (const d of documents) byFile.set(d.file_path, [...(byFile.get(d.file_path) ?? []), d]);
  const logged = new Set(syncRows.filter(r => r.source_table === 'case_documents').map(r => r.source_id));
  for (const group of byFile.values()) {
    const d = group.find(r => logged.has(r.id)) ?? [...group].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
    const route = routeCaseDocument(d.doc_type);
    const flagged = group.map(r => r.drive_review_reason).find(Boolean) ?? null;
    const base = { source_table:'case_documents', source_id:d.id, bucket:'case-documents' as const, storage_path:d.file_path, number:d.invoice_number || null,
      date:d.invoice_date || null, uploaded_at:d.created_at, amount:d.total_amount, can_fix_date:true };
    if (route.action !== 'archive') {
      candidates.push({ ...base, doc_kind:'other_document', file_name:d.file_name || d.file_path.split('/').pop(), destination:null, hold_reason:route.action === 'review' ? route.reason : 'Arkiveras inte', hold_code:'unknown_type' });
      continue;
    }
    const file_name = route.kind === 'mockfjards_payout' ? (d.file_name || `Mockfjards-${d.invoice_number || d.id}.pdf`)
      : route.kind === 'sheet_metal_invoice' ? sheetMetalArchiveName({ file_name:d.file_name, invoice_number:d.invoice_number, date:d.invoice_date, storage_path:d.file_path })
      : uploadedInvoiceArchiveName(route.kind === 'uploaded_montor_invoice' ? 'Montorsfaktura' : 'Faktura', { file_name:d.file_name, invoice_number:d.invoice_number, date:d.invoice_date, storage_path:d.file_path });
    candidates.push({ ...base, doc_kind:route.kind, file_name, destination:route.destination,
      hold_reason: flagged ? `Flaggad vid uppladdning: ${flagged}` : (!d.invoice_date ? 'Fakturadatum saknas' : null),
      hold_code: flagged ? 'flagged' : null });
  }

  for (const c of costs) {
    const candidate = costReceiptCandidate(c);
    if (candidate) candidates.push(candidate);
  }
  for (const o of uppdrag) for (const kind of ['handpenning','slutfaktura'] as const) {
    const path = o[`${kind}_pdf_path`];
    if (!path) continue;
    const date = o[`${kind}_sent_at`] || o.created_at;
    candidates.push({source_table:'uppdrag',source_id:o.id,doc_kind:`uppdrag_${kind}`,bucket:'case-documents',storage_path:path,file_name:uppdragInvoicePdfName({...o,address:o.customer_address},kind,o[`${kind}_invoice_no`],date),number:o[`${kind}_invoice_no`],date:date?.slice(0,10) ?? null,destination:'incoming'});
  }
  for (const o of offers) {
    if (o.signed_pdf_path) candidates.push({source_table:'offers',source_id:o.id,doc_kind:'signed_offer',bucket:'case-documents',storage_path:o.signed_pdf_path,file_name:offerPdfName(o,'avtal'),number:`Avtal-${o.offer_number}`,date:(o.accepted_at || o.created_at)?.slice(0,10) ?? null,destination:'customers',address:o.customer_address?.trim()});
    if (o.confirmation_pdf_path) candidates.push({source_table:'offers',source_id:o.id,doc_kind:'offer_confirmation',bucket:'case-documents',storage_path:o.confirmation_pdf_path,file_name:orderConfirmationPdfName(o,o.confirmation_sent_at),number:`Orderbekraftelse-${o.offer_number}`,date:(o.confirmation_sent_at || o.accepted_at || o.created_at)?.slice(0,10) ?? null,destination:'customers',address:o.customer_address?.trim()});
  }
  for (const c of candidates) assertArchivableSource(c.source_table);
  candidates.sort((a,b) => (a.date ?? '').localeCompare(b.date ?? '') || candidateKey(a).localeCompare(candidateKey(b)));

  const logs = new Map(syncRows.map(r => [candidateKey(r),r]));
  const holds = new Map<string, Hold>();
  const remaining: Candidate[] = [];
  for (const c of candidates) {
    const row = logs.get(candidateKey(c));
    if (row?.status === 'synced' || row?.status === 'skipped') continue;
    const hold = holdFor(c, settings, today, Boolean(row?.review_override));
    if (hold) { holds.set(candidateKey(c), hold); continue; }
    // Ett tidigare hållet dokument släpps när orsaken är borta (utom saknad årsmapp, som kräver nytt försök).
    if (row && (row.status === 'review' || row.status === 'out_of_range')) {
      if (row.review_code === 'year_missing') continue;
      remaining.push(c); continue;
    }
    if (eligibleSync(row)) remaining.push(c);
  }
  return { candidates, remaining, logs, syncRows, holds, today };
}

/** Sparar granskning/utanför intervall i drive_sync (inget laddas upp). */
export async function persistHolds(admin: SupabaseClient, collected: Awaited<ReturnType<typeof collectCandidates>>) {
  const changes = collected.candidates.flatMap(c => {
    const hold = collected.holds.get(candidateKey(c));
    if (!hold) return [];
    const row = collected.logs.get(candidateKey(c));
    if (row && row.status === hold.status && row.review_reason === hold.reason && row.review_code === hold.code) return [];
    return [{ source_table:c.source_table, source_id:c.source_id, doc_kind:c.doc_kind, storage_path:c.storage_path, file_name:c.file_name,
      status:hold.status, review_reason:hold.reason, review_code:hold.code, error:null, attempts:row?.attempts ?? 0 }];
  });
  for (let i = 0; i < changes.length; i += 200) {
    const { error } = await admin.from('drive_sync').upsert(changes.slice(i, i + 200), { onConflict:'source_table,source_id,doc_kind' });
    if (error) throw new Error(error.message);
  }
  return changes.length;
}
