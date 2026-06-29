// Edge function: parse-littera-overview
// Läser Mockfjärds KP (översiktslista ELLER expanderad littera med Konfiguration)
// och lägger till/uppdaterar littera ADDITIVT. Tillbehör lagras i spec.tillbehor.
// imported_snapshot = immutabel baslinje (inkl. tillbehör) för diffen i steg 3.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireStaff } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `Du läser Mockfjärds kundportal (KP) och extraherar littera (fönster/dörrar) till JSON.

Indata är antingen:
(A) en ÖVERSIKTSLISTA med flera littera-rader. Kolumner: Littera | Artikel (namn + artikelkod) | U-värde | Antal | Set | Storlek (bredd x höjd, ibland /bröstning) | Kulör (Insida/Utsida), eller
(B) en ENSKILD littera (en rubrikrad enligt ovan) följd av ett "Konfiguration"-block som listar tillbehör.
En screenshot kan visa flera rader OCH ett Konfiguration-block; blocket hör då till den littera vars Storlek matchar måtten i blocket (annars den littera blocket står direkt under).

Returnera ENBART JSON, inga kodstaket:
{ "litteror": [ {
  "littera": string,
  "article_name": string|null, "article_code": string|null,
  "antal": number,
  "u_varde": number|null,
  "width": number|null,
  "height": number|null,
  "brostning": number|null,
  "set_number": number|null, "set_position": number|null, "set_lead": boolean,
  "color_inside": string|null,
  "color_outside": string|null,
  "tillbehor": [ {
    "typ": "foder"|"smyg"|"fonsterbank"|"sockellist"|"plisse"|"l_profil"|"ovrigt",
    "placering": "invandig"|"utvandig"|null,
    "material": string|null,
    "dimension": string|null,
    "matt": string|null,
    "kulor": string|null,
    "note": string|null
  } ]
} ] }

Tillbehörsregler (rader i Konfiguration som börjar med "-" eller "^"):
- "Foder ..." => typ "foder", placering "invandig". "Råplan Foder ..." => typ "foder", placering "utvandig".
- "Smyg ..." => typ "smyg", placering "invandig". "Råplan Smyg ..." => typ "smyg", placering "utvandig".
- "...fönsterbänk" / "Integrerad fönsterbänk ..." => typ "fonsterbank", placering null.
- "Sockellist ..." => typ "sockellist".
- "Plissé ..." (även rad som börjar med F-kod, t.ex. "F1AS1A: Plissé ...") => typ "plisse", placering null. F-koden och "förspänd Mörkläggande" i note.
- "L-Profil" => typ "l_profil".
- Annat tillbehör => typ "ovrigt".
- Rad "^ NNN x NNN mm (bredd x höjd)" direkt under ett tillbehör = dess "matt".
- Rad "^ Kulör: X" direkt under ett tillbehör = dess "kulor".
- dimension = "NNxNN"-talet i raden. material = de beskrivande orden utan dimension.
- IGNORERA: Vikt, "Profilerad profil", Glas, Spröjs, Klickventil, Spår, "Bilden visas ifrån...". Fönstrets eget handtag/beslag behöver inte bli tillbehör. Fokus: foder, smyg, fönsterbänk, sockellist, plissé, plåt/L-profil.

Svensk decimalkomma (1,09 = 1.09). Måtten är heltal mm.`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normTillbehor(arr: unknown): any[] {
  if (!Array.isArray(arr)) return [];
  const okTyp = new Set(['foder', 'smyg', 'fonsterbank', 'sockellist', 'plisse', 'l_profil', 'ovrigt']);
  const okPlac = new Set(['invandig', 'utvandig']);
  const s = (v: unknown) => { const x = (v ?? '').toString().trim(); return x === '' ? null : x; };
  return arr
    .map((t: any) => ({
      typ: okTyp.has(t?.typ) ? t.typ : 'ovrigt',
      placering: okPlac.has(t?.placering) ? t.placering : null,
      material: s(t?.material),
      dimension: s(t?.dimension),
      matt: s(t?.matt),
      kulor: s(t?.kulor),
      note: s(t?.note),
    }))
    .filter((t) => t.material || t.dimension || t.matt || t.kulor || t.note || t.typ !== 'ovrigt');
}

function buildSnap(it: any) {
  return {
    littera: it?.littera ?? null,
    article_name: it?.article_name ?? null,
    article_code: it?.article_code ?? null,
    antal: num(it?.antal) ?? 1,
    u_varde: num(it?.u_varde),
    width: num(it?.width),
    height: num(it?.height),
    brostning: num(it?.brostning),
    set_number: num(it?.set_number),
    set_position: num(it?.set_position),
    set_lead: !!it?.set_lead,
    color_inside: it?.color_inside ?? null,
    color_outside: it?.color_outside ?? null,
    tillbehor: normTillbehor(it?.tillbehor),
  };
}

function overviewCols(snap: any) {
  const { tillbehor: _ignore, ...cols } = snap;
  return cols;
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

    const userContent: any[] = [{ type: 'text', text: 'Extrahera littera (översikt + ev. tillbehör) och returnera JSON enligt schemat.' }];
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

    const { data: existing, error: exErr } = await admin
      .from('litteror')
      .select('id, littera, cm_status, sort_order')
      .eq('case_id', body.case_id);
    if (exErr) {
      console.error('fetch existing litteror failed', exErr);
      return json({ error: 'Kunde inte läsa befintliga littera', detail: exErr.message }, 500);
    }

    const byName = new Map<string, { id: string; cm_status: string; sort_order: number }>();
    let maxSort = -1;
    for (const e of existing ?? []) {
      if (e.littera) byName.set(String(e.littera).trim().toLowerCase(), e as any);
      if ((e.sort_order ?? 0) > maxSort) maxSort = e.sort_order ?? 0;
    }

    let added = 0, updated = 0, skipped = 0;
    const inserts: any[] = [];
    const seen = new Set<string>();

    for (const it of items) {
      const snap = buildSnap(it);
      const cols = overviewCols(snap);
      const tillbehor = snap.tillbehor;
      const key = (it?.littera ?? '').toString().trim().toLowerCase();
      const match = key ? byName.get(key) : undefined;

      if (match) {
        if (match.cm_status === 'ej_paborjad') {
          const { error } = await admin
            .from('litteror')
            .update({ ...cols, spec: { tillbehor }, imported_snapshot: snap })
            .eq('id', match.id);
          if (error) { console.error('update littera failed', error); return json({ error: 'Kunde inte uppdatera littera', detail: error.message }, 500); }
          updated++;
        } else {
          skipped++;
        }
      } else if (key && seen.has(key)) {
        skipped++;
      } else {
        maxSort++;
        inserts.push({ case_id: body.case_id, sort_order: maxSort, ...cols, spec: { tillbehor }, imported_snapshot: snap, cm_status: 'ej_paborjad' });
        if (key) seen.add(key);
      }
    }

    if (inserts.length) {
      const { error } = await admin.from('litteror').insert(inserts);
      if (error) { console.error('insert litteror failed', error); return json({ error: 'Kunde inte spara littera', detail: error.message }, 500); }
      added = inserts.length;
    }

    return json({ added, updated, skipped, total: items.length });
  } catch (e) {
    console.error('parse-littera-overview error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
