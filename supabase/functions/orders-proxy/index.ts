import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireStaff } from '../_shared/auth.ts';

const GATEWAY_URL = 'https://pjurpgqgqvabopoxkzja.supabase.co/functions/v1/orders-gateway';

// Server-side whitelist över tillåtna gateway-actions.
// Klienten får ALDRIG bestämma godtyckliga operationer eller tabeller —
// alla anrop ska mappa exakt mot en av dessa.
const ALLOWED_ACTIONS = new Set([
  'list_unlinked',
  'get_by_case_id',
  'list_by_case_ids',
  'update_date',
  'link_case',
  'unlink_case',
  'search',
  'list',
  'insert',
  'update',
  'check_duplicate',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Kräv inloggad staff-användare
    const auth = await requireStaff(req, corsHeaders);
    if (auth.response) return auth.response;

    // 2. Läs och validera bodyn server-side
    let parsed: any;
    try {
      parsed = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const action = typeof parsed?.action === 'string' ? parsed.action : '';
    if (!ALLOWED_ACTIONS.has(action)) {
      return json({ error: `Action '${action}' är inte tillåten` }, 403);
    }

    // 3. Hämta secret ENDAST från miljön — ingen fallback, ingen hårdkodning
    const gatewaySecret = Deno.env.get('ORDERS_GATEWAY_SECRET');
    if (!gatewaySecret) {
      console.error('[orders-proxy] ORDERS_GATEWAY_SECRET saknas');
      return json({ error: 'Gateway not configured' }, 500);
    }

    // 4. Bygg om bodyn så vi bara skickar det vi själva validerat
    const forwardBody = JSON.stringify({ ...parsed, action });

    const upstream = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gateway-secret': gatewaySecret,
      },
      body: forwardBody,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (err) {
    console.error('[orders-proxy] error:', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
