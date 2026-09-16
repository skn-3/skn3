import { supabase } from '@/integrations/supabase/client';
import { buildMontorDebitPdf } from '@/lib/montorDebitPdf';
import { buildSelfBillingPdf } from '@/lib/selfBillingPdf';
import { loadAOrderLogo } from '@/lib/aOrderPdf';
import { calcInvoiceTotals } from '@/lib/invoiceMath';

function fmt(n: number) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }

export interface CreateDebitInvoiceArgs {
  team: any; // rad från montor_teams
  title: string;
  description: string;
  lines: { name: string; amount: number }[];
  vatMode: 'omvand' | 'vanlig';
  date: string;
  dueDate: string | null;
  createdBy: string;
  /** Valfri ärendekoppling — loggar en case_event när satt */
  caseId?: string | null;
  /** Valfria detaljerade rader (qty/unit/á-pris) — annars byggs de av `lines` */
  detailedLines?: { description: string; qty: number; unit: string; unit_price: number; amount: number }[];
  /** 'debit' = N3prenad fakturerar montören (standard). 'self_billing' = självfaktura/avräkning. */
  kind?: 'debit' | 'self_billing';
}

/**
 * Delad fakturamotor för montörsfakturor:
 * insert i montor_debit_invoices → PDF → send-montor-debit-invoice → aktivitetslogg.
 */
export async function createAndSendDebitInvoice(
  args: CreateDebitInvoiceArgs,
): Promise<{ id: string; invoice_number: string; total: number }> {
  const { title, description, vatMode, date, dueDate, createdBy, caseId } = args;
  const kind = args.kind ?? 'debit';
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

  // Självfakturor numreras ur teamets egen serie (atomisk inkrementering i databasen)
  let invoiceNumber: string | null = null;
  if (kind === 'self_billing') {
    const { data: nr, error: nrErr } = await (supabase as any)
      .rpc('next_team_invoice_number', { p_team_id: team.id });
    if (nrErr) throw nrErr;
    invoiceNumber = nr as string;
  }

  const insertPayload: Record<string, unknown> = {
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
  };
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
  };
  const doc = kind === 'self_billing' ? buildSelfBillingPdf(pdfArgs) : buildMontorDebitPdf(pdfArgs);
  const pdf_base64 = doc.output('datauristring').split(',')[1] || '';

  const { error: sendErr } = await supabase.functions.invoke('send-montor-debit-invoice', {
    body: { debit_invoice_id: inserted.id, pdf_base64 },
  });
  if (sendErr) throw sendErr;

  if (caseId) {
    await (supabase as any).from('case_events').insert({
      case_id: caseId,
      event_type: 'note',
      description: kind === 'self_billing'
        ? `Självfaktura ${inserted.invoice_number} skickad till ${team.company_name || team.name} (${fmt(total)})`
        : `Debetfaktura ${inserted.invoice_number} skickad till ${team.company_name || team.name} (${fmt(total)})`,
      created_by: createdBy || 'System',
    });
  }

  return { id: inserted.id, invoice_number: inserted.invoice_number, total };
}
