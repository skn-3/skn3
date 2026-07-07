// Admin-only: återställ en användares 6-siffriga PIN.
// Genererar ny PIN i samma format som seed-users (6 slumpsiffror) och
// uppdaterar Supabase Auth-användaren via admin API (samma "hashning" som seed-users:
// Supabase Auth lagrar lösenordet, vi sätter klartext-PIN som password).
// Sätter must_change_pin=true så användaren tvingas välja en personlig PIN vid nästa login.
// Loggar VEM som återställde VEMS PIN i activity_log — ALDRIG själva PIN-värdet.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isPredictablePin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false;
  const d = pin.split("").map(Number);
  if (d.every((x) => x === d[0])) return true; // 111111, 000000
  const diffs = d.slice(1).map((v, i) => (v - d[i] + 10) % 10);
  if (diffs.every((x) => x === 1)) return true; // 123456
  if (diffs.every((x) => x === 9)) return true; // 654321
  if (pin.slice(0, 3) === pin.slice(3, 6)) return true; // 123123
  return false;
}

function generatePin(): string {
  // Loopa tills vi får en icke-förutsägbar kod. Praktiskt taget alltid första försöket.
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    let s = "";
    for (let i = 0; i < 6; i++) s += (bytes[i] % 10).toString();
    if (!isPredictablePin(s)) return s;
  }
  // Fallback som garanterat inte matchar mönstren
  return "918273";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side admin-koll via SECURITY DEFINER-funktionen
    const { data: isAdmin, error: adminErr } = await userClient.rpc("auth_is_admin");
    if (adminErr || isAdmin !== true) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const targetUserId = body?.target_user_id;
    if (!targetUserId || typeof targetUserId !== "string") {
      return new Response(JSON.stringify({ error: "target_user_id krävs" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Hämta målets namn för loggning
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("name")
      .eq("id", targetUserId)
      .maybeSingle();
    if (!targetProfile) {
      return new Response(JSON.stringify({ error: "användare saknas" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newPin = generatePin();

    // Sätt nytt lösenord (samma metod som seed-users använder för password)
    const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
      password: newPin,
    });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message, step: 'updateUserById' }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tvinga personligt PIN-byte vid nästa login
    await admin.from("profiles").update({ must_change_pin: true }).eq("id", targetUserId);

    // Hämta admin-namn för actor_name (matchar auth_user_name())
    const adminUserId = claimsData.claims.sub as string;
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("name")
      .eq("id", adminUserId)
      .maybeSingle();
    const actorName = adminProfile?.name ?? "admin";

    // Logga — ALDRIG själva PIN-värdet. Misslyckad logg får ALDRIG stoppa återställningen.
    try {
      await admin.from("activity_log").insert({
        actor_name: actorName,
        actor_role: "seller",
        action: "pin_reset",
        category: "auth",
        description: `${actorName} återställde PIN-kod för ${targetProfile.name}`,
        metadata: { target_user_id: targetUserId, target_name: targetProfile.name },
      });
    } catch (logErr) {
      console.error("activity_log insert failed (ignored):", logErr);
    }

    return new Response(JSON.stringify({ ok: true, pin: newPin }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, step: 'unhandled' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
