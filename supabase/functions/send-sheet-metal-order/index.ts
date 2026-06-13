const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

interface ProfileLength { length_mm: number; qty: number; }
interface ManualMeasurements {
  top_mm: number;
  vertical_mm: number;
  bottom_mm: number;
  drip_mm: number;
  upper_angle: string;
  lower_angle: string;
  bottom_angle: string;
}
interface OrderProfile {
  mode: 'manual' | 'image';
  type: 'l-profil' | 'underbleck';
  color: string;
  with_gables: boolean;
  lengths: ProfileLength[];
  measurements?: ManualMeasurements;
  image_data_url?: string; // base64 (compressed) for image mode
  image_filename?: string;
  image_description?: string;
}

interface RequestBody {
  to: string;
  cc?: string;
  delivery_address: string;
  montor_name: string;
  montor_phone: string;
  notes?: string;
  profiles: OrderProfile[];
  created_by: string;
}

function buildProfileSection(p: OrderProfile, idx: number): string {
  const typeLabel = p.type === 'l-profil' ? 'L-Profil' : 'Underbleck';
  const gables = p.with_gables ? 'Ja' : 'Nej';
  const lengthRows = p.lengths.map(l => `<tr>
    <td style="padding:6px 10px;border:1px solid #e5e7eb;">${l.length_mm} mm</td>
    <td style="padding:6px 10px;border:1px solid #e5e7eb;">${l.qty} st</td>
  </tr>`).join('');

  let measurementsBlock = '';
  if (p.mode === 'manual' && p.measurements) {
    const m = p.measurements;
    measurementsBlock = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 12px 0;">
      <tr><td style="padding:4px 10px;color:#6b7280;">Övre kant</td><td style="padding:4px 10px;">${m.top_mm} mm</td></tr>
      <tr><td style="padding:4px 10px;color:#6b7280;">Vertikal höjd</td><td style="padding:4px 10px;">${m.vertical_mm} mm</td></tr>
      <tr><td style="padding:4px 10px;color:#6b7280;">Horisontell botten</td><td style="padding:4px 10px;">${m.bottom_mm} mm</td></tr>
      <tr><td style="padding:4px 10px;color:#6b7280;">Droppläpp</td><td style="padding:4px 10px;">${m.drip_mm} mm</td></tr>
      <tr><td style="padding:4px 10px;color:#6b7280;">Övre vinkel</td><td style="padding:4px 10px;">${m.upper_angle}</td></tr>
      <tr><td style="padding:4px 10px;color:#6b7280;">Nedre vinkel</td><td style="padding:4px 10px;">${m.lower_angle}</td></tr>
      <tr><td style="padding:4px 10px;color:#6b7280;">Bottenvinkel</td><td style="padding:4px 10px;">${m.bottom_angle}</td></tr>
    </table>`;
  } else if (p.mode === 'image') {
    measurementsBlock = `
    <p style="margin:8px 0;font-size:14px;color:#1a1a1a;"><strong>Beskrivning:</strong> ${p.image_description || '(ingen beskrivning)'}</p>
    <p style="margin:8px 0;font-size:13px;color:#6b7280;font-style:italic;">→ Skiss bifogad i mailet (${p.image_filename || 'skiss.jpg'})</p>`;
  }

  return `
  <div style="margin:16px 0;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;">
    <h3 style="margin:0 0 8px 0;font-size:16px;color:#22C55E;">Profil ${idx + 1} — ${typeLabel}</h3>
    <p style="margin:4px 0;"><strong>Färg:</strong> ${p.color || '(ej angiven)'}</p>
    <p style="margin:4px 0;"><strong>Gavlar:</strong> ${gables}</p>
    ${measurementsBlock}
    <p style="margin:8px 0 4px 0;font-weight:bold;">Längder:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;background:#f3f4f6;text-align:left;">Längd</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;background:#f3f4f6;text-align:left;">Antal</th>
      </tr></thead>
      <tbody>${lengthRows}</tbody>
    </table>
  </div>`;
}

function buildEmailHtml(body: RequestBody): string {
  const profileSections = body.profiles.map((p, i) => buildProfileSection(p, i)).join('\n');
  return `<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#22C55E;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:bold;">SmartKlimat N3prenad — Beställning</td></tr>
<tr><td style="padding:24px 28px;">
<h1 style="margin:0 0 16px 0;font-size:22px;">Beställning L-Profil / Underbleck</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
  <tr><td style="padding:6px 0;color:#6b7280;width:160px;">Leveransadress:</td><td style="padding:6px 0;font-weight:bold;">${body.delivery_address}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Montör:</td><td style="padding:6px 0;">${body.montor_name} — Tel: ${body.montor_phone}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Antal profiler:</td><td style="padding:6px 0;">${body.profiles.length}</td></tr>
</table>
${profileSections}
${body.notes ? `<div style="margin-top:20px;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;"><strong>Övrig information:</strong><br/>${body.notes.replace(/\n/g, '<br/>')}</div>` : ''}
<p style="margin-top:32px;color:#6b7280;font-size:13px;">Med vänlig hälsning,<br/><strong>SmartKlimat N3prenad</strong></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function dataUrlToBase64(dataUrl: string): { base64: string; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { base64: dataUrl, contentType: 'image/jpeg' };
  return { contentType: match[1], base64: match[2] };
}
import { createClient } from 'npm:@supabase/supabase-js@2';
async function requireStaff(req: Request): Promise<Response | null> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
  if (error || !data?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: r } = await admin.from('user_roles').select('role,is_admin').eq('user_id', data.claims.sub).maybeSingle();
  if (!(r?.is_admin || r?.role === 'seller' || r?.role === 'coordinator')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const authFail = await requireStaff(req);
    if (authFail) return authFail;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) throw new Error('API keys not configured');

    const body: RequestBody = await req.json();

    if (!body.to || !body.delivery_address || !Array.isArray(body.profiles) || body.profiles.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = buildEmailHtml(body);

    // Build attachments from image-mode profiles
    const attachments: Array<{ filename: string; content: string }> = [];
    body.profiles.forEach((p, idx) => {
      if (p.mode === 'image' && p.image_data_url) {
        const { base64 } = dataUrlToBase64(p.image_data_url);
        const ext = (p.image_filename?.split('.').pop() || 'jpg').toLowerCase();
        attachments.push({
          filename: `profil-${idx + 1}-${p.image_filename || `skiss.${ext}`}`,
          content: base64,
        });
      }
    });

    const GLOBAL_CC = 'mf@malke.se';
    const ccList = Array.from(new Set([
      ...(body.cc ? [body.cc] : []),
      GLOBAL_CC,
    ].filter(Boolean)));

    const payload: Record<string, unknown> = {
      from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
      to: [body.to],
      subject: `Beställning L-Profil/Underbleck — ${body.delivery_address}`,
      html,
      cc: ccList,
    };
    if (attachments.length > 0) payload.attachments = attachments;

    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Resend error:', JSON.stringify(data));
      return new Response(JSON.stringify({ error: 'Send failed', details: data }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
