// parse-a-order-invoice
// Accepts a montör's invoice PDF (base64) and extracts structured invoice data
// using the Lovable AI Gateway (Google Gemini).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `Du extraherar data ur en svensk FAKTURA från en montör (underentreprenör) som fakturerar
SmartKlimat / N3prenad för fönstermontage. Returnera ENBART ett JSON-objekt (ingen text/markdown):

{ "invoice_number": string|null, "date": "YYYY-MM-DD"|null, "customer_address": string|null,
  "recipient_company": string|null, "recipient_org_nr": string|null,
  "total_amount": number|null, "moms": number|null,
  "team_prefix": string|null,
  "line_items": [ { "name": string, "unit_price": number|null, "quantity": number|null, "sum": number|null } ] }

Regler:
- customer_address = slutkundens adress (gata + nummer) som arbetet utförts på, INTE montörens eller mottagarens.
- recipient_company / recipient_org_nr = montörens (avsändarens) företagsnamn och org.nr.
- team_prefix = ev. bokstavsprefix i fakturanumret (t.ex. "GVMO" i "GVMO-014"), annars null.
- total_amount = totalsumman EXKL moms om det framgår, annars inkl moms. moms = momsbeloppet om det syns.
- Belopp = tal med punkt som decimaltecken. Svenska tusentalsmellanslag tolkas.
- Datum ISO. Saknas värde → null.`;

import { createClient } from 'npm:@supabase/supabase-js@2';
async function requireStaff(req: Request): Promise<Response | null> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
  if (error || !data?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: r } = await admin.from('user_roles').select('role,is_admin').eq('user_id', data.claims.sub).maybeSingle();
  if (!(r?.is_admin || r?.role === 'seller' || r?.role === 'coordinator')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authFail = await requireStaff(req);
    if (authFail) return authFail;
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json({ error: 'LOVABLE_API_KEY not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const file_base64 = body?.file_base64;
    if (!file_base64 || typeof file_base64 !== 'string') {
      return json({ error: 'file_base64 krävs' }, 400);
    }
    const mime = body?.mime_type || 'application/pdf';
    const dataUrl = `data:${mime};base64,${file_base64}`;

    const aiRes = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: 'Extrahera fakturadata och returnera JSON enligt schemat.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ] },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error('AI gateway error', aiRes.status, text);
      if (aiRes.status === 429) return json({ error: 'AI är överbelastad just nu. Försök igen om en stund.' }, 429);
      if (aiRes.status === 402) return json({ error: 'AI-krediter slut. Fyll på krediter i workspace.' }, 402);
      return json({ error: `AI-fel (${aiRes.status})`, detail: text.slice(0, 500) }, 500);
    }
    const aiData = await aiRes.json();
    const content: string | undefined = aiData?.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'Tom AI-respons' }, 500);

    const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); } catch (e) {
      console.error('JSON parse failed', e, content);
      return json({ error: 'Kunde inte tolka AI-svaret som JSON', raw: content.slice(0, 500) }, 422);
    }

    const num = (v: any) => (v == null || v === '' ? null : Number(v));
    const line_items = Array.isArray(parsed.line_items) ? parsed.line_items.map((li: any) => ({
      name: String(li?.name ?? ''),
      unit_price: num(li?.unit_price),
      quantity: num(li?.quantity),
      sum: num(li?.sum),
    })).filter((li: any) => li.name) : [];

    return json({
      invoice_number: parsed.invoice_number ?? null,
      date: parsed.date ?? null,
      customer_address: parsed.customer_address ?? null,
      recipient_company: parsed.recipient_company ?? null,
      recipient_org_nr: parsed.recipient_org_nr ?? null,
      total_amount: num(parsed.total_amount),
      moms: num(parsed.moms),
      team_prefix: parsed.team_prefix ?? null,
      line_items,
    }, 200);
  } catch (e) {
    console.error('parse-a-order-invoice error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
