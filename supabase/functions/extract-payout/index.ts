// Edge function: extract-payout
// Accepts a Mockfjärds payout PDF (base64) and returns extracted structured data
// using the Lovable AI Gateway (Google Gemini).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `Du extraherar fakturadata från en svensk PDF. Det kan vara:
(A) en Mockfjärds-utbetalning (intäkt till oss),
(B) vår egen faktura/A-order till en montör (utgift), eller
(C) en plåtfaktura från plåtslagaren (t.ex. Byggplåtar) — utgift med vanlig moms,
    där fältet "Ert ordernummer" innehåller jobbets LEVERANSADRESS (gata + nummer),
    INTE ett ordernummer. Mottagaradressen är vårt eget bolag (Segeltorp) och ska
    INTE användas. Plocka "Ert ordernummer" till job_address.
(D) en MONTÖRS-/ENTREPRENÖRSFAKTURA ställd TILL oss (Smartklimat / n3prenad),
    omvänd betalningsskyldighet (omvänd moms). Här är fakturan en SAMLINGSFAKTURA
    där VARJE RAD vanligtvis innehåller en svensk gatuadress (gata + nummer) någonstans
    i benämningen — ibland först ("Månbergsvägen 26 Material"), ibland sist
    ("Konsoller Svampstigen 105"). Vissa rader saknar adress (t.ex. "Servicebil")
    eller saknar husnummer ("Elsbyvägen vällingby"). För VARJE rad: plocka ut radens
    jobbadress (gata + nummer om båda finns, annars bara gatan, annars null) till
    line_items[].job_address. Lägg själva beskrivningstexten (helst utan adressen)
    i name/note som vanligt. För typ D är "att betala" = ex moms (omvänd moms).

Returnera ENBART ett JSON-objekt — ingen text, ingen markdown, inga kodblock — med EXAKT denna struktur:

{
  "invoice_number": string|null,
  "invoice_date": "YYYY-MM-DD"|null,
  "customer_name": string|null,
  "job_address": string|null,
  "currency": string,
  "total_amount": number|null,
  "total_amount_excl_vat": number|null,
  "total_amount_incl_vat": number|null,
  "line_items": [
    {
      "order_number": string|null,
      "customer_name": string|null,
      "job_address": string|null,
      "name": string|null,
      "note": string|null,
      "qty": number|null,
      "unit_price": number|null,
      "amount": number|null
    }
  ]
}

VIKTIGT om namn:
- Slutkundens namn ska in i customer_name (både per rad och top-level). Det är slutkunden
  vars adress jobbet gäller — INTE fakturans mottagare (t.ex. "Mockfjärds Fönster AB" eller
  vårt eget bolag "Smartklimat Entreprenad AB" / "n3prenad AB" / "Byggplåtar").
- I Mockfjärds-utbetalningar: slutkundens namn står i radernas "Namn"-kolumn. Använd det.
- I våra egna fakturor/A-ordrar: slutkunden står vanligen som "Avser"/"Objekt"/"Kund" på raderna
  eller i radbeskrivningen (adress/efternamn). Plocka ut det bästa namnet du kan.
- I plåtfakturor och montörsfakturor finns ofta inget slutkundsnamn — låt customer_name vara null då.
- För top-level customer_name: använd första radens customer_name, eller null om det saknas.
  Skriv ALDRIG in vårt eller Mockfjärds/Byggplåtars bolagsnamn här.

job_address (top-level): ENDAST för plåtfakturor (C) — kopiera "Ert ordernummer" exakt.
Övriga typer top-level: null. För typ D ligger adressen istället per rad i line_items[].job_address.

Belopp:
- total_amount_excl_vat = raden "Exkl. moms" (inkluderar frakt).
- total_amount_incl_vat = totalen att betala (inkl. moms).
- För plåtfakturor (C): total_amount = total_amount_excl_vat (kostnaden ex moms).
- För montörsfakturor (D, omvänd moms): total_amount = total_amount_excl_vat (att betala = ex moms).
- För andra typer: total_amount = den naturliga totalen på fakturan.

Övriga regler:
- "Fsg. order" / "Order"-kolumnen (eller motsvarande ordernummer per rad) → line_items[].order_number.
- line_items[].name = produkt-/tjänstebenämning (t.ex. "Fönster", "Montage", "A-order", "Material").
- Belopp ska vara tal (ej strängar), använd punkt som decimaltecken.
- Tolka svenska tusentalsavgränsare (mellanslag) korrekt.
- invoice_date i ISO-format YYYY-MM-DD.
- currency default "SEK".
- Om något fält saknas, returnera null.`;

interface ExtractRequest {
  file_base64: string;
  mime_type?: string;
  file_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
              { type: 'text', text: 'Extrahera datan från denna PDF och returnera JSON enligt schemat.' },
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

    // Strip code fences if any
    const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('JSON parse failed', e, content);
      return json({ error: 'Kunde inte tolka AI-svaret som JSON', raw: content.slice(0, 500) }, 422);
    }

    // Normalize
    const line_items = Array.isArray(parsed.line_items) ? parsed.line_items : [];
    const order_numbers: string[] = Array.from(
      new Set(
        line_items
          .map((li: any) => (li?.order_number ?? '').toString().trim())
          .filter((s: string) => !!s),
      ),
    );

    const normalizedLines = line_items.map((li: any) => ({
      order_number: li?.order_number ?? null,
      customer_name: li?.customer_name ?? null,
      name: li?.name ?? null,
      note: li?.note ?? null,
      qty: li?.qty != null ? Number(li.qty) : null,
      unit_price: li?.unit_price != null ? Number(li.unit_price) : null,
      amount: li?.amount != null ? Number(li.amount) : null,
    }));

    // Safety: if top-level customer_name looks like Mockfjärds itself, override
    // with first line's customer_name (slutkunden).
    let topCustomer: string | null = parsed.customer_name ?? null;
    const looksLikeOwnOrMockfjards = (s: string | null) =>
      !!s && /(mockfj[aä]rds|smartklimat|n3prenad|byggpl[aå]t)/i.test(s);
    if (!topCustomer || looksLikeOwnOrMockfjards(topCustomer)) {
      const firstLineCustomer = normalizedLines.find((l: any) => l.customer_name)?.customer_name ?? null;
      topCustomer = firstLineCustomer;
    }

    const totalExcl = parsed.total_amount_excl_vat != null ? Number(parsed.total_amount_excl_vat) : null;
    const totalIncl = parsed.total_amount_incl_vat != null ? Number(parsed.total_amount_incl_vat) : null;
    const totalAmount = parsed.total_amount != null ? Number(parsed.total_amount) : null;

    return json({
      invoice_number: parsed.invoice_number ?? null,
      invoice_date: parsed.invoice_date ?? null,
      customer_name: topCustomer,
      job_address: parsed.job_address ?? null,
      currency: parsed.currency ?? 'SEK',
      total_amount: totalAmount,
      total_amount_excl_vat: totalExcl,
      total_amount_incl_vat: totalIncl,
      line_items: normalizedLines,
      order_numbers,
    }, 200);
  } catch (e) {
    console.error('extract-payout error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
