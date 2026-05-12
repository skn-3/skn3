const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du är en dataextraherare. Extrahera kunddata från text som kopierats från Mockfjärds Kundportal.

Regler:
- address ska vara "gatuadress, ort" (t.ex. "Hattmurklevägen 6, Lidingö")
- Om du ser "Montör kontrollmätning" eller "Montör installation" med "SK N3prenad" eller liknande, sätt team baserat på det (GVMO, Samy, Alex NBD, eller Jerk)
- Om du ser leveransstatus "190-Beställd" och montage är bokat, sätt status till "montage_bokat"
- Om du ser "Handpenning betald" eller "Handpenning fakturerad", sätt status till minst "godkand"
- TB-procenten finns ofta i prisberäkningen under "TG" eller "TB"
- order_value ska vara Total summa exkl moms om möjligt, annars inkl moms
- Samla KM-noteringar, fasadtyp, konstruktionstyp i notes
- Lämna tom sträng om data saknas`;

const TOOL = {
  type: "function",
  function: {
    name: "extract_case_data",
    description: "Returnera extraherade fält från kundportalstext",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        customer_email: { type: "string" },
        address: { type: "string" },
        offer_number: { type: "string" },
        order_value: { type: "string" },
        tb_percent: { type: "string" },
        status: {
          type: "string",
          enum: ["", "ny", "vantar_km", "km_bokad", "km_klar", "vantar_godkannande", "godkand", "i_produktion", "leverans_klar", "montage_bokat", "montage_klart", "fakturerad", "pausad"],
        },
        team: { type: "string" },
        km_date: { type: "string" },
        montage_date: { type: "string" },
        delivery_week: { type: "string" },
        notes: { type: "string" },
      },
      required: ["customer_name", "customer_phone", "customer_email", "address", "offer_number", "order_value", "tb_percent", "status", "team", "km_date", "montage_date", "delivery_week", "notes"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY saknas");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `TEXT:\n${text}` },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "extract_case_data" } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "AI rate limit – försök igen om en stund." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI-krediter slut. Lägg till krediter i Lovable Cloud." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("Inget verktygsanrop i AI-svaret");

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ data: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-customer-portal error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
