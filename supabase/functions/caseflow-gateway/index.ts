import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GATEWAY_SECRET = Deno.env.get('CASEFLOW_GATEWAY_SECRET')!;

const ALLOW_HEADERS = {
  ...corsHeaders,
  'Access-Control-Allow-Headers':
    (corsHeaders as Record<string, string>)['Access-Control-Allow-Headers'] +
    ', x-gateway-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...ALLOW_HEADERS, 'Content-Type': 'application/json' },
  });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Action = 'select' | 'update' | 'insert';

interface Body {
  action: Action;
  table: string;
  columns?: string;
  filters?: Record<string, unknown>;
  order_by?: { column: string; ascending?: boolean };
  limit?: number;
  payload?: Record<string, unknown>;
}

// Whitelist: vilka tabeller får göras vad med
const ALLOWED: Record<Action, string[]> = {
  select: ['cases', 'case_costs'],
  update: ['cases'],
  insert: ['case_events'],
};

function applyFilters(q: any, filters?: Record<string, unknown>) {
  if (!filters) return q;
  for (const [k, v] of Object.entries(filters)) {
    if (v === null) {
      q = q.is(k, null);
    } else if (typeof v === 'object' && v !== null && 'in' in (v as any)) {
      q = q.in(k, (v as any).in);
    } else if (typeof v === 'object' && v !== null && 'eq' in (v as any)) {
      q = q.eq(k, (v as any).eq);
    } else {
      q = q.eq(k, v);
    }
  }
  return q;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: ALLOW_HEADERS });
  }

  const provided = req.headers.get('x-gateway-secret');
  if (!provided || provided !== GATEWAY_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.action) return json({ error: 'Missing action' }, 400);
  if (!body.table) return json({ error: 'Missing table' }, 400);

  const allowedTables = ALLOWED[body.action];
  if (!allowedTables) {
    return json({ error: `Unknown action: ${body.action}` }, 400);
  }
  if (!allowedTables.includes(body.table)) {
    return json(
      { error: `Action '${body.action}' not allowed on table '${body.table}'` },
      403,
    );
  }

  try {
    switch (body.action) {
      case 'select': {
        let q = admin.from(body.table).select(body.columns || '*');
        q = applyFilters(q, body.filters);
        if (body.order_by) {
          q = q.order(body.order_by.column, {
            ascending: body.order_by.ascending ?? false,
          });
        }
        if (body.limit) q = q.limit(body.limit);
        const { data, error } = await q;
        if (error) throw error;
        return json({ data });
      }

      case 'update': {
        if (!body.filters || !body.payload) {
          return json({ error: 'filters and payload required' }, 400);
        }
        let q = admin.from(body.table).update(body.payload);
        q = applyFilters(q, body.filters);
        const { data, error } = await q.select();
        if (error) throw error;
        return json({ data });
      }

      case 'insert': {
        if (!body.payload) return json({ error: 'payload required' }, 400);
        const { data, error } = await admin
          .from(body.table)
          .insert(body.payload)
          .select();
        if (error) throw error;
        return json({ data });
      }

      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error('[caseflow-gateway] error:', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
