// Edge function: consultant-payout
// Admin-only. Reserverar fakturanummer, räknar om och sparar färdiga löner,
// skapar förskott, markerar betalt och loggar till Google Sheets.
// Systemet ändrar, flyttar eller raderar aldrig något i Drive eller Sheets.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireAdmin } from '../_shared/auth.ts';
import { SheetsClient } from '../_shared/googleSheets.ts';
import { calcPayout, monthLabel, type PayLine } from '../_shared/consultantPay.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const todayStockholm = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function loanBalance(db: ReturnType<typeof admin>, consultantId: string): Promise<number> {
  const { data } = await db.from('consultant_loans').select('amount').eq('consultant_id', consultantId);
  return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
}

async function appendLog(db: ReturnType<typeof admin>, consultant: any, payout: any, event: string, actor: string, note?: string): Promise<string | null> {
  if (!consultant.log_sheet_id) return 'Loggarket saknas';
  try {
    const { data: lines } = await db.from('consultant_payout_lines').select('kind,label,amount,included').eq('payout_id', payout.id);
    const included = (lines ?? []).filter(l => l.included);
    const car = included.filter(l => l.kind === 'standard').reduce((s, l) => s + Number(l.amount), 0);
    const receipts = included.filter(l => l.kind === 'receipt');
    const receiptSum = receipts.reduce((s, l) => s + Number(l.amount), 0);
    const isAdvance = payout.kind === 'advance';
    const balance = await loanBalance(db, consultant.id);
    const sheets = new SheetsClient();
    await sheets.ensureHeader(consultant.log_sheet_id);
    await sheets.appendRows(consultant.log_sheet_id, 'A:Z', [[
      new Date().toISOString(),
      event,
      consultant.name,
      payout.payout_month ? monthLabel(payout.payout_month) : '',
      payout.period_start && payout.period_end ? `${payout.period_start} – ${payout.period_end}` : '',
      payout.tb_amount ?? '',
      payout.tier_pct != null ? `${payout.tier_pct} %` : '',
      payout.commission_gross ?? '',
      car || '',
      receiptSum || '',
      receipts.map(l => l.label).join(', '),
      !isAdvance && Number(payout.loan_change) < 0 ? Math.abs(Number(payout.loan_change)) : '',
      isAdvance ? Number(payout.loan_change) : '',
      payout.net_amount ?? '',
      payout.vat_amount ?? '',
      payout.total_incl_vat ?? '',
      payout.invoice_number ?? '',
      payout.invoice_date ?? '',
      balance,
      payout.invoice_drive_link ?? '',
      payout.provision_file_name ?? '',
      payout.status ?? '',
      actor,
      note ?? payout.notes ?? '',
    ]]);
    return null;
  } catch (e) {
    console.error('log append failed', e);
    return e instanceof Error ? e.message : 'Loggningen misslyckades';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAdmin(req, corsHeaders);
    if (auth.response) return auth.response;
    const db = admin();
    const body = await req.json();
    const action = body?.action;
    const actor = auth.claims?.email ? String(auth.claims.email) : 'admin';

    const loadPayout = async () => {
      if (!body?.payout_id) throw new Error('payout_id saknas');
      const { data, error } = await db.from('consultant_payouts').select('*, consultants(*)').eq('id', body.payout_id).maybeSingle();
      if (error || !data) throw new Error('Utbetalningen hittades inte');
      return data as any;
    };

    if (action === 'reserve') {
      const payout = await loadPayout();
      if (!payout.invoice_number) {
        const { data: no, error } = await db.rpc('consultant_next_invoice_number', { p_consultant_id: payout.consultant_id });
        if (error) throw new Error(error.message);
        const update: Record<string, unknown> = { invoice_number: no };
        if (!payout.invoice_date) update.invoice_date = todayStockholm();
        const { error: upErr } = await db.from('consultant_payouts').update(update).eq('id', payout.id);
        if (upErr) throw new Error(upErr.message);
        return json({ invoice_number: no, invoice_date: update.invoice_date ?? payout.invoice_date });
      }
      return json({ invoice_number: payout.invoice_number, invoice_date: payout.invoice_date });
    }

    if (action === 'finalize') {
      const payout = await loadPayout();
      if (!payout.invoice_number) return json({ error: 'Fakturanummer saknas — kör reserve först' }, 400);
      if (!body?.invoice_pdf_base64) return json({ error: 'invoice_pdf_base64 saknas' }, 400);
      const consultant = payout.consultants;
      if (!consultant) return json({ error: 'Konsulten hittades inte' }, 400);

      // Räkna om allt server-side från DB.
      const { data: lines } = await db.from('consultant_payout_lines').select('kind,amount,included').eq('payout_id', payout.id);
      const isAdvance = payout.kind === 'advance';
      const payLines: PayLine[] = (lines ?? []).map(l => ({ kind: l.kind, amount: Number(l.amount), included: l.included }));
      const loanRepayment = !isAdvance && Number(payout.loan_change) < 0 ? Math.abs(Number(payout.loan_change)) : 0;
      const result = isAdvance
        ? (() => {
            const net = Number(payout.net_amount ?? payout.loan_change) || 0;
            const vat = Math.round(net * Number(payout.vat_rate ?? 25)) / 100;
            return { pct: null, gross: net, deductions: 0, loanRepayment: 0, net, vat, total: Math.round((net + vat) * 100) / 100 };
          })()
        : calcPayout({ tb: Number(payout.tb_amount) || 0, tiers: consultant.commission_tiers, lines: payLines, loanRepayment, vatRate: Number(payout.vat_rate ?? 25) });

      // Spara PDF:er i lagringen (upsert, oförändrade sökvägar).
      const invoicePath = `consultants/${payout.consultant_id}/${payout.id}-faktura.pdf`;
      const { error: upErr } = await db.storage.from('case-documents').upload(invoicePath, base64ToBytes(body.invoice_pdf_base64), { contentType: 'application/pdf', upsert: true });
      if (upErr) throw new Error(`Kunde inte spara faktura-PDF:en: ${upErr.message}`);
      let specPath: string | null = payout.spec_pdf_path;
      if (body.spec_pdf_base64) {
        specPath = `consultants/${payout.consultant_id}/${payout.id}-spec.pdf`;
        const { error: specErr } = await db.storage.from('case-documents').upload(specPath, base64ToBytes(body.spec_pdf_base64), { contentType: 'application/pdf', upsert: true });
        if (specErr) throw new Error(`Kunde inte spara specifikationen: ${specErr.message}`);
      }

      const { error: updErr } = await db.from('consultant_payouts').update({
        tier_pct: result.pct,
        commission_gross: result.gross,
        deductions_total: result.deductions,
        net_amount: result.net,
        vat_amount: result.vat,
        total_incl_vat: result.total,
        invoice_pdf_path: invoicePath,
        spec_pdf_path: specPath,
        status: 'invoiced',
      }).eq('id', payout.id);
      if (updErr) throw new Error(updErr.message);

      // Lånepost — idempotent (hoppa över om samma fakturanummer redan bokförts).
      if (Number(payout.loan_change) !== 0) {
        const { data: existingLoan } = await db.from('consultant_loans').select('id').eq('payout_id', payout.id).eq('invoice_number', payout.invoice_number).maybeSingle();
        if (!existingLoan) {
          await db.from('consultant_loans').insert({
            consultant_id: payout.consultant_id,
            date: payout.invoice_date ?? todayStockholm(),
            amount: Number(payout.loan_change),
            note: Number(payout.loan_change) < 0 ? `Amortering på faktura ${payout.invoice_number}` : `Förskott, faktura ${payout.invoice_number}`,
            payout_id: payout.id,
            invoice_number: payout.invoice_number,
            created_by: actor,
          });
        }
      }

      const { data: saved } = await db.from('consultant_payouts').select('*').eq('id', payout.id).single();
      const logError = await appendLog(db, consultant, { ...payout, ...saved }, isAdvance ? 'Förskottsfaktura skapad' : 'Faktura skapad', actor);
      return json({ ok: true, payout: saved, ...(logError ? { log_error: logError } : {}) });
    }

    if (action === 'advance') {
      if (!body?.consultant_id) return json({ error: 'consultant_id saknas' }, 400);
      const amount = Number(body?.amount);
      if (!(amount > 0)) return json({ error: 'Beloppet måste vara större än 0' }, 400);
      const { data: consultant, error: cErr } = await db.from('consultants').select('*').eq('id', body.consultant_id).maybeSingle();
      if (cErr || !consultant) return json({ error: 'Konsulten hittades inte' }, 400);
      const vatRate = Number(consultant.vat_rate ?? 25);
      const vat = Math.round(amount * vatRate) / 100;
      const { data: payout, error } = await db.from('consultant_payouts').insert({
        consultant_id: consultant.id,
        kind: 'advance',
        loan_change: amount,
        net_amount: amount,
        vat_rate: vatRate,
        vat_amount: vat,
        total_incl_vat: Math.round((amount + vat) * 100) / 100,
        tier_pct: null,
        commission_gross: amount,
        status: 'draft',
        invoice_date: body.invoice_date ?? null,
        notes: body.note ?? null,
        created_by: actor,
      }).select('*').single();
      if (error) throw new Error(error.message);
      return json({ ok: true, payout });
    }

    if (action === 'mark_paid' || action === 'undo_paid') {
      const payout = await loadPayout();
      const consultant = payout.consultants;
      if (action === 'mark_paid') {
        if (!body?.paid_at) return json({ error: 'paid_at saknas' }, 400);
        const { error } = await db.from('consultant_payouts').update({ status: 'paid', paid_at: body.paid_at, paid_by: body.paid_by ?? actor }).eq('id', payout.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from('consultant_payouts').update({ status: payout.sent_at ? 'sent' : 'invoiced', paid_at: null, paid_by: null }).eq('id', payout.id);
        if (error) throw new Error(error.message);
      }
      const { data: saved } = await db.from('consultant_payouts').select('*').eq('id', payout.id).single();
      const logError = await appendLog(db, consultant, { ...payout, ...saved }, action === 'mark_paid' ? 'Betald' : 'Betald ångrad', actor);
      return json({ ok: true, payout: saved, ...(logError ? { log_error: logError } : {}) });
    }

    if (action === 'log') {
      if (!body?.consultant_id || !body?.event) return json({ error: 'consultant_id och event krävs' }, 400);
      const { data: consultant, error: cErr } = await db.from('consultants').select('*').eq('id', body.consultant_id).maybeSingle();
      if (cErr || !consultant) return json({ error: 'Konsulten hittades inte' }, 400);
      let payout: any = { id: body.payout_id ?? null, consultant_id: consultant.id, kind: 'payout' };
      if (body.payout_id) {
        const { data } = await db.from('consultant_payouts').select('*').eq('id', body.payout_id).maybeSingle();
        if (data) payout = data;
      }
      const logError = await appendLog(db, consultant, payout, String(body.event), actor, body.note);
      if (logError) return json({ error: logError }, 500);
      return json({ ok: true });
    }

    return json({ error: `Okänd action: ${action}` }, 400);
  } catch (e) {
    console.error('consultant-payout error', e);
    return json({ error: e instanceof Error ? e.message : 'Okänt fel' }, 500);
  }
});
