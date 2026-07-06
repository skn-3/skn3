import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-backup-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// === Tabeller som ska säkerhetskopieras (utöka här vid behov) ===
const TABLES: string[] = [
  'cases',
  'case_events',
  'case_costs',
  'visits',
  'deviations',
  'sheet_metal_orders',
  'user_calendar_tokens',
  'activity_log',
  'insight_history',
];

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const PAGE = 1000;

async function fetchAllRows(supabase: any, table: string): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) {
      // Om tabellen saknas helt – hoppa över istället för att haverera
      if (String(error.message || '').toLowerCase().includes('does not exist')) {
        console.warn(`Table ${table} not found, skipping`);
        return [];
      }
      throw new Error(`Failed reading ${table}: ${error.message}`);
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const expected = Deno.env.get('BACKUP_TRIGGER_SECRET');
    const provided = req.headers.get('x-backup-secret');
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) throw new Error('Email credentials missing');

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const exportedAt = new Date().toISOString();
    const dateStr = exportedAt.slice(0, 10);

    const tables: Record<string, any[]> = {};
    const manifest: Record<string, number> = {};
    let totalRows = 0;
    for (const t of TABLES) {
      const rows = await fetchAllRows(supabase, t);
      tables[t] = rows;
      manifest[t] = rows.length;
      totalRows += rows.length;
    }

    const payload = {
      exported_at: exportedAt,
      project: 'caseflow',
      manifest,
      tables,
    };

    // Zip
    const zip = new JSZip();
    zip.file(`caseflow-backup-${dateStr}.json`, JSON.stringify(payload, null, 2));
    const zipBytes: Uint8Array = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Ladda upp till privat bucket istället för mailbilaga (PII ska inte bo i mailkorgar)
    const path = `caseflow-backup-${dateStr}.zip`;
    const { error: upErr } = await supabase.storage
      .from('backups')
      .upload(path, zipBytes, { contentType: 'application/zip', upsert: true });
    if (upErr) throw new Error(`Backup upload failed: ${upErr.message}`);

    // Signerad nedladdningslänk, giltig 7 dagar
    const { data: signed, error: signErr } = await supabase.storage
      .from('backups')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signErr || !signed?.signedUrl) throw new Error(`Signed URL failed: ${signErr?.message ?? 'unknown'}`);

    // Gallring: radera backuper äldre än 90 dagar
    let pruned = 0;
    try {
      const { data: files } = await supabase.storage.from('backups').list('', { limit: 200 });
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const old = (files ?? [])
        .filter((f: any) => f.name?.startsWith('caseflow-backup-') && f.created_at && new Date(f.created_at).getTime() < cutoff)
        .map((f: any) => f.name);
      if (old.length > 0) {
        await supabase.storage.from('backups').remove(old);
        pruned = old.length;
      }
    } catch (e) {
      console.warn('Backup pruning failed (non-fatal):', e);
    }

    const manifestRows = TABLES
      .map((t) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${t}</td><td style="padding:4px 0;font-weight:600;">${manifest[t] ?? 0}</td></tr>`)
      .join('');

    const html = `<!DOCTYPE html><html lang="sv"><body style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<h2 style="color:#22C55E;margin:0 0 12px 0;">Databasbackup — CaseFlow</h2>
<p>Datum: <strong>${dateStr}</strong><br/>Totalt antal rader: <strong>${totalRows}</strong></p>
<table style="border-collapse:collapse;margin-top:8px;">${manifestRows}</table>
<p style="margin-top:20px;"><a href="${signed.signedUrl}" style="display:inline-block;background:#22C55E;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Ladda ner backup (zip)</a></p>
<p style="margin-top:12px;color:#6b7280;font-size:12px;">Länken gäller i 7 dagar. Filen innehåller personuppgifter — ladda inte upp den okrypterat och vidarebefordra inte detta mail.<br/>Backuper äldre än 90 dagar gallras automatiskt${pruned ? ` (raderade nu: ${pruned})` : ''}.</p>
</body></html>`;

    const emailResp = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
        to: ['mf@malke.se'],
        subject: `N3prenad — Databasbackup (CaseFlow) ${dateStr}`,
        html,
      }),
    });

    const emailData = await emailResp.json();
    if (!emailResp.ok) {
      console.error('Resend error:', JSON.stringify(emailData));
      return new Response(JSON.stringify({ error: 'Email send failed', status: emailResp.status }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fire-and-forget activity log (blockera inte svaret)
    supabase.from('activity_log').insert({
      actor_name: 'system',
      actor_role: 'system',
      action: 'backup_emailed',
      category: 'system',
      description: `Databasbackup mejlad till mf@malke.se (${TABLES.length} tabeller, ${totalRows} rader)`,
      metadata: { manifest, date: dateStr, zip_bytes: zipBytes.length },
    }).then(() => {}, (e: any) => console.error('log insert failed', e));

    return new Response(JSON.stringify({
      success: true,
      date: dateStr,
      tables: TABLES.length,
      rows: totalRows,
      zip_bytes: zipBytes.length,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('weekly-backup error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
