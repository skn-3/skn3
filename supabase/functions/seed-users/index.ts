// Idempotent one-shot seeder for Phase 1 auth migration.
// Creates an auth user + profiles row for each team member if missing.
// Protected by BACKUP_TRIGGER_SECRET (re-used). NEVER returns PINs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-backup-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SeedUser {
  name: string;
  role: "seller" | "montor" | "coordinator";
  is_admin: boolean;
  pin: string; // 4 digits — will be padded with "00"
}

const SEED_USERS: SeedUser[] = [
  { name: "Daniel Malke",      role: "seller",      is_admin: true,  pin: "1234" },
  { name: "Gabriel Hanna",     role: "seller",      is_admin: false, pin: "5678" },
  { name: "GVMO",              role: "montor",      is_admin: false, pin: "1111" },
  { name: "Samy",              role: "montor",      is_admin: false, pin: "2222" },
  { name: "Alex NBD",          role: "montor",      is_admin: false, pin: "3333" },
  { name: "Jerk",              role: "montor",      is_admin: false, pin: "4444" },
  { name: "Villaspecialisten", role: "montor",      is_admin: false, pin: "5555" },
  { name: "Mirna Malke",       role: "coordinator", is_admin: false, pin: "6666" },
];

function deriveLoginEmail(name: string): string {
  const local = name.trim().toLowerCase().replace(/\s+/g, ".");
  return `${local}@caseflow.local`;
}

function padPin(pin: string): string {
  return (pin + "00").slice(0, 6);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("BACKUP_TRIGGER_SECRET");
  const got = req.headers.get("x-backup-secret");
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const result: Array<{ name: string; status: string }> = [];

  for (const u of SEED_USERS) {
    const email = deriveLoginEmail(u.name);

    // Already in profiles? skip.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("login_email", email)
      .maybeSingle();
    if (existingProfile) {
      result.push({ name: u.name, status: "skipped (profile exists)" });
      continue;
    }

    // Check if auth user already exists (across pages of users)
    let authUserId: string | null = null;
    for (let page = 1; page <= 20 && !authUserId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const match = data.users.find((x) => x.email?.toLowerCase() === email);
      if (match) authUserId = match.id;
      if (data.users.length < 200) break;
    }

    if (!authUserId) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: padPin(u.pin),
        email_confirm: true,
        user_metadata: { name: u.name, role: u.role },
      });
      if (error || !data.user) {
        result.push({ name: u.name, status: `auth error: ${error?.message ?? "unknown"}` });
        continue;
      }
      authUserId = data.user.id;
    }

    const { error: insErr } = await admin.from("profiles").insert({
      id: authUserId,
      name: u.name,
      role: u.role,
      is_admin: u.is_admin,
      login_email: email,
      must_change_pin: true,
    });
    if (insErr) {
      result.push({ name: u.name, status: `profile error: ${insErr.message}` });
      continue;
    }
    result.push({ name: u.name, status: "created" });
  }

  return new Response(JSON.stringify({ ok: true, result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
