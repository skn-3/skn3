// chat-push: Web Push för chattmeddelanden.
// - config  (inloggad): VAPID public key; skapar nyckelparet en gång (atomiskt) och registrerar återanropet.
// - test    (inloggad): testnotis till anroparens egna enheter.
// - message (bara med push_runtime.callback_bearer, anropas av triggern på messages): skickar till mottagarna.
// Den privata nyckeln lämnar aldrig servern och loggas aldrig.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.25.76';
import { ApplicationServer, Urgency, exportApplicationServerKey, exportVapidKeys, generateVapidKeys, importVapidKeys, type ExportedVapidKeys } from 'jsr:@negrel/webpush@0.5.0';
import { requireAuth } from '../_shared/auth.ts';
import {
  PUSH_DELAY_MS, PUSH_TTL_SECONDS, bearerMatches, classifyPushStatus, isUuid, messagePayload, pushRecipients, testPayload,
  type PushConversation, type PushMember, type PushMessage, type PushOutcome, type PushPayload,
} from './logic.ts';

const VAPID_SUBJECT = 'https://smartklimatentreprenad.com';
const Body = z.object({ action: z.enum(['config', 'test', 'message']), message_id: z.string().optional() });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface Runtime { vapid_public_key: string | null; vapid_private_jwk: ExportedVapidKeys | null; callback_url: string | null; callback_bearer: string | null; enabled: boolean }
interface SubscriptionRow { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number }

async function readRuntime(admin: SupabaseClient): Promise<Runtime> {
  await admin.from('push_runtime').upsert({ id: 1 }, { onConflict: 'id', ignoreDuplicates: true });
  const { data, error } = await admin.from('push_runtime').select('vapid_public_key,vapid_private_jwk,callback_url,callback_bearer,enabled').eq('id', 1).single();
  if (error) throw new Error('push_runtime kunde inte läsas');
  return data as Runtime;
}

function randomBearer(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Skapar nyckelparet en gång. Två samtidiga anrop: bara den första uppdateringen vinner, den andra läser vinnarens nyckel. */
async function ensureKeys(admin: SupabaseClient, runtime: Runtime): Promise<string> {
  if (runtime.vapid_public_key && runtime.vapid_private_jwk) return runtime.vapid_public_key;
  const keys = await generateVapidKeys({ extractable: true });
  const exported = await exportVapidKeys(keys);
  const publicKey = await exportApplicationServerKey(keys);
  const { data } = await admin.from('push_runtime')
    .update({ vapid_public_key: publicKey, vapid_private_jwk: exported, updated_at: new Date().toISOString() })
    .eq('id', 1).is('vapid_public_key', null).select('vapid_public_key');
  if (data && data.length === 1) return publicKey;
  const again = await readRuntime(admin);
  if (!again.vapid_public_key) throw new Error('VAPID-nyckeln kunde inte sparas');
  return again.vapid_public_key;
}

/** Registrerar återanropet som triggern använder. Bearern slumpas en gång och behålls. */
async function ensureCallback(admin: SupabaseClient, runtime: Runtime, url: string) {
  const callbackUrl = `${url}/functions/v1/chat-push`;
  if (runtime.callback_url === callbackUrl && runtime.callback_bearer) return;
  await admin.from('push_runtime').update({ callback_url: callbackUrl, updated_at: new Date().toISOString() }).eq('id', 1);
  if (!runtime.callback_bearer) await admin.from('push_runtime').update({ callback_bearer: randomBearer() }).eq('id', 1).is('callback_bearer', null);
}

async function send(server: ApplicationServer, sub: SubscriptionRow, payload: PushPayload): Promise<PushOutcome> {
  try {
    const subscriber = server.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
    await subscriber.pushTextMessage(JSON.stringify(payload), { ttl: PUSH_TTL_SECONDS, urgency: Urgency.High });
    return 'ok';
  } catch (e) {
    const status = (e as { response?: Response })?.response?.status ?? 0;
    try { await (e as { response?: Response })?.response?.body?.cancel(); } catch { /* ignoreras */ }
    return classifyPushStatus(status);
  }
}

/** Skickar till en lista prenumerationer och sköter raderna: 404/410 tas bort, andra fel räknas upp, lyckat sätter tiden. */
async function deliver(admin: SupabaseClient, runtime: Runtime, items: { sub: SubscriptionRow; payload: PushPayload }[]) {
  const result = { sent: 0, removed: 0, failed: 0 };
  if (!items.length || !runtime.vapid_private_jwk) return result;
  const vapidKeys = await importVapidKeys(runtime.vapid_private_jwk);
  const server = await ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys });
  await Promise.all(items.map(async ({ sub, payload }) => {
    const outcome = await send(server, sub, payload);
    if (outcome === 'ok') {
      result.sent++;
      await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', sub.id);
    } else if (outcome === 'gone') {
      result.removed++;
      await admin.from('push_subscriptions').delete().eq('id', sub.id).eq('endpoint', sub.endpoint);
    } else {
      result.failed++;
      await admin.from('push_subscriptions').update({ failure_count: (sub.failure_count ?? 0) + 1 }).eq('id', sub.id);
    }
  }));
  return result;
}

async function unreadCounts(admin: SupabaseClient, userIds: string[]): Promise<Map<string, number>> {
  if (!userIds.length) return new Map();
  const { data } = await admin.rpc('push_unread_counts', { p_user_ids: userIds });
  return new Map(((data ?? []) as { user_id: string; unread: number }[]).map(r => [r.user_id, Number(r.unread) || 0]));
}

async function handleMessage(admin: SupabaseClient, runtime: Runtime, messageId: string) {
  if (!runtime.enabled) return { skipped: 'disabled' };
  await new Promise(r => setTimeout(r, PUSH_DELAY_MS));
  const { data: message } = await admin.from('messages').select('id,conversation_id,sender_id,body,created_at,attachments,case_id').eq('id', messageId).maybeSingle();
  if (!message) return { skipped: 'no_message' };
  const { data: conversation } = await admin.from('conversations').select('id,kind,channel_key,team_user_id,title,archived_at').eq('id', message.conversation_id).maybeSingle();
  if (!conversation || conversation.archived_at) return { skipped: 'no_conversation' };
  const { data: memberRows } = await admin.from('conversation_members').select('user_id,last_read_at').eq('conversation_id', message.conversation_id);
  const members = (memberRows ?? []) as PushMember[];
  const recipients = pushRecipients(members, message as PushMessage);
  if (!recipients.length) return { recipients: 0, sent: 0, removed: 0, failed: 0 };
  const { data: subs } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth,failure_count').in('user_id', recipients);
  const subscriptions = (subs ?? []) as SubscriptionRow[];
  if (!subscriptions.length) return { recipients: recipients.length, sent: 0, removed: 0, failed: 0 };
  const memberIds = members.map(m => m.user_id);
  const nameIds = [...new Set([...memberIds, message.sender_id, ...(conversation.team_user_id ? [conversation.team_user_id] : [])])];
  const { data: profiles } = await admin.from('profiles').select('id,name').in('id', nameIds);
  const names = new Map(((profiles ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]));
  const unread = await unreadCounts(admin, [...new Set(subscriptions.map(s => s.user_id))]);
  const items = subscriptions.map(sub => ({
    sub,
    payload: messagePayload({
      conversation: conversation as PushConversation, memberIds, message: message as PushMessage,
      senderName: names.get(message.sender_id), recipientId: sub.user_id, names, unread: unread.get(sub.user_id) ?? 0,
    }),
  }));
  const result = await deliver(admin, runtime, items);
  return { recipients: recipients.length, devices: subscriptions.length, ...result };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Använd POST' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Cloud-konfiguration saknas' }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  const authorization = req.headers.get('Authorization');

  try {
    if (parsed.success && parsed.data.action === 'message') {
      const runtime = await readRuntime(admin);
      if (!bearerMatches(authorization, runtime.callback_bearer)) return json({ error: 'Unauthorized' }, 401);
      if (!isUuid(parsed.data.message_id)) return json({ error: 'message_id saknas' }, 400);
      return json(await handleMessage(admin, runtime, parsed.data.message_id));
    }

    const auth = await requireAuth(req, corsHeaders);
    if (auth.response) return auth.response;
    if (!parsed.success) return json({ error: 'Ogiltig begäran' }, 400);
    const runtime = await readRuntime(admin);

    if (parsed.data.action === 'config') {
      const publicKey = await ensureKeys(admin, runtime);
      await ensureCallback(admin, runtime, url);
      return json({ publicKey, enabled: runtime.enabled });
    }

    // test: anroparens egna enheter.
    const fresh = runtime.vapid_private_jwk ? runtime : await readRuntime(admin);
    const { data: subs } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth,failure_count').eq('user_id', auth.userId);
    const subscriptions = (subs ?? []) as SubscriptionRow[];
    if (!subscriptions.length) return json({ devices: 0, sent: 0, removed: 0, failed: 0 });
    const unread = (await unreadCounts(admin, [auth.userId])).get(auth.userId) ?? 0;
    const result = await deliver(admin, fresh, subscriptions.map(sub => ({ sub, payload: testPayload(unread) })));
    return json({ devices: subscriptions.length, ...result });
  } catch (e) {
    console.error('chat-push failed', e instanceof Error ? e.message : 'okänt fel');
    return json({ error: 'Något gick fel' }, 500);
  }
});
