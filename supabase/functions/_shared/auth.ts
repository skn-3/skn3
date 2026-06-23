import { createClient } from 'npm:@supabase/supabase-js@2';

const defaultCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CorsHeaders = Record<string, string>;

export interface AuthSuccess {
  response: null;
  userId: string;
  claims: Record<string, unknown>;
  isAdmin: boolean;
  role: string | null;
}
export interface AuthFailure {
  response: Response;
}
export type AuthResult = AuthSuccess | AuthFailure;

function unauthorized(corsHeaders: CorsHeaders): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function forbidden(corsHeaders: CorsHeaders, message = 'Forbidden'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function authenticate(req: Request, corsHeaders: CorsHeaders) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { fail: unauthorized(corsHeaders) } as const;
  }
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
  if (error || !data?.claims?.sub) {
    return { fail: unauthorized(corsHeaders) } as const;
  }
  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: r } = await admin
    .from('user_roles')
    .select('role,is_admin')
    .eq('user_id', data.claims.sub)
    .maybeSingle();
  return {
    fail: null,
    claims: data.claims as Record<string, unknown>,
    userId: data.claims.sub as string,
    role: (r?.role as string | undefined) ?? null,
    isAdmin: Boolean(r?.is_admin),
  } as const;
}

/**
 * Releases the request to admin/seller/coordinator. Returns a Response (401/403)
 * on failure or null on success. Replicates the previous per-function requireStaff
 * gate exactly.
 */
export async function requireStaff(
  req: Request,
  corsHeaders: CorsHeaders = defaultCorsHeaders,
): Promise<AuthResult> {
  const res = await authenticate(req, corsHeaders);
  if (res.fail) return { response: res.fail };
  if (!(res.isAdmin || res.role === 'seller' || res.role === 'coordinator')) {
    return { response: forbidden(corsHeaders) };
  }
  return { response: null, userId: res.userId, claims: res.claims, isAdmin: res.isAdmin, role: res.role };
}

/**
 * Admin-only gate. Returns a Response (401/403) on failure or null on success.
 */
export async function requireAdmin(
  req: Request,
  corsHeaders: CorsHeaders = defaultCorsHeaders,
): Promise<AuthResult> {
  const res = await authenticate(req, corsHeaders);
  if (res.fail) return { response: res.fail };
  if (!res.isAdmin) {
    return { response: forbidden(corsHeaders, 'Forbidden (admin only)') };
  }
  return { response: null, userId: res.userId, claims: res.claims, isAdmin: true, role: res.role };
}
