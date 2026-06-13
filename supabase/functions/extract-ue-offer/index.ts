// Edge function: extract-ue-offer
// Accepts a subcontractor (UE) offer PDF (base64) and returns extracted structured data
// using the Lovable AI Gateway (Google Gemini). Mirrors extract-payout.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `Du extraherar data ur en svensk OFFERT från en underentreprenör (UE) ställd till oss (Smartklimat / n3prenad).
Det är ett anbud, vanligtvis ex moms (B2B). Jobbet kan röra EN eller FLERA fastigheter/adresser och flera
arbetsmoment (rivning, tak, plåt, ställning, måleri, fönster m.m.).

KLASSIFICERING is_labor (per rad och per summary-rad):
- is_labor = true  → ARBETSKOSTNAD (ROT-grundande): montage, målning, rivning, installation, "arbete", "arbetskostnad".
- is_labor = false → MATERIAL/ÖVRIGT (EJ ROT): material, förbrukningsmaterial, ställning/ställningshyra,
  servicebil, transport/resor, frakt, sophantering/bortforsling, städning, maskinhyra.

För VARJE prisrad, plocka ut: address (gata + nummer om raden hör till en specifik fastighet, annars null),
category (kort arbetsmoment om det framgår, annars null), description (benämning, gärna utan adressen),
qty, unit, unit_price, amount (tal om de finns, annars null; amount = radens summa ex moms), is_labor (boolean enligt ovan).

Skapa DESSUTOM en SAMMANFATTNING (summary) med få rader vi kan visa kunden: gruppera per arbetsmoment/adress.
För varje grupp ska du skapa SEPARATA rader för ARBETE (is_labor: true) och MATERIAL/ÖVRIGT (is_labor: false)
när båda förekommer (t.ex. "Takbyte – Storgatan 1, arbete" + "Takbyte – Storgatan 1, material"). Om gruppen
bara innehåller en typ räcker en rad. Varje summary-rad: { label: kort text, amount: summa ex moms av ingående
rader, is_labor: boolean }. Summan av alla summary-rader ska motsvara total_excl_vat.

Returnera ENBART ett JSON-objekt (ingen text/markdown/kodblock):
{ "supplier_name": string|null, "offer_number": string|null, "offer_date": "YYYY-MM-DD"|null,
  "currency": "SEK", "total_excl_vat": number|null, "total_incl_vat": number|null,
  "line_items": [ { "address": string|null, "category": string|null, "description": string|null,
    "qty": number|null, "unit": string|null, "unit_price": number|null, "amount": number|null, "is_labor": boolean } ],
  "summary": [ { "label": string, "amount": number, "is_labor": boolean } ] }

Regler: belopp = tal (punkt som decimaltecken), tolka svenska tusentalsmellanslag. total_excl_vat = UE:s
summa EXKL moms. supplier_name = UE-bolagets namn (avsändaren), INTE vårt bolag. offer_date ISO. Saknas → null.
is_labor är alltid boolean (default false vid osäkerhet).`;

interface ExtractRequest {
  file_base64: string;
  mime_type?: string;
  file_name?: string;
}

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authFail = await requireStaff(req);
    if (authFail) return authFail;
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return json({ error: 'LOVABLE_API_KEY not configured' }, 500);
    }

    const body = (await req.json()) as ExtractRequest;
    if (!body?.file_base64) {
      return json({ error: 'file_base64 is required' }, 400);
    }
    const mime = body.mime_type || 'application/pdf';
    const dataUrl = `data:${mime};base64,${body.file_base64}`;

    const aiRes = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extrahera datan från denna UE-offert och returnera JSON enligt schemat.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error('AI gateway error', aiRes.status, text);
      if (aiRes.status === 429) {
        return json({ error: 'AI är överbelastad just nu. Försök igen om en stund.' }, 429);
      }
      if (aiRes.status === 402) {
        return json({ error: 'AI-krediter slut. Fyll på krediter i workspace.' }, 402);
      }
      return json({ error: `AI-fel (${aiRes.status})`, detail: text.slice(0, 500) }, 500);
    }

    const aiData = await aiRes.json();
    const content: string | undefined = aiData?.choices?.[0]?.message?.content;
    if (!content) {
      return json({ error: 'Tom AI-respons' }, 500);
    }

    const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('JSON parse failed', e, content);
      return json({ error: 'Kunde inte tolka AI-svaret som JSON', raw: content.slice(0, 500) }, 422);
    }

    const num = (v: any) => (v == null || v === '' ? null : Number(v));

    const line_items = Array.isArray(parsed.line_items) ? parsed.line_items.map((li: any) => ({
      address: li?.address ?? null,
      category: li?.category ?? null,
      description: li?.description ?? null,
      qty: num(li?.qty),
      unit: li?.unit ?? null,
      unit_price: num(li?.unit_price),
      amount: num(li?.amount),
      is_labor: li?.is_labor === true,
    })) : [];

    const summary = Array.isArray(parsed.summary) ? parsed.summary.map((s: any) => ({
      label: String(s?.label ?? ''),
      amount: Number(s?.amount ?? 0),
      is_labor: s?.is_labor === true,
    })).filter((s: any) => s.label) : [];

    return json({
      supplier_name: parsed.supplier_name ?? null,
      offer_number: parsed.offer_number ?? null,
      offer_date: parsed.offer_date ?? null,
      currency: parsed.currency ?? 'SEK',
      total_excl_vat: num(parsed.total_excl_vat),
      total_incl_vat: num(parsed.total_incl_vat),
      line_items,
      summary,
    }, 200);
  } catch (e) {
    console.error('extract-ue-offer error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
