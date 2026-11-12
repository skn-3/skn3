// kalkyl-ai: AI-kontrollen i kalkylen (tolka underlag, granska kalkylen, fråga om offerten).
// Bara inloggad personal (admin, säljare, koordinator). Samma användningslogg (ai_usage) och samma dagstak
// (ai_settings.daily_message_limit via ai_reserve_kalkyl) som N3prenad-AI. Modellen är ai_settings.model (kalkylAiModel). Foton och PDF:er sparas aldrig.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireStaff } from '../_shared/auth.ts';
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayResponseHeaders } from './run-id.ts';
import {
  buildMessages, checkKalkylAiRequest, gatewayErrorCode, KALKYL_AI_ERRORS, kalkylAiModel, parseModelJson, pausesGateway, replyFor, requestUsage,
  type KalkylAiErrorCode,
} from './logic.ts';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const gateway = createLovableAiGatewayRunIdFetch();
  const respond = (data: unknown, status = 200) => {
    const runId = gateway.getRunId();
    return new Response(JSON.stringify(data), {
      status,
      headers: getLovableAiGatewayResponseHeaders(runId ? { 'X-Lovable-AIG-Run-ID': runId } : undefined, { ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  };
  const fail = (code: KalkylAiErrorCode, message?: string) => respond({ error_code: code, message: message ?? KALKYL_AI_ERRORS[code].message }, KALKYL_AI_ERRORS[code].status);
  if (req.method !== 'POST') return fail('validation');

  const auth = await requireStaff(req, corsHeaders);
  if (auth.response) return fail(auth.response.status === 403 ? 'forbidden' : 'unauthorized');

  const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), key = Deno.env.get('LOVABLE_API_KEY');
  if (!url || !service || !key) return fail('configuration');

  const checked = checkKalkylAiRequest(await req.json().catch(() => null));
  if (!checked.ok) return fail(checked.code, checked.message);
  const request = checked.request;
  const kind = `kalkyl_${request.mode}`;
  const usage = requestUsage(request);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const started = Date.now();
  let usageId: string | null = null;
  let prompt_tokens = 0, completion_tokens = 0;
  const finish = async (status: 'ok' | 'error', error?: string) => {
    if (!usageId) return;
    const { error: e } = await admin.from('ai_usage').update({ status, error: error ?? null, prompt_tokens, completion_tokens, duration_ms: Date.now() - started }).eq('id', usageId);
    if (e) console.error('kalkyl-ai: loggning misslyckades', e.message);
  };

  try {
    const { data: settings, error: settingsError } = await admin.from('ai_settings').select('enabled,gateway_error,model').eq('id', 1).single();
    if (settingsError) throw new Error(settingsError.message);
    if (settings.gateway_error) return fail('paused', settings.gateway_error);
    const model = kalkylAiModel(settings.model);

    // Atomisk reservation mot samma dagstak som N3prenad-AI; raden i ai_usage är också loggposten.
    const { data: reserved, error: reserveError } = await admin.rpc('ai_reserve_kalkyl', {
      p_user_id: auth.userId, p_kind: kind, p_model: model, p_input_chars: usage.input_chars, p_image_count: usage.image_count, p_pdf_count: usage.pdf_count,
    });
    if (reserveError) throw new Error(reserveError.message);
    if (reserved?.status === 'limit') return fail('limit');
    if (reserved?.status === 'disabled') return fail('disabled');
    usageId = reserved?.usage_id ?? null;

    const response = await gateway.fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({ model, messages: buildMessages(request), response_format: { type: 'json_object' } }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const code = gatewayErrorCode(response.status);
      const detail = String(body?.message ?? body?.error?.message ?? `HTTP ${response.status}`).slice(0, 500);
      if (pausesGateway(code)) {
        await admin.from('ai_settings').update({ gateway_error: KALKYL_AI_ERRORS[code].message, gateway_status: response.status }).eq('id', 1);
      }
      await finish('error', `gateway ${response.status}: ${detail}`);
      return fail(code);
    }
    const data = await response.json();
    prompt_tokens = Number(data?.usage?.prompt_tokens) || 0;
    completion_tokens = Number(data?.usage?.completion_tokens) || 0;
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content);
    if (!parsed) { await finish('error', 'Svaret var inte JSON'); return fail('invalid_reply'); }
    await finish('ok');
    return respond({ mode: request.mode, ...replyFor(request.mode, parsed), usage: { prompt_tokens, completion_tokens } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('kalkyl-ai', message);
    await finish('error', message.slice(0, 500));
    return fail('gateway');
  }
});
