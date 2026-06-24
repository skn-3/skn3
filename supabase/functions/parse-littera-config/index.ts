// Edge function: parse-littera-config
// Reads ONE littera's configuration block from Mockfjärds KP and updates the row.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireStaff } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `Du läser Mockfjärds konfigurationsdetalj för ett fönster/en dörr. Extrahera mått och alla specifikationer. Returnera ENBART JSON:
{ width:number|null, width_mod:string|null, height:number|null, height_mod:string|null,
  brostning:number|null, brostning_mod:string|null, vikt:number|null,
  set_number:number|null, set_position:number|null,
  spec: { glas, sprojs, spaltventil, spartyp, karmskruvhal, forankring, integrerad_fonsterbank,
    los_fonsterbank, invandig_list, invandig_smyg, utvandigt_foder, utvandig_smyg,
    utvandig_listprofil, trakulor, alukulor, handtag, ventilationsbeslag, profil } }
Ta med ALLA rader du ser i spec (även sådana som inte finns i listan ovan — lägg dem som egna nycklar med begripliga namn). Utelämna nycklar du inte hittar. Modulmått-väljaren (t.ex. 'Modulmått - 17' / 'Ej modulmått') hör till respektive *_mod-fält. Använd svensk decimalkomma korrekt.`;

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

    const body = await req.json() as { littera_id?: string; image_base64?: string; mime_type?: string; text?: string };
    if (!body?.littera_id) return json({ error: 'littera_id is required' }, 400);
    if (!body?.image_base64 && !body?.text) return json({ error: 'image_base64 or text is required' }, 400);

    const userContent: any[] = [{ type: 'text', text: 'Extrahera konfigurationen och returnera JSON enligt schemat.' }];
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

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Fetch existing row to merge snapshot
    const { data: existing, error: fetchErr } = await admin
      .from('litteror')
      .select('imported_snapshot')
      .eq('id', body.littera_id)
      .maybeSingle();
    if (fetchErr) {
      console.error('fetch littera failed', fetchErr);
      return json({ error: 'Kunde inte hämta littera', detail: fetchErr.message }, 500);
    }

    const updates: Record<string, unknown> = {
      spec: parsed.spec && typeof parsed.spec === 'object' ? parsed.spec : {},
    };
    const width = num(parsed.width);
    const height = num(parsed.height);
    const brostning = num(parsed.brostning);
    const vikt = num(parsed.vikt);
    if (width != null) updates.width = width;
    if (parsed.width_mod != null) updates.width_mod = parsed.width_mod;
    if (height != null) updates.height = height;
    if (parsed.height_mod != null) updates.height_mod = parsed.height_mod;
    if (brostning != null) updates.brostning = brostning;
    if (parsed.brostning_mod != null) updates.brostning_mod = parsed.brostning_mod;
    if (vikt != null) updates.vikt = vikt;
    if (parsed.set_number != null) updates.set_number = Number(parsed.set_number);
    if (parsed.set_position != null) updates.set_position = Number(parsed.set_position);

    const prevSnap = (existing?.imported_snapshot as Record<string, unknown> | null) ?? {};
    const mergedSnap = {
      ...prevSnap,
      width: width ?? (prevSnap as any).width ?? null,
      width_mod: parsed.width_mod ?? (prevSnap as any).width_mod ?? null,
      height: height ?? (prevSnap as any).height ?? null,
      height_mod: parsed.height_mod ?? (prevSnap as any).height_mod ?? null,
      brostning: brostning ?? (prevSnap as any).brostning ?? null,
      brostning_mod: parsed.brostning_mod ?? (prevSnap as any).brostning_mod ?? null,
      vikt: vikt ?? (prevSnap as any).vikt ?? null,
      set_number: parsed.set_number ?? (prevSnap as any).set_number ?? null,
      set_position: parsed.set_position ?? (prevSnap as any).set_position ?? null,
      spec: updates.spec,
    };
    updates.imported_snapshot = mergedSnap;

    const { error: updErr } = await admin
      .from('litteror')
      .update(updates)
      .eq('id', body.littera_id);
    if (updErr) {
      console.error('update littera failed', updErr);
      return json({ error: 'Kunde inte uppdatera littera', detail: updErr.message }, 500);
    }

    return json({ ok: true, updates });
  } catch (e) {
    console.error('parse-littera-config error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
