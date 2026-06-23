// Edge function: parse-offer-text
// Tar emot fritext om ett jobb och returnerar ett strukturerat offertförslag.
// Speglar extract-ue-offer (Lovable AI Gateway, gemini-2.5-flash, json_object, requireStaff).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `Du skapar en strukturerad offert från fritext skriven av en svensk hantverkare/säljare. Extrahera det som FAKTISKT står i texten — hitta ALDRIG på priser. Saknas ett pris → unit_price och amount = null. is_labor per rad: true = arbetskostnad (montage, målning, rivning, installation, 'arbete'); false = material/övrigt (material, ställning, servicebil, transport, frakt, sophantering, städning, maskinhyra).

Returnera ENBART JSON (ingen markdown):
{
  customer_type: 'privat'|'foretag',
  customer_name: string|null,
  customer_email: string|null,
  customer_phone: string|null,
  customer_address: string|null,
  customer_personnummer: string|null,
  fastighetsbeteckning: string|null,
  title: string|null,
  description: string|null,
  vat_mode: 'vanlig'|'omvand',
  rot_suggested: boolean,
  line_items: [ { description: string, is_labor: boolean, qty: number|null, unit: string|null, unit_price: number|null, amount: number|null } ]
}

Belopp = tal med punkt som decimaltecken, tolka svenska tusentalsmellanslag. Default qty = 1 om antal ej anges. is_labor alltid boolean.`;

import { requireStaff } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireStaff(req, corsHeaders);
    if (auth.response) return auth.response;
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json({ error: 'LOVABLE_API_KEY not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const text = (body?.text ?? '').toString().trim();
    if (!text) return json({ error: 'text is required' }, 400);

    const aiRes = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error('AI gateway error', aiRes.status, t);
      if (aiRes.status === 429) return json({ error: 'AI är överbelastad just nu. Försök igen om en stund.' }, 429);
      if (aiRes.status === 402) return json({ error: 'AI-krediter slut. Fyll på krediter i workspace.' }, 402);
      return json({ error: `AI-fel (${aiRes.status})`, detail: t.slice(0, 500) }, 500);
    }

    const aiData = await aiRes.json();
    const content: string | undefined = aiData?.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'Tom AI-respons' }, 500);

    const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); }
    catch (e) {
      console.error('JSON parse failed', e, content);
      return json({ error: 'Kunde inte tolka AI-svaret som JSON', raw: content.slice(0, 500) }, 422);
    }

    const num = (v: any) => (v == null || v === '' ? null : Number(v));
    const line_items = Array.isArray(parsed.line_items) ? parsed.line_items.map((li: any) => ({
      description: li?.description ?? '',
      is_labor: li?.is_labor === true,
      qty: num(li?.qty),
      unit: li?.unit ?? null,
      unit_price: num(li?.unit_price),
      amount: num(li?.amount),
    })) : [];

    return json({
      customer_type: parsed.customer_type === 'foretag' ? 'foretag' : 'privat',
      customer_name: parsed.customer_name ?? null,
      customer_email: parsed.customer_email ?? null,
      customer_phone: parsed.customer_phone ?? null,
      customer_address: parsed.customer_address ?? null,
      customer_personnummer: parsed.customer_personnummer ?? null,
      fastighetsbeteckning: parsed.fastighetsbeteckning ?? null,
      title: parsed.title ?? null,
      description: parsed.description ?? null,
      vat_mode: parsed.vat_mode === 'omvand' ? 'omvand' : 'vanlig',
      rot_suggested: parsed.rot_suggested === true,
      line_items,
    }, 200);
  } catch (e) {
    console.error('parse-offer-text error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
