// Edge function: consultant-payout
// Admin-only. Reserverar fakturanummer, räknar om och sparar färdiga löner,
// skapar förskott, markerar betalt, skickar och arkiverar fakturan samt loggar till Google Sheets.
// Systemet ändrar, flyttar eller raderar aldrig något i Drive eller Sheets.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireAdmin } from '../_shared/auth.ts';
import { SheetsClient } from '../_shared/googleSheets.ts';
import { calcPayout, monthLabel, consultantDueDate, payerFiscalInfo, pickPayerMonthFolder, pickPayerYearFolder, type PayLine } from '../_shared/consultantPay.ts';
import { DriveReader } from '../_shared/googleDriveRead.ts';
import { consultantInvoicePdfName, consultantSpecPdfName } from '../_shared/pdfNames.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

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

type Row = (string | number | null)[];
type LineLite = { kind: string; label: string; amount: number | string; included: boolean };

function logRow(consultant: any, payout: any, lines: LineLite[], event: string, actor: string, balance: number, note?: string): Row {
  const included = lines.filter(l => l.included);
  const car = included.filter(l => l.kind === 'standard').reduce((s, l) => s + Number(l.amount), 0);
  const receipts = included.filter(l => l.kind === 'receipt');
  const receiptSum = receipts.reduce((s, l) => s + Number(l.amount), 0);
  const isAdvance = payout.kind === 'advance';
  return [
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
  ];
}

async function appendLog(db: ReturnType<typeof admin>, consultant: any, payout: any, event: string, actor: string, note?: string): Promise<string | null> {
  if (!consultant.log_sheet_id) return 'Loggarket saknas';
  try {
    const { data: lines } = payout.id
      ? await db.from('consultant_payout_lines').select('kind,label,amount,included').eq('payout_id', payout.id)
      : { data: [] as LineLite[] };
    const balance = await loanBalance(db, consultant.id);
    const sheets = new SheetsClient();
    await sheets.ensureHeader(consultant.log_sheet_id);
    await sheets.appendRows(consultant.log_sheet_id, 'A:Z', [logRow(consultant, payout, (lines ?? []) as LineLite[], event, actor, balance, note)]);
    return null;
  } catch (e) {
    console.error('log append failed', e);
    return e instanceof Error ? e.message : 'Loggningen misslyckades';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function downloadPdf(db: ReturnType<typeof admin>, path: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from('case-documents').download(path);
  if (error || !data) throw new Error(`Kunde inte hämta PDF:en (${path})`);
  return new Uint8Array(await data.arrayBuffer());
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const kr = (n: unknown) => `${(Number(n) || 0).toLocaleString('sv-SE', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr`;
const isEmail = (v: unknown) => typeof v === 'string' && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v.trim());

function sendSubjects(consultant: any, payout: any) {
  const due = consultantDueDate(payout.invoice_date ?? todayStockholm());
  return {
    due,
    consultant: `Självfaktura ${payout.invoice_number} – ${consultant.payer_name}`,
    payer: `Att betala: självfaktura ${payout.invoice_number} ${consultant.company_name} – ${kr(payout.total_incl_vat)} senast ${due}`,
  };
}

function mailHtml(paragraphs: string[], rows: [string, string][], message?: string): string {
  const p = (t: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;">${t}</p>`;
  return `<!doctype html><html><body style="margin:0;background:#F5F3EE;font-family:Arial,Helvetica,sans-serif;color:#15211B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:24px 28px 8px;">${paragraphs.map(p).join('')}${message ? p(esc(message).replace(/\n/g, '<br>')) : ''}</td></tr>
<tr><td style="padding:0 28px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E4E1D8;">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;font-size:13px;color:#5E6B64;">${esc(k)}</td><td align="right" style="padding:6px 0;font-size:13px;font-weight:600;">${esc(v)}</td></tr>`).join('')}
</table></td></tr></table></td></tr></table></body></html>`;
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

    if (action === 'send') {
      const payout = await loadPayout();
      const consultant = payout.consultants;
      if (!['invoiced', 'sent', 'paid'].includes(payout.status)) return json({ error: 'Fakturan måste vara skapad innan den kan skickas' }, 400);
      if (!payout.invoice_pdf_path) return json({ error: 'Faktura-PDF saknas' }, 400);
      const toConsultant = body?.to_consultant === true;
      const toPayer = body?.to_payer === true;
      const extra: string[] = Array.isArray(body?.extra_emails) ? body.extra_emails.map((e: unknown) => String(e).trim()).filter(Boolean) : [];
      const badExtra = extra.filter(e => !isEmail(e));
      if (badExtra.length) return json({ error: `Ogiltig e-postadress: ${badExtra.join(', ')}` }, 400);
      if (!toConsultant && !toPayer && !extra.length) return json({ error: 'Välj minst en mottagare' }, 400);
      if (toConsultant && !isEmail(consultant.email)) return json({ error: 'Konsulten saknar e-postadress' }, 400);
      if (toPayer && !isEmail(consultant.payer_email)) return json({ error: 'Betalaren saknar e-postadress' }, 400);
      const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 2000) : '';
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      if (!LOVABLE_API_KEY || !RESEND_API_KEY) return json({ error: 'E-posttjänsten är inte konfigurerad' }, 500);

      const isAdvance = payout.kind === 'advance';
      const subjects = sendSubjects(consultant, payout);
      const invoiceName = consultantInvoicePdfName(consultant, payout.invoice_number, payout.invoice_date);
      const invoiceB64 = bytesToBase64(await downloadPdf(db, payout.invoice_pdf_path));
      let specAttachment: { filename: string; content: string } | null = null;
      if (payout.spec_pdf_path && (toPayer || extra.length)) {
        specAttachment = { filename: consultantSpecPdfName(consultant, payout.invoice_number, payout.payout_month), content: bytesToBase64(await downloadPdf(db, payout.spec_pdf_path)) };
      }
      const bank = `${consultant.bank_name ?? ''} ${consultant.bank_account ?? ''}`.trim() || '—';
      const docWord = isAdvance ? 'förskottsfakturan' : 'självfakturan';
      const periodText = isAdvance ? '' : `${payout.payout_month ? ` för ${monthLabel(payout.payout_month)}` : ''}${payout.period_start && payout.period_end ? ` (period ${payout.period_start} – ${payout.period_end})` : ''}`;
      const rows: [string, string][] = [
        ['Fakturanummer', String(payout.invoice_number)],
        ['Netto ex moms', kr(payout.net_amount)],
        [`Moms ${payout.vat_rate ?? 25} %`, kr(payout.vat_amount)],
        ['Totalt att betala', kr(payout.total_incl_vat)],
        ['Förfallodatum', subjects.due],
        ['Betalas till', bank],
      ];
      const cc = isEmail(consultant.cc_email) ? [String(consultant.cc_email).trim()] : undefined;
      const reply_to = isEmail(consultant.payer_email) ? String(consultant.payer_email).trim() : undefined;
      const sendMail = async (to: string[], subject: string, html: string, attachments: { filename: string; content: string }[]) => {
        const r = await fetch(`${GATEWAY_URL}/emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': RESEND_API_KEY },
          body: JSON.stringify({ from: 'Daniel Malke AB via CaseFlow <noreply@smartklimat.org>', to, ...(cc ? { cc } : {}), ...(reply_to ? { reply_to } : {}), subject, html, attachments }),
        });
        if (!r.ok) {
          const t = await r.text();
          console.error(`Resend [${r.status}]: ${t}`);
          throw new Error(`Mejlet kunde inte skickas [${r.status}]: ${t.slice(0, 300)}`);
        }
      };

      const sentTo: string[] = [];
      const errors: string[] = [];
      if (toConsultant) {
        const first = String(consultant.name ?? '').trim().split(/\s+/)[0] || '';
        try {
          await sendMail([String(consultant.email).trim()], subjects.consultant, mailHtml([
            `Hej ${esc(first)},`,
            `Här är ${docWord}${esc(periodText)}. Den betalas senast ${esc(subjects.due)} till ${esc(bank)}.`,
          ], rows, message), [{ filename: invoiceName, content: invoiceB64 }]);
          sentTo.push(String(consultant.email).trim());
        } catch (e) { errors.push(`Till konsulten: ${e instanceof Error ? e.message : e}`); }
      }
      const payerTo = [...(toPayer ? [String(consultant.payer_email).trim()] : []), ...extra];
      if (payerTo.length) {
        try {
          await sendMail(payerTo, subjects.payer, mailHtml([
            `Hej,`,
            `Bifogat finns ${docWord} ${esc(payout.invoice_number)} från ${esc(consultant.company_name)}${esc(periodText)}. Betala ${esc(kr(payout.total_incl_vat))} senast ${esc(subjects.due)} till ${esc(bank)}.`,
            ...(specAttachment ? ['Specifikationen bifogad är intern.'] : []),
          ], rows, message), [{ filename: invoiceName, content: invoiceB64 }, ...(specAttachment ? [specAttachment] : [])]);
          sentTo.push(...payerTo);
        } catch (e) { errors.push(`Till betalaren: ${e instanceof Error ? e.message : e}`); }
      }

      if (sentTo.length) {
        const now = new Date().toISOString();
        const log = Array.isArray(payout.sent_log) ? payout.sent_log : [];
        const kind = [toConsultant && sentTo.includes(String(consultant.email).trim()) ? 'konsult' : null, payerTo.length && sentTo.includes(payerTo[0]) ? 'betalare' : null].filter(Boolean).join('+');
        const { error: upErr } = await db.from('consultant_payouts').update({
          ...(payout.status !== 'paid' ? { status: 'sent' } : {}),
          sent_at: now,
          sent_to: sentTo,
          sent_log: [...log, { at: now, to: [...sentTo, ...(cc ?? [])], by: actor, kind }],
        }).eq('id', payout.id);
        if (upErr) console.error('sent update failed', upErr);
      }
      if (!sentTo.length) return json({ ok: false, error: errors.join(' · '), sent_to: [] }, 502);
      const { data: saved } = await db.from('consultant_payouts').select('*').eq('id', payout.id).single();
      const logError = await appendLog(db, consultant, { ...payout, ...saved }, 'Faktura skickad', actor, `Till: ${[...sentTo, ...(cc ? cc.map(c => `kopia ${c}`) : [])].join(', ')}`);
      if (errors.length) return json({ ok: false, error: errors.join(' · '), sent_to: sentTo, ...(logError ? { log_error: logError } : {}) });
      return json({ ok: true, sent_to: sentTo, ...(logError ? { log_error: logError } : {}) });
    }

    if (action === 'archive') {
      const payout = await loadPayout();
      const consultant = payout.consultants;
      if (!payout.invoice_pdf_path || !payout.invoice_number) return json({ error: 'Faktura-PDF saknas' }, 400);
      const drive = new DriveReader();
      const update: Record<string, unknown> = {};
      const errors: string[] = [];
      const invoiceName = consultantInvoicePdfName(consultant, payout.invoice_number, payout.invoice_date);
      let invoiceBytes: Uint8Array | null = null;
      const getInvoice = async () => (invoiceBytes ??= await downloadPdf(db, payout.invoice_pdf_path));
      const uploadOnce = async (folderId: string, name: string, bytes: () => Promise<Uint8Array>) => {
        const existing = (await drive.listChildren(folderId)).find(f => f.name === name);
        return existing ?? await drive.uploadPdf(folderId, name, await bytes());
      };

      // 1. Löner-månadsmappen
      try {
        let folderId: string | null = payout.drive_month_folder_id;
        if (!folderId && payout.kind === 'advance' && consultant.drive_folder_id) {
          const folders = await drive.listChildren(consultant.drive_folder_id, { foldersOnly: true });
          folderId = folders.sort((a, b) => String(b.createdTime ?? '').localeCompare(String(a.createdTime ?? '')))[0]?.id ?? null;
        }
        if (!folderId) throw new Error('Löner-månadsmapp saknas');
        if (!payout.invoice_drive_file_id) {
          const f = await uploadOnce(folderId, invoiceName, getInvoice);
          update.invoice_drive_file_id = f.id; update.invoice_drive_link = f.webViewLink ?? null;
        }
        if (payout.spec_pdf_path && !payout.spec_drive_file_id) {
          const f = await uploadOnce(folderId, consultantSpecPdfName(consultant, payout.invoice_number, payout.payout_month), () => downloadPdf(db, payout.spec_pdf_path));
          update.spec_drive_file_id = f.id;
        }
      } catch (e) { errors.push(`Löner-mappen: ${e instanceof Error ? e.message : e}`); }

      // 2. Betalarens bokföring (bara fakturan)
      if (!payout.invoice_drive_payer_file_id) {
        try {
          if (!consultant.drive_payer_root_id) throw new Error('Betalarens bokföringsmapp saknas i inställningarna');
          const date = payout.invoice_date ?? todayStockholm();
          const start = Number(consultant.payer_fiscal_start_month) || 9;
          const info = payerFiscalInfo(date, start);
          const year = pickPayerYearFolder(await drive.listChildren(consultant.drive_payer_root_id, { foldersOnly: true }), date, start);
          if (!year) throw new Error(`Räkenskapsårsmappen för ${info.ym} saknas i betalarens bokföring`);
          const month = pickPayerMonthFolder(await drive.listChildren(year.id, { foldersOnly: true }), date, start);
          if (!month) throw new Error(`Månadsmappen ${info.monthTitle} saknas i betalarens bokföring`);
          const f = await uploadOnce(month.id, invoiceName, getInvoice);
          update.invoice_drive_payer_file_id = f.id; update.invoice_drive_payer_link = f.webViewLink ?? null; update.invoice_drive_payer_folder = month.name;
        } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
      }

      update.archive_error = errors.length ? errors.join(' · ') : null;
      const { error: upErr } = await db.from('consultant_payouts').update(update).eq('id', payout.id);
      if (upErr) throw new Error(upErr.message);
      const { data: saved } = await db.from('consultant_payouts').select('*').eq('id', payout.id).single();
      let logError: string | null = null;
      if (update.invoice_drive_file_id || update.invoice_drive_payer_file_id) {
        logError = await appendLog(db, consultant, { ...payout, ...saved }, 'Arkiverad i Drive', actor,
          [saved?.invoice_drive_payer_link ? `Betalaren: ${saved.invoice_drive_payer_link}` : '', saved?.invoice_drive_link ? `Löner: ${saved.invoice_drive_link}` : ''].filter(Boolean).join(' · '));
      }
      return json({
        ok: !errors.length,
        invoice_drive_link: saved?.invoice_drive_link ?? null,
        invoice_drive_payer_link: saved?.invoice_drive_payer_link ?? null,
        ...(errors.length ? { archive_error: update.archive_error } : {}),
        ...(logError ? { log_error: logError } : {}),
      });
    }

    if (action === 'log_backfill') {
      if (!body?.consultant_id) return json({ error: 'consultant_id saknas' }, 400);
      const { data: consultant, error: cErr } = await db.from('consultants').select('*').eq('id', body.consultant_id).maybeSingle();
      if (cErr || !consultant) return json({ error: 'Konsulten hittades inte' }, 400);
      if (!consultant.log_sheet_id) return json({ error: 'Loggarket saknas' }, 400);
      if (consultant.log_backfilled_at) return json({ ok: true, skipped: true });
      const [{ data: payouts }, { data: loans }] = await Promise.all([
        db.from('consultant_payouts').select('*').eq('consultant_id', consultant.id).neq('status', 'draft'),
        db.from('consultant_loans').select('*').eq('consultant_id', consultant.id).is('payout_id', null),
      ]);
      const ids = (payouts ?? []).map(p => p.id);
      const { data: allLines } = ids.length
        ? await db.from('consultant_payout_lines').select('payout_id,kind,label,amount,included').in('payout_id', ids)
        : { data: [] as any[] };
      type Ev = { date: string; no: number; seq: number; kind: 'payout' | 'loan'; row: any };
      const events: Ev[] = [
        ...(payouts ?? []).map((p, i) => ({ date: String(p.invoice_date ?? p.created_at ?? '').slice(0, 10), no: Number(p.invoice_number) || 0, seq: i, kind: 'payout' as const, row: p })),
        ...(loans ?? []).map((l, i) => ({ date: String(l.date ?? '').slice(0, 10), no: 0, seq: 100000 + i, kind: 'loan' as const, row: l })),
      ].sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no || a.seq - b.seq);
      let balance = 0;
      const rows: Row[] = events.map(ev => {
        if (ev.kind === 'payout') {
          balance += Number(ev.row.loan_change) || 0;
          const lines = (allLines ?? []).filter((l: any) => l.payout_id === ev.row.id) as LineLite[];
          return logRow(consultant, ev.row, lines, ev.row.kind === 'advance' ? 'Importerat förskott' : 'Importerad faktura', actor, balance);
        }
        balance += Number(ev.row.amount) || 0;
        const r = logRow(consultant, { kind: 'loan' }, [], 'Lånerad (import)', actor, balance, ev.row.note ?? '');
        r[17] = ev.row.date ?? '';
        r[Number(ev.row.amount) < 0 ? 11 : 12] = Math.abs(Number(ev.row.amount));
        return r;
      });
      const sheets = new SheetsClient();
      await sheets.ensureHeader(consultant.log_sheet_id);
      if (rows.length) await sheets.appendRows(consultant.log_sheet_id, 'A:Z', rows);
      const { error: upErr } = await db.from('consultants').update({ log_backfilled_at: new Date().toISOString() }).eq('id', consultant.id);
      if (upErr) throw new Error(upErr.message);
      return json({ ok: true, rows: rows.length });
    }

    return json({ error: `Okänd action: ${action}` }, 400);
  } catch (e) {
    console.error('consultant-payout error', e);
    return json({ error: e instanceof Error ? e.message : 'Okänt fel' }, 500);
  }
});
