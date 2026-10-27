import { speechText } from './logic.ts';
// Buffered MP3 is intentional: the voice reply contract includes base64 audio.
export async function synthesizeSpeech(text: string, messageId: string | undefined, userId: string, adminClient: any, gateway: any) {
  const speech_text = speechText(text);
  if (!speech_text) return { speech_text, tts_skipped: 'error', tts_error: 'Svaret innehåller ingen text att läsa upp.' };
  const started = Date.now();
  let usageId: string | undefined;
  try {
    const { data, error } = await adminClient.rpc('ai_reserve_tts', { p_user_id: userId, p_characters: speech_text.length, p_message_id: messageId ?? null });
    if (error) throw new Error(error.message);
    if (data.skipped) return { speech_text, tts_skipped: data.skipped, ...(data.error ? { tts_error: data.error } : {}) };
    usageId = data.usage_id;
    const runtime = globalThis as typeof globalThis & { Deno?: { env: { get: (key: string) => string | undefined } } };
    const key = runtime.Deno?.env.get('LOVABLE_API_KEY');
    if (!key) throw new Error('Uppläsningen saknar konfiguration.');
    const response = await gateway.fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: data.model, input: speech_text, voice: data.voice, instructions: 'Tala svenska tydligt och naturligt.', response_format: 'mp3' }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const reason = body.message ?? body.error?.message ?? 'Uppläsningen kunde inte skapas.';
      if (response.status === 402 || response.status === 403) await adminClient.from('ai_settings').update({ gateway_error: reason, gateway_status: response.status }).eq('id', 1);
      throw new Error(reason);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || !(response.headers.get('content-type') ?? '').startsWith('audio/')) throw new Error('Uppläsningen gav inget ljud.');
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    await adminClient.from('ai_usage').update({ duration_ms: Date.now() - started }).eq('id', usageId);
    return { speech_text, audio_base64: btoa(binary), audio_mime: response.headers.get('content-type') ?? 'audio/mpeg' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Uppläsningen kunde inte skapas.';
    if (usageId) await adminClient.from('ai_usage').update({ status: 'error', error: reason, duration_ms: Date.now() - started }).eq('id', usageId);
    return { speech_text, tts_skipped: 'error', tts_error: reason };
  }
}