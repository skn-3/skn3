import { supabase } from '@/integrations/supabase/client';
import { buildMontorDebitPdf } from '@/lib/montorDebitPdf';
import { buildSelfBillingPdf } from '@/lib/selfBillingPdf';
import { loadAOrderLogo } from '@/lib/aOrderPdf';
import { montorInvoicePdfName } from '@/lib/pdfNames';
import { calcInvoiceTotals, type VatMode } from '@/lib/invoiceMath';
import { debitTypeInfo, debitVatMode, type DebitType, type SettleMode } from '@/lib/montorSettlement';
import { logActivity } from '@/lib/activityLog';

function fmt(n: number) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }

export interface CreateDebitInvoiceArgs {
  team: any; // rad från montor_teams
  title: string;
  description: string;
  lines: { name: string; amount: number }[];
  vatMode: VatMode;
  date: string;
  dueDate: string | null;
  createdBy: string;
  /** Valfri ärendekoppling — loggar en case_event när satt */
  caseId?: string | null;
  /** Valfria detaljerade rader (qty/unit/á-pris) — annars byggs de av `lines` */
  detailedLines?: { description: string; qty: number; unit: string; unit_price: number; amount: number }[];
  /** 'debit' = N3prenad fakturerar montören (standard). 'self_billing' = självfaktura/avräkning. */
  kind?: 'debit' | 'self_billing';
  /** Avdragstyp (kind 'debit'). Styr momsen: vatMode ersätts av typens momsläge. */
  debitType?: DebitType | null;
  /** 'avrakning' = kvittas mot nästa utbetalning (montor_settlements), 'bankgiro' = montören betalar till vårt bankgiro. */
  settleMode?: SettleMode;
  /** Valfritt underlag (kvitto/PDF/bild). Sparas privat och bifogas mejlet. */
  attachment?: File | null;
}

/** Tillåtna underlag och största storlek (10 MB). */
export const DEBIT_ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const DEBIT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Filnamn utan mellanslag och specialtecken (understreck i stället). */
export function sanitizeAttachmentName(name: string): string {
  const base = String(name || 'underlag').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|_+$/g, '');
  return (cleaned || 'underlag').slice(0, 80);
}

/** Kastar om ett avdrag ingår i en aktiv utbetalningsspecifikation (då får det inte krediteras). */
async function assertNotInActiveSettlement(debitInvoiceId: string) {
  const { data, error } = await (supabase as any)
    .from('montor_settlement_items')
    .select('id, montor_settlements(settlement_number)')
    .eq('debit_invoice_id', debitInvoiceId)
    .eq('active', true)
    .limit(1);
  if (error) throw error;
  const nr = data?.[0]?.montor_settlements?.settlement_number;
  if (data?.length) throw new Error(`Avdraget ingår i ${nr || 'en utbetalning'} och kan inte krediteras. Makulera utbetalningen först.`);
}

/**
 * Delad fakturamotor för montörsfakturor:
 * insert i montor_debit_invoices → PDF → send-montor-debit-invoice → aktivitetslogg.
 */
export async function createAndSendDebitInvoice(
  args: CreateDebitInvoiceArgs,
): Promise<{ id: string; invoice_number: string; total: number }> {
  const { title, description, date, createdBy, caseId } = args;
  const kind = args.kind ?? 'debit';
  const debitType = kind === 'debit' ? args.debitType ?? null : null;
  // Typen styr momsen; den fria momsväljaren finns inte för avdrag.
  const vatMode: VatMode = debitType ? debitVatMode(debitType) : args.vatMode;
  const settleMode: SettleMode = kind === 'debit' ? args.settleMode ?? 'bankgiro' : 'bankgiro';
  const dueDate = settleMode === 'avrakning' ? null : args.dueDate;
  let team = args.team;

  if (kind === 'self_billing') {
    // Hämta hela teamraden (bankgiro/serie finns inte i useMontorTeams-urvalet)
    const { data: full } = await (supabase as any)
      .from('montor_teams').select('*').eq('id', team.id).maybeSingle();
    if (full) team = full;
    if (!String(team.bankgiro || '').trim()) {
      throw new Error(`Teamet ${team.company_name || team.name} saknar bankgiro — komplettera under Montörsteam innan fakturering.`);
    }
  }


  const pdfLines = args.detailedLines ?? args.lines.map(l => ({
    description: l.name,
    qty: 1,
    unit: 'st',
    unit_price: Math.round(Number(l.amount) || 0),
    amount: Math.round(Number(l.amount) || 0),
  }));

  const { subtotal, vatAmount, total } = calcInvoiceTotals(pdfLines, vatMode);

  const { data: { user } } = await supabase.auth.getUser();

  // Underlaget laddas upp före raden så att ett misslyckat uppladdningsförsök inte lämnar ett halvt avdrag.
  const newId = crypto.randomUUID();
  let attachmentPath: string | null = null;
  let attachmentName: string | null = null;
  if (args.attachment) {
    const file = args.attachment;
    if (!DEBIT_ATTACHMENT_TYPES.includes(file.type)) throw new Error('Underlaget måste vara PDF, JPG, PNG eller WebP');
    if (file.size > DEBIT_ATTACHMENT_MAX_BYTES) throw new Error('Underlaget får vara högst 10 MB');
    attachmentName = sanitizeAttachmentName(file.name);
    attachmentPath = `montor-debit/underlag/${newId}-${attachmentName}`;
    const { error: upErr } = await supabase.storage.from('case-documents').upload(attachmentPath, file, { contentType: file.type, upsert: false });
    if (upErr) throw new Error(`Underlaget kunde inte sparas: ${upErr.message}`);
  }

  // Självfakturor numreras ur teamets egen serie (atomisk inkrementering i databasen)
  let invoiceNumber: string | null = null;
  if (kind === 'self_billing') {
    const { data: nr, error: nrErr } = await (supabase as any)
      .rpc('next_team_invoice_number', { p_team_id: team.id });
    if (nrErr) throw nrErr;
    invoiceNumber = nr as string;
  }

  const insertPayload: Record<string, unknown> = {
    id: newId,
    created_by: user?.id ?? null,
    date,
    due_date: dueDate || null,
    team_id: team.id,
    case_id: caseId || null,
    title: title || null,
    description: description || null,
    line_items: pdfLines,
    vat_mode: vatMode,
    subtotal, vat_amount: vatAmount, total,
    status: 'sent',
    kind,
    settle_mode: settleMode,
  };
  if (debitType) insertPayload.debit_type = debitType;
  if (attachmentPath) { insertPayload.attachment_path = attachmentPath; insertPayload.attachment_name = attachmentName; }
  if (invoiceNumber) insertPayload.invoice_number = invoiceNumber;

  const { data: inserted, error: insErr } = await (supabase as any)
    .from('montor_debit_invoices').insert(insertPayload).select('*').maybeSingle();
  if (insErr) throw insErr;
  if (!inserted) throw new Error('Kunde inte skapa faktura');

  const logo = await loadAOrderLogo();
  const pdfArgs = {
    invoiceNumber: inserted.invoice_number,
    date, dueDate: dueDate || null,
    team, title, description,
    lines: pdfLines, vatMode, subtotal, vatAmount, total,
    logoDataUrl: logo,
    debitType, settleMode,
  };
  const doc = kind === 'self_billing' ? buildSelfBillingPdf({ ...pdfArgs, vatMode: vatMode as 'omvand' | 'vanlig' }) : buildMontorDebitPdf(pdfArgs);
  const pdf_base64 = doc.output('datauristring').split(',')[1] || '';

  const { error: sendErr } = await supabase.functions.invoke('send-montor-debit-invoice', {
    body: { debit_invoice_id: inserted.id, pdf_base64, file_name: montorInvoicePdfName({ ...inserted, montor_teams: team }) },
  });
  if (sendErr) throw sendErr;

  if (caseId) {
    // Inga belopp på avdrag i ärendehistoriken (montören ser den); beloppet står i activity_log.
    await (supabase as any).from('case_events').insert({
      case_id: caseId,
      event_type: 'note',
      description: kind === 'self_billing'
        ? `Självfaktura ${inserted.invoice_number} skickad till ${team.company_name || team.name} (${fmt(total)})`
        : `Avdrag ${inserted.invoice_number} registrerat för ${team.company_name || team.name}`,
      created_by: createdBy || 'System',
    });
  }
  if (kind === 'debit') {
    void logActivity({
      action: 'montor_deduction_registered', category: 'order', case_id: caseId || undefined,
      description: `Avdrag ${inserted.invoice_number} (${debitTypeInfo(debitType)?.short ?? 'debetfaktura'}) registrerat för ${team.company_name || team.name}: ${fmt(total)}, ${settleMode === 'avrakning' ? 'avräkning' : 'bankgiro'}`,
      metadata: { debit_invoice_id: inserted.id, total, debit_type: debitType, settle_mode: settleMode },
    });
  }

  return { id: inserted.id, invoice_number: inserted.invoice_number, total };
}

export interface CreateCreditInvoiceArgs {
  originalId: string;
  reason: string;
  createdBy: string;
}

/** Krediterar en montörsfaktura (självfaktura eller debetfaktura) med negerade belopp. */
export async function createAndSendCreditInvoice(
  args: CreateCreditInvoiceArgs,
): Promise<{ id: string; invoice_number: string; total: number }> {
  const { originalId, reason, createdBy } = args;

  const { data: original, error: oErr } = await (supabase as any)
    .from('montor_debit_invoices').select('*').eq('id', originalId).maybeSingle();
  if (oErr) throw oErr;
  if (!original) throw new Error('Originalfakturan hittades inte');

  const { data: team, error: tErr } = await (supabase as any)
    .from('montor_teams').select('*').eq('id', original.team_id).maybeSingle();
  if (tErr) throw tErr;
  if (!team) throw new Error('Montörsteamet hittades inte');

  const kind: 'debit' | 'self_billing' = original.kind === 'self_billing' ? 'self_billing' : 'debit';
  if (kind === 'debit') await assertNotInActiveSettlement(originalId);

  // Självfakturor krediteras i teamets egen serie; debetfakturor (våra fordringar) i N3-serien
  // (invoice_number lämnas tomt så att triggern set_montor_debit_number sätter N3-nr).
  let nr: string | null = null;
  if (kind === 'self_billing') {
    const { data, error: nrErr } = await (supabase as any)
      .rpc('next_team_invoice_number', { p_team_id: team.id });
    if (nrErr) throw nrErr;
    nr = data as string;
  }

  const neg = (n: unknown) => -Math.abs(Number(n) || 0);
  const lines = (original.line_items || []).map((li: any) => ({
    ...li,
    unit_price: neg(li.unit_price),
    amount: neg(li.amount),
  }));
  const subtotal = neg(original.subtotal);
  const vatAmount = neg(original.vat_amount);
  const total = neg(original.total);
  const date = new Date().toISOString().slice(0, 10);
  const description = `Avser kreditering av faktura ${original.invoice_number}. Orsak: ${reason}`;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: inserted, error: insErr } = await (supabase as any)
    .from('montor_debit_invoices').insert({
      created_by: user?.id ?? null,
      ...(nr ? { invoice_number: nr } : {}),
      ...(kind === 'debit' && original.debit_type ? { debit_type: original.debit_type } : {}),
      date,
      due_date: null,
      team_id: team.id,
      case_id: original.case_id ?? null,
      title: 'Kreditfaktura',
      description,
      line_items: lines,
      vat_mode: original.vat_mode,
      subtotal, vat_amount: vatAmount, total,
      status: 'sent',
      kind,
      credited_from_invoice_id: originalId,
    }).select('*').maybeSingle();
  if (insErr) throw insErr;
  if (!inserted) throw new Error('Kunde inte skapa kreditfaktura');

  const logo = await loadAOrderLogo();
  const pdfArgs = {
    invoiceNumber: inserted.invoice_number,
    date, dueDate: null,
    team, title: 'Kreditfaktura', description,
    lines, vatMode: original.vat_mode as VatMode,
    subtotal, vatAmount, total,
    logoDataUrl: logo,
    isCredit: true,
    debitType: original.debit_type ?? null,
  };
  const doc = kind === 'self_billing' ? buildSelfBillingPdf({ ...pdfArgs, vatMode: original.vat_mode as 'omvand' | 'vanlig' }) : buildMontorDebitPdf(pdfArgs);
  const pdf_base64 = doc.output('datauristring').split(',')[1] || '';

  const { error: sendErr } = await supabase.functions.invoke('send-montor-debit-invoice', {
    body: { debit_invoice_id: inserted.id, pdf_base64, file_name: montorInvoicePdfName({ ...inserted, montor_teams: team }) },
  });
  if (sendErr) throw sendErr;

  const { error: creditErr } = await (supabase as any)
    .from('montor_debit_invoices').update({ status: 'credited' }).eq('id', originalId);
  if (creditErr) {
    throw new Error(`Kreditfakturan har skickats, men originalfakturan kunde inte markeras som krediterad: ${creditErr.message || 'Okänt fel'}`);
  }

  if (original.case_id) {
    await (supabase as any).from('case_events').insert({
      case_id: original.case_id,
      event_type: 'note',
      description: kind === 'debit'
        ? `Avdrag ${original.invoice_number} krediterat (${inserted.invoice_number})`
        : `Kreditfaktura ${inserted.invoice_number} skickad — krediterar ${original.invoice_number} (${fmt(total)})`,
      created_by: createdBy || 'System',
    });
  }

  return { id: inserted.id, invoice_number: inserted.invoice_number, total };
}

