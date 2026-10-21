import { invoicePdfName, creditPdfName, montorInvoicePdfName, offerPdfName, uppdragInvoicePdfName, orderConfirmationPdfName } from '../_shared/pdfNames.ts';
import { eligibleSync, type Destination, type DriveKind } from '../_shared/driveFolders.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface Candidate {
  source_table: string; source_id: string; doc_kind: DriveKind; storage_path: string;
  file_name: string; number: string | null; date: string; destination: Destination; address?: string;
}
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
export async function collectCandidates(admin: SupabaseClient) {
  const [aOrders, montor, payouts, uppdrag, offers, syncRows] = await Promise.all([
    allRows((a,b) => admin.from('a_orders').select('id,status,invoice_number,pdf_path,invoice_sent_at,date,credited_from_order_id,customer_address,montor_teams(name)').in('status',['invoiced','credited']).not('invoice_number','is',null).not('pdf_path','is',null).order('id').range(a,b)),
    allRows((a,b) => admin.from('montor_debit_invoices').select('id,kind,invoice_number,pdf_path,date,title,total,credited_from_invoice_id,montor_teams(name)').order('id').range(a,b)),
    allRows((a,b) => admin.from('case_documents').select('id,file_path,file_name,invoice_number,invoice_date,created_at').eq('doc_type','mockfjards_payout').not('file_path','is',null).order('id').range(a,b)),
    allRows((a,b) => admin.from('uppdrag').select('id,customer_name,customer_address,title,handpenning_pdf_path,handpenning_invoice_no,handpenning_sent_at,slutfaktura_pdf_path,slutfaktura_invoice_no,slutfaktura_sent_at,created_at').or('handpenning_pdf_path.not.is.null,slutfaktura_pdf_path.not.is.null').order('id').range(a,b)),
    allRows((a,b) => admin.from('offers').select('id,signed_pdf_path,confirmation_pdf_path,confirmation_sent_at,offer_number,customer_name,customer_address,title,accepted_at,created_at').or('signed_pdf_path.not.is.null,confirmation_pdf_path.not.is.null').order('id').range(a,b)),
    allRows((a,b) => admin.from('drive_sync').select('*').order('id').range(a,b)),
  ]);
  const candidates: Candidate[] = [];
  for (const o of aOrders) candidates.push({ source_table:'a_orders',source_id:o.id,doc_kind:'a_order_invoice',storage_path:o.pdf_path,file_name:o.credited_from_order_id ? creditPdfName(o) : invoicePdfName(o),number:o.invoice_number,date:o.invoice_sent_at || o.date,destination:'outgoing' });
  const montorById = new Map(montor.map(o => [o.id,o]));
  for (const o of montor.filter(o => o.pdf_path)) {
    const original = o.credited_from_invoice_id ? montorById.get(o.credited_from_invoice_id) : null;
    candidates.push({source_table:'montor_debit_invoices',source_id:o.id,doc_kind:'montor_invoice',storage_path:o.pdf_path,file_name:montorInvoicePdfName(o),number:o.invoice_number,date:o.date,destination:(original?.kind || o.kind) === 'self_billing' ? 'outgoing' : 'incoming'});
  }
  for (const o of payouts) candidates.push({source_table:'case_documents',source_id:o.id,doc_kind:'mockfjards_payout',storage_path:o.file_path,file_name:o.file_name || `Mockfjards-${o.invoice_number || o.id}.pdf`,number:o.invoice_number,date:o.invoice_date || o.created_at,destination:'incoming'});
  for (const o of uppdrag) for (const kind of ['handpenning','slutfaktura'] as const) {
    const path = o[`${kind}_pdf_path`];
    if (!path) continue;
    const date = o[`${kind}_sent_at`] || o.created_at;
    candidates.push({source_table:'uppdrag',source_id:o.id,doc_kind:`uppdrag_${kind}`,storage_path:path,file_name:uppdragInvoicePdfName({...o,address:o.customer_address},kind,o[`${kind}_invoice_no`],date),number:o[`${kind}_invoice_no`],date,destination:'incoming'});
  }
  for (const o of offers) {
    if (o.signed_pdf_path) candidates.push({source_table:'offers',source_id:o.id,doc_kind:'signed_offer',storage_path:o.signed_pdf_path,file_name:offerPdfName(o,'avtal'),number:`Avtal-${o.offer_number}`,date:o.accepted_at || o.created_at,destination:'customers',address:o.customer_address?.trim()});
    if (o.confirmation_pdf_path) candidates.push({source_table:'offers',source_id:o.id,doc_kind:'offer_confirmation',storage_path:o.confirmation_pdf_path,file_name:orderConfirmationPdfName(o,o.confirmation_sent_at),number:`Orderbekraftelse-${o.offer_number}`,date:o.confirmation_sent_at || o.accepted_at || o.created_at,destination:'customers',address:o.customer_address?.trim()});
  }
  candidates.sort((a,b) => a.date.localeCompare(b.date) || candidateKey(a).localeCompare(candidateKey(b)));
  const logs = new Map(syncRows.map(r => [candidateKey(r),r]));
  const remaining = candidates.filter(c => eligibleSync(logs.get(candidateKey(c))));
  return { candidates, remaining, logs, syncRows };
}