// Edge function: parse-mockfjards-invoice
// Reads ONE Mockfjärds self-invoice PDF and returns structured data.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `Du läser en svensk självfaktura där Smart Klimat N3prenad är säljare och Mockfjärds Fönster AB är kund (omvänd moms, belopp är ex moms). Raderna har kolumnerna: Fsg. order | Namn | Notering | Kvt | á pris | Belopp. Returnera ENBART JSON, ingen markdown:
{
  invoice_number: string|null,        // t.ex. 'MIKH0132'
  invoice_date: 'YYYY-MM-DD'|null,
  sales_order_number: string|null,    // 'Fsg. order' på första raden (t.ex. '20520086')
  customer_name: string|null,         // 'Namn'-kolumnen (slutkunden, t.ex. 'Isho Lindgren')
  team_prefix: string|null,           // inledande bokstäver i invoice_number (t.ex. 'MIKH')
  total_amount: number|null,          // raden 'Total' / 'Försäljningssaldo'
  line_items: [ { name: string,       // 'Notering'
                  unit_price: number, // 'á pris'
                  qty: number,        // 'Kvt'
                  amount: number } ]  // 'Belopp'
}
Ignorera adressblocken (säljaren=oss i Segeltorp, kunden=Mockfjärds i Borlänge) — de är INTE jobbadressen. Plocka belopp med svensk decimalkomma korrekt (469,20 = 469.20).`;

import { requireStaff } from '../_shared/auth.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireStaff(req, corsHeaders);
    if (auth.response) return auth.response;
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json({ error: 'LOVABLE_API_KEY not configured' }, 500);

    const body = await req.json() as { file_base64?: string; mime_type?: string };
    if (!body?.file_base64) return json({ error: 'file_base64 is required' }, 400);
    const dataUrl = `data:${body.mime_type || 'application/pdf'};base64,${body.file_base64}`;

    const aiRes = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: 'Extrahera datan från denna Mockfjärds självfaktura och returnera JSON enligt schemat.' },
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

    const lines = Array.isArray(parsed.line_items) ? parsed.line_items : [];
    const normalizedLines = lines.map((li: any) => ({
      name: li?.name ?? '',
      unit_price: li?.unit_price != null ? Number(li.unit_price) : 0,
      qty: li?.qty != null ? Number(li.qty) : 1,
      amount: li?.amount != null ? Number(li.amount) : 0,
    }));

    const invoiceNumber: string | null = parsed.invoice_number ?? null;
    let teamPrefix: string | null = parsed.team_prefix ?? null;
    if (!teamPrefix && invoiceNumber) {
      const m = /^([A-Za-z]+)/.exec(invoiceNumber);
      teamPrefix = m ? m[1] : null;
    }

    return json({
      invoice_number: invoiceNumber,
      invoice_date: parsed.invoice_date ?? null,
      sales_order_number: parsed.sales_order_number != null ? String(parsed.sales_order_number) : null,
      customer_name: parsed.customer_name ?? null,
      team_prefix: teamPrefix,
      total_amount: parsed.total_amount != null ? Number(parsed.total_amount) : null,
      line_items: normalizedLines,
    });
  } catch (e) {
    console.error('parse-mockfjards-invoice error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
