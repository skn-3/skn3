// Edge function: consultant-self
// Konsultens egen läsvy ("Min lön"). Inloggad användare kopplad via consultants.user_id.
// Endast läsning; PDF:er nås via kortlivade signerade länkar.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { consultantInvoicePdfName, consultantSpecPdfName } from '../_shared/pdfNames.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const LINE_COLS = 'id, payout_id, kind, label, amount, doc_type, issuer, doc_date, reg_nr, doc_number, included, sort';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAuth(req, corsHeaders);
    if (auth.response) return auth.response;
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const { data: consultant } = await db.from('consultants').select('*').eq('user_id', auth.userId).maybeSingle();
    if (!consultant) return json({ error: 'Ingen konsult kopplad till din inloggning' }, 404);

    if (action === 'overview') {
      const [prev, pays, lns] = await Promise.all([
        db.from('consultant_previews').select('*').eq('consultant_id', consultant.id).maybeSingle(),
        db.from('consultant_payouts').select('*').eq('consultant_id', consultant.id).neq('status', 'draft')
          .order('payout_month', { ascending: false, nullsFirst: false })
          .order('invoice_number', { ascending: false, nullsFirst: false }),
        db.from('consultant_loans').select('id, date, amount, note, invoice_number, created_at').eq('consultant_id', consultant.id)
          .order('date').order('created_at'),
      ]);
      const payouts = pays.data ?? [];
      const ids = payouts.map(p => p.id);
      const { data: lines } = ids.length
        ? await db.from('consultant_payout_lines').select(LINE_COLS).in('payout_id', ids).order('sort')
        : { data: [] as any[] };
      let running = 0;
      const loans = (lns.data ?? []).map(l => { running = Math.round((running + Number(l.amount)) * 100) / 100; return { ...l, balance: running }; });
      const year = String(new Date().getFullYear());
      const paidThisYear = payouts
        .filter(p => p.kind === 'payout' && p.status === 'paid' && String(p.invoice_date ?? '').startsWith(year))
        .reduce((s, p) => s + (Number(p.net_amount) || 0), 0);
      return json({
        consultant: {
          id: consultant.id, name: consultant.name, company_name: consultant.company_name, payer_name: consultant.payer_name,
          standard_deductions: consultant.standard_deductions, commission_tiers: consultant.commission_tiers,
        },
        preview: prev.data ?? null,
        payouts: payouts.map(p => {
          const { invoice_drive_link: _a, invoice_drive_file_id: _b, sent_to: _c, ...rest } = p as Record<string, unknown>;
          return { ...rest, lines: (lines ?? []).filter((l: any) => l.payout_id === p.id) };
        }),
        loans,
        loan_balance: running,
        paid_this_year: Math.round(paidThisYear * 100) / 100,
      });
    }

    if (action === 'pdf') {
      const which = body?.which;
      if (!body?.payout_id || (which !== 'invoice' && which !== 'spec')) return json({ error: 'payout_id och which krävs' }, 400);
      const { data: p } = await db.from('consultant_payouts').select('*').eq('id', body.payout_id).maybeSingle();
      if (!p || p.consultant_id !== consultant.id || p.status === 'draft') return json({ error: 'Utbetalningen hittades inte' }, 404);
      const path = which === 'invoice' ? p.invoice_pdf_path : p.spec_pdf_path;
      if (!path) return json({ error: 'PDF:en saknas' }, 404);
      const name = which === 'invoice'
        ? consultantInvoicePdfName(consultant, p.invoice_number, p.invoice_date)
        : consultantSpecPdfName(consultant, p.invoice_number, p.payout_month);
      const { data, error } = await db.storage.from('case-documents').createSignedUrl(path, 600, { download: name });
      if (error || !data?.signedUrl) return json({ error: error?.message ?? 'Kunde inte skapa länk' }, 500);
      return json({ url: data.signedUrl });
    }

    return json({ error: 'Okänd action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
