// Edge function: parse-littera-overview
// Reads a Mockfjärds KP overview screenshot/text and inserts one littera per object.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireStaff } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `Du läser Mockfjärds kundportals översiktstabell över littera (fönster/dörrar). Kolumner: Littera | Artikel (namn + artikelkod) | U-värde | Antal | Set | Storlek (bredd x höjd, ibland /bröstning) | Kulör (Insida/Utsida). Returnera ENBART JSON:
{ litteror: [ { littera, article_name, article_code, antal:number, u_varde:number|null,
  width:number|null, height:number|null, brostning:number|null,
  set_number:number|null, set_position:number|null, set_lead:boolean,
  color_inside:string|null, color_outside:string|null } ] }
set_lead = true om littera har en stjärna (settets ledare). Tolka 'Set:1' → set_number 1. Använd svensk decimalkomma korrekt (1,1 = 1.1).`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireStaff(req, corsHeaders);
    if (auth.response) return auth.response;

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json({ error: 'LOVABLE_API_KEY not configured' }, 500);

    const body = await req.json() as { case_id?: string; image_base64?: string; mime_type?: string; text?: string };
    if (!body?.case_id) return json({ error: 'case_id is required' }, 400);
    if (!body?.image_base64 && !body?.text) return json({ error: 'image_base64 or text is required' }, 400);

    const userContent: any[] = [{ type: 'text', text: 'Extrahera littera-översikten och returnera JSON enligt schemat.' }];
    if (body.image_base64) {
      const dataUrl = `data:${body.mime_type || 'image/png'};base64,${body.image_base64}`;
      userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
    if (body.text) userContent.push({ type: 'text', text: body.text });

    const aiRes = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
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

    const items: any[] = Array.isArray(parsed.litteror) ? parsed.litteror : [];
    if (items.length === 0) return json({ error: 'Inga littera hittades i bilden/texten' }, 422);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const rows = items.map((it, idx) => {
      const snap = {
        littera: it?.littera ?? null,
        article_name: it?.article_name ?? null,
        article_code: it?.article_code ?? null,
        antal: it?.antal != null ? Number(it.antal) : 1,
        u_varde: num(it?.u_varde),
        width: num(it?.width),
        height: num(it?.height),
        brostning: num(it?.brostning),
        set_number: it?.set_number != null ? Number(it.set_number) : null,
        set_position: it?.set_position != null ? Number(it.set_position) : null,
        set_lead: !!it?.set_lead,
        color_inside: it?.color_inside ?? null,
        color_outside: it?.color_outside ?? null,
      };
      return {
        case_id: body.case_id,
        sort_order: idx,
        ...snap,
        spec: {},
        imported_snapshot: snap,
        cm_status: 'ej_paborjad',
      };
    });

    const { data: inserted, error: insErr } = await admin.from('litteror').insert(rows).select('id');
    if (insErr) {
      console.error('insert litteror failed', insErr);
      return json({ error: 'Kunde inte spara littera', detail: insErr.message }, 500);
    }

    return json({ inserted: inserted?.length ?? 0, litteror: items });
  } catch (e) {
    console.error('parse-littera-overview error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
